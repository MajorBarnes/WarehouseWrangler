<?php
/**
 * WarehouseWrangler - Recall Shipment
 * 
 * Recalls a sent shipment - reverses all inventory changes
 * Returns boxes back to cartons and marks shipment as recalled
 * 
 * @method POST
 * @body JSON: { "shipment_id": int, "notes": string (optional) }
 * @returns JSON: { "success": bool, "message": string, "summary": object }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Get token from Authorization header
    $authHeader = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? '';
    }
    
    if (empty($authHeader) || !preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        sendJSON(['success' => false, 'error' => 'No authorization token provided'], 401);
    }
    
    $token = $matches[1];
    
    // Validate token
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendJSON(['success' => false, 'error' => 'Invalid token format'], 401);
    }
    
    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    
    // Check token expiration
    if ($payload['exp'] < time()) {
        sendJSON(['success' => false, 'error' => 'Token expired'], 401);
    }
    
    // Get user ID from token
    $userId = $payload['user_id'] ?? null;
    
    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        sendJSON(['success' => false, 'error' => 'Invalid JSON data'], 400);
    }
    
    // Validate required fields
    if (!isset($data['shipment_id']) || empty($data['shipment_id'])) {
        sendJSON(['success' => false, 'error' => 'Shipment ID is required'], 400);
    }
    
    $shipmentId = (int)$data['shipment_id'];
    $notes = isset($data['notes']) ? trim($data['notes']) : 'Shipment recalled';
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // 1. Check if shipment exists and is in 'sent' status
        $shipmentSql = "
            SELECT shipment_id, shipment_reference, status 
            FROM amazon_shipments 
            WHERE shipment_id = ?
        ";
        $stmt = $db->prepare($shipmentSql);
        $stmt->execute([$shipmentId]);
        $shipment = $stmt->fetch();
        
        if (!$shipment) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment not found'], 404);
        }
        
        if ($shipment['status'] !== 'sent') {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Can only recall shipments with status "sent"'], 400);
        }
        
        // 2. Get all shipment contents
        $contentsSql = "
            SELECT 
                sc.shipment_content_id,
                sc.carton_id,
                sc.product_id,
                sc.boxes_sent,
                c.carton_number,
                c.status as carton_status,
                p.product_name
            FROM shipment_contents sc
            JOIN cartons c ON sc.carton_id = c.carton_id
            JOIN products p ON sc.product_id = p.product_id
            WHERE sc.shipment_id = ?
        ";
        $stmt = $db->prepare($contentsSql);
        $stmt->execute([$shipmentId]);
        $contents = $stmt->fetchAll();
        
        if (empty($contents)) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment has no contents to recall'], 400);
        }
        
        // 3. Return boxes to cartons
        $totalBoxesRecalled = 0;
        $cartonsAffected = [];
        $productsAffected = [];
        
        foreach ($contents as $content) {
            $cartonId = $content['carton_id'];
            $productId = $content['product_id'];
            $boxesToRecall = $content['boxes_sent'];
            
            // Update carton_contents:
            // - Increase boxes_current
            // - Decrease boxes_sent_to_amazon
            $updateContentSql = "
                UPDATE carton_contents 
                SET 
                    boxes_current = boxes_current + ?,
                    boxes_sent_to_amazon = boxes_sent_to_amazon - ?
                WHERE carton_id = ? AND product_id = ?
            ";
            $stmt = $db->prepare($updateContentSql);
            $stmt->execute([$boxesToRecall, $boxesToRecall, $cartonId, $productId]);
            
            // Log movement in box_movement_log
            $logSql = "
                INSERT INTO box_movement_log 
                (carton_id, product_id, movement_type, boxes, shipment_id, notes, created_by, created_at)
                VALUES (?, ?, 'recalled', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ";
            $stmt = $db->prepare($logSql);
            $stmt->execute([$cartonId, $productId, $boxesToRecall, $shipmentId, $notes, $userId]);
            
            // If carton was marked as empty, change back to in stock
            if ($content['carton_status'] === 'empty') {
                $updateCartonSql = "UPDATE cartons SET status = 'in stock' WHERE carton_id = ?";
                $stmt = $db->prepare($updateCartonSql);
                $stmt->execute([$cartonId]);
            }
            
            // Track totals
            $totalBoxesRecalled += $boxesToRecall;
            $cartonsAffected[$cartonId] = $content['carton_number'];
            $productsAffected[$productId] = $content['product_name'];
        }
        
        // 4. Update shipment status to 'recalled'
        $updateShipmentSql = "
            UPDATE amazon_shipments 
            SET status = 'recalled', notes = CONCAT(COALESCE(notes, ''), '\n\nRecalled: ', ?), updated_at = CURRENT_TIMESTAMP 
            WHERE shipment_id = ?
        ";
        $stmt = $db->prepare($updateShipmentSql);
        $stmt->execute([$notes, $shipmentId]);
        
        // 5. Commit transaction
        $db->commit();
        
        // Prepare summary
        $summary = [
            'shipment_id' => $shipmentId,
            'shipment_reference' => $shipment['shipment_reference'],
            'total_boxes_recalled' => $totalBoxesRecalled,
            'cartons_affected' => count($cartonsAffected),
            'products_affected' => count($productsAffected),
            'carton_list' => array_values($cartonsAffected),
            'product_list' => array_values($productsAffected)
        ];
        
        sendJSON([
            'success' => true,
            'message' => "Shipment {$shipment['shipment_reference']} recalled successfully! Boxes returned to cartons.",
            'summary' => $summary
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Recall shipment error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>