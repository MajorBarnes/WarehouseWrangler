<?php
/**
 * WarehouseWrangler - Add Boxes to Shipment
 * 
 * Adds boxes from specific cartons/products to a shipment
 * 
 * @method POST
 * @body JSON: { 
 *   "shipment_id": int,
 *   "boxes": [
 *     { "carton_id": int, "product_id": int, "boxes_to_send": int }
 *   ]
 * }
 * @returns JSON: { "success": bool, "message": string }
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
    
    if (!isset($data['boxes']) || !is_array($data['boxes']) || empty($data['boxes'])) {
        sendJSON(['success' => false, 'error' => 'Boxes array is required and cannot be empty'], 400);
    }
    
    $shipmentId = (int)$data['shipment_id'];
    $boxesToAdd = $data['boxes'];
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // Check if shipment exists and is in 'prepared' status
        $checkSql = "SELECT shipment_id, status FROM amazon_shipments WHERE shipment_id = ?";
        $stmt = $db->prepare($checkSql);
        $stmt->execute([$shipmentId]);
        $shipment = $stmt->fetch();
        
        if (!$shipment) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment not found'], 404);
        }
        
        if ($shipment['status'] !== 'prepared') {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Can only add boxes to shipments with status "prepared"'], 400);
        }
        
        $addedCount = 0;
        $errors = [];
        
        // Process each box entry
        foreach ($boxesToAdd as $index => $box) {
            // Validate box data
            if (!isset($box['carton_id']) || !isset($box['product_id']) || !isset($box['boxes_to_send'])) {
                $errors[] = "Box entry $index: Missing required fields";
                continue;
            }
            
            $cartonId = (int)$box['carton_id'];
            $productId = (int)$box['product_id'];
            $boxesToSend = (int)$box['boxes_to_send'];
            
            if ($boxesToSend <= 0) {
                $errors[] = "Box entry $index: Boxes to send must be greater than 0";
                continue;
            }
            
            // Check if carton_content exists and has enough boxes
            $contentSql = "
                SELECT content_id, boxes_current 
                FROM carton_contents 
                WHERE carton_id = ? AND product_id = ?
            ";
            $stmt = $db->prepare($contentSql);
            $stmt->execute([$cartonId, $productId]);
            $content = $stmt->fetch();
            
            if (!$content) {
                $errors[] = "Box entry $index: Product not found in this carton";
                continue;
            }
            
            // Check boxes reserved in OTHER prepared shipments
            $reservedSql = "
                SELECT COALESCE(SUM(sc.boxes_sent), 0) as boxes_reserved
                FROM shipment_contents sc
                JOIN amazon_shipments s ON sc.shipment_id = s.shipment_id
                WHERE sc.carton_id = ? 
                  AND sc.product_id = ? 
                  AND s.status = 'prepared'
                  AND s.shipment_id != ?
            ";
            $stmt = $db->prepare($reservedSql);
            $stmt->execute([$cartonId, $productId, $shipmentId]);
            $reserved = $stmt->fetch();
            $boxesReserved = (int)$reserved['boxes_reserved'];
            
            $boxesAvailable = $content['boxes_current'] - $boxesReserved;
            
            if ($boxesAvailable < $boxesToSend) {
                if ($boxesReserved > 0) {
                    $errors[] = "Box entry $index: Only {$boxesAvailable} boxes available (total: {$content['boxes_current']}, reserved in other shipments: {$boxesReserved}), cannot send {$boxesToSend}";
                } else {
                    $errors[] = "Box entry $index: Only {$content['boxes_current']} boxes available, cannot send {$boxesToSend}";
                }
                continue;
            }
            
            // Check if this carton/product combo already exists in shipment
            $existsSql = "
                SELECT shipment_content_id, boxes_sent 
                FROM shipment_contents 
                WHERE shipment_id = ? AND carton_id = ? AND product_id = ?
            ";
            $stmt = $db->prepare($existsSql);
            $stmt->execute([$shipmentId, $cartonId, $productId]);
            $existing = $stmt->fetch();
            
            if ($existing) {
                // Update existing entry
                $newTotal = $existing['boxes_sent'] + $boxesToSend;
                $updateSql = "
                    UPDATE shipment_contents 
                    SET boxes_sent = ? 
                    WHERE shipment_content_id = ?
                ";
                $stmt = $db->prepare($updateSql);
                $stmt->execute([$newTotal, $existing['shipment_content_id']]);
            } else {
                // Insert new entry
                $insertSql = "
                    INSERT INTO shipment_contents 
                    (shipment_id, carton_id, product_id, boxes_sent)
                    VALUES (?, ?, ?, ?)
                ";
                $stmt = $db->prepare($insertSql);
                $stmt->execute([$shipmentId, $cartonId, $productId, $boxesToSend]);
            }
            
            $addedCount++;
        }
        
        // Check if any boxes were successfully added
        if ($addedCount === 0) {
            $db->rollBack();
            sendJSON([
                'success' => false,
                'error' => 'No boxes could be added to shipment',
                'errors' => $errors
            ], 400);
        }
        
        // Update shipment updated_at timestamp
        $updateShipmentSql = "UPDATE amazon_shipments SET updated_at = CURRENT_TIMESTAMP WHERE shipment_id = ?";
        $stmt = $db->prepare($updateShipmentSql);
        $stmt->execute([$shipmentId]);
        
        // Commit transaction
        $db->commit();
        
        $response = [
            'success' => true,
            'message' => "Successfully added $addedCount box entries to shipment",
            'added_count' => $addedCount
        ];
        
        if (!empty($errors)) {
            $response['warnings'] = $errors;
        }
        
        sendJSON($response);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Add boxes to shipment error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>