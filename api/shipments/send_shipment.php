<?php
/**
 * WarehouseWrangler - Send Shipment
 * 
 * Executes the shipment - updates inventory, logs movements, changes status to 'sent'
 * This is the main business logic for sending boxes to Amazon
 * 
 * @method POST
 * @body JSON: { "shipment_id": int }
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
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // 1. Check if shipment exists and is in 'prepared' status
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
        
        if ($shipment['status'] !== 'prepared') {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment is not in prepared status. Cannot send.'], 400);
        }
        
        // 2. Get all shipment contents
        $contentsSql = "
            SELECT 
                sc.shipment_content_id,
                sc.carton_id,
                sc.product_id,
                sc.boxes_sent,
                c.carton_number,
                cc.boxes_current,
                p.product_name
            FROM shipment_contents sc
            JOIN cartons c ON sc.carton_id = c.carton_id
            JOIN carton_contents cc ON sc.carton_id = cc.carton_id AND sc.product_id = cc.product_id
            JOIN products p ON sc.product_id = p.product_id
            WHERE sc.shipment_id = ?
        ";
        $stmt = $db->prepare($contentsSql);
        $stmt->execute([$shipmentId]);
        $contents = $stmt->fetchAll();
        
        if (empty($contents)) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment has no contents. Add boxes before sending.'], 400);
        }
        
        // 3. Validate all boxes are still available and update inventory
        $totalBoxesSent = 0;
        $cartonsAffected = [];
        $productsAffected = [];
        
        foreach ($contents as $content) {
            $cartonId = $content['carton_id'];
            $productId = $content['product_id'];
            $boxesToSend = $content['boxes_sent'];
            $boxesCurrent = $content['boxes_current'];
            
            // Check if enough boxes available
            if ($boxesCurrent < $boxesToSend) {
                $db->rollBack();
                sendJSON([
                    'success' => false,
                    'error' => "Not enough boxes in carton {$content['carton_number']} for {$content['product_name']}. Available: {$boxesCurrent}, Trying to send: {$boxesToSend}"
                ], 400);
            }
            
            // Update carton_contents:
            // - Decrease boxes_current
            // - Increase boxes_sent_to_amazon
            $updateContentSql = "
                UPDATE carton_contents 
                SET 
                    boxes_current = boxes_current - ?,
                    boxes_sent_to_amazon = boxes_sent_to_amazon + ?
                WHERE carton_id = ? AND product_id = ?
            ";
            $stmt = $db->prepare($updateContentSql);
            $stmt->execute([$boxesToSend, $boxesToSend, $cartonId, $productId]);
            
            // Log movement in box_movement_log
            $logSql = "
                INSERT INTO box_movement_log 
                (carton_id, product_id, movement_type, boxes, shipment_id, created_by, created_at)
                VALUES (?, ?, 'sent_to_amazon', ?, ?, ?, CURRENT_TIMESTAMP)
            ";
            $stmt = $db->prepare($logSql);
            $stmt->execute([$cartonId, $productId, -$boxesToSend, $shipmentId, $userId]);
            
            // Track totals
            $totalBoxesSent += $boxesToSend;
            $cartonsAffected[$cartonId] = $content['carton_number'];
            $productsAffected[$productId] = $content['product_name'];
        }
        
        // 4. Check if any cartons are now empty and mark them
        foreach (array_keys($cartonsAffected) as $cartonId) {
            $checkEmptySql = "
                SELECT SUM(boxes_current) as total_boxes 
                FROM carton_contents 
                WHERE carton_id = ?
            ";
            $stmt = $db->prepare($checkEmptySql);
            $stmt->execute([$cartonId]);
            $result = $stmt->fetch();
            
            if ($result['total_boxes'] == 0) {
                // Mark carton as empty
                $updateCartonSql = "UPDATE cartons SET status = 'empty' WHERE carton_id = ?";
                $stmt = $db->prepare($updateCartonSql);
                $stmt->execute([$cartonId]);
            }
        }
        
        // 5. Update shipment status to 'sent'
        $updateShipmentSql = "
            UPDATE amazon_shipments 
            SET status = 'sent', updated_at = CURRENT_TIMESTAMP 
            WHERE shipment_id = ?
        ";
        $stmt = $db->prepare($updateShipmentSql);
        $stmt->execute([$shipmentId]);
        
        // 6. Commit transaction
        $db->commit();
        
        // Prepare summary
        $summary = [
            'shipment_id' => $shipmentId,
            'shipment_reference' => $shipment['shipment_reference'],
            'total_boxes_sent' => $totalBoxesSent,
            'cartons_affected' => count($cartonsAffected),
            'products_affected' => count($productsAffected),
            'carton_list' => array_values($cartonsAffected),
            'product_list' => array_values($productsAffected)
        ];
        
        sendJSON([
            'success' => true,
            'message' => "Shipment {$shipment['shipment_reference']} sent successfully!",
            'summary' => $summary
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Send shipment error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>