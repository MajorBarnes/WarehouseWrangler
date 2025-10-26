<?php
/**
 * WarehouseWrangler - Remove Boxes from Shipment
 * 
 * Removes specific boxes from a prepared shipment
 * Allows users to adjust their selections before sending
 * 
 * @method POST
 * @body JSON: { 
 *   "shipment_id": int,
 *   "shipment_content_id": int
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
    
    if (!isset($data['shipment_content_id']) || empty($data['shipment_content_id'])) {
        sendJSON(['success' => false, 'error' => 'Shipment content ID is required'], 400);
    }
    
    $shipmentId = (int)$data['shipment_id'];
    $shipmentContentId = (int)$data['shipment_content_id'];
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // 1. Check if shipment exists and is in 'prepared' status
        $shipmentSql = "SELECT shipment_id, status FROM amazon_shipments WHERE shipment_id = ?";
        $stmt = $db->prepare($shipmentSql);
        $stmt->execute([$shipmentId]);
        $shipment = $stmt->fetch();
        
        if (!$shipment) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment not found'], 404);
        }
        
        if ($shipment['status'] !== 'prepared') {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Can only remove boxes from prepared shipments'], 400);
        }
        
        // 2. Check if shipment_content exists and belongs to this shipment
        $contentSql = "
            SELECT shipment_content_id, shipment_id, carton_id, product_id, boxes_sent
            FROM shipment_contents
            WHERE shipment_content_id = ? AND shipment_id = ?
        ";
        $stmt = $db->prepare($contentSql);
        $stmt->execute([$shipmentContentId, $shipmentId]);
        $content = $stmt->fetch();
        
        if (!$content) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment content not found or does not belong to this shipment'], 404);
        }
        
        // 3. Delete the shipment content entry
        $deleteSql = "DELETE FROM shipment_contents WHERE shipment_content_id = ?";
        $stmt = $db->prepare($deleteSql);
        $stmt->execute([$shipmentContentId]);
        
        // 4. Update shipment updated_at timestamp
        $updateShipmentSql = "UPDATE amazon_shipments SET updated_at = CURRENT_TIMESTAMP WHERE shipment_id = ?";
        $stmt = $db->prepare($updateShipmentSql);
        $stmt->execute([$shipmentId]);
        
        // 5. Commit transaction
        $db->commit();
        
        sendJSON([
            'success' => true,
            'message' => 'Boxes removed from shipment successfully',
            'removed_boxes' => (int)$content['boxes_sent']
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Remove boxes from shipment error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
