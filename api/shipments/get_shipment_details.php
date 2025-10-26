<?php
/**
 * WarehouseWrangler - Get Shipment Details
 * 
 * Returns detailed information about a single shipment including all contents
 * 
 * @method GET
 * @param int shipment_id (required) - Shipment ID to retrieve
 * @returns JSON: { "success": bool, "shipment": object, "contents": array, "summary": object }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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
    
    // Validate shipment_id parameter
    if (!isset($_GET['shipment_id']) || empty($_GET['shipment_id'])) {
        sendJSON(['success' => false, 'error' => 'Shipment ID is required'], 400);
    }
    
    $shipmentId = (int)$_GET['shipment_id'];
    
    // Get database connection
    $db = getDBConnection();
    
    // Get shipment basic info
    $shipmentSql = "
        SELECT 
            shipment_id,
            shipment_reference,
            shipment_date,
            notes,
            status,
            created_by,
            created_at,
            updated_at
        FROM amazon_shipments
        WHERE shipment_id = ?
    ";
    
    $stmt = $db->prepare($shipmentSql);
    $stmt->execute([$shipmentId]);
    $shipment = $stmt->fetch();
    
    if (!$shipment) {
        sendJSON(['success' => false, 'error' => 'Shipment not found'], 404);
    }
    
    // Get shipment contents with all details using the view
    $contentsSql = "
        SELECT 
            shipment_id,
            carton_id,
            carton_number,
            carton_location,
            product_id,
            product_name,
            artikel,
            fnsku,
            boxes_sent,
            pairs_sent,
            created_by_user,
            created_at
        FROM v_shipment_details
        WHERE shipment_id = ?
        ORDER BY carton_number, product_name
    ";
    
    $stmt = $db->prepare($contentsSql);
    $stmt->execute([$shipmentId]);
    $contents = $stmt->fetchAll();
    
    // Calculate summary
    $summary = [
        'total_boxes' => 0,
        'total_pairs' => 0,
        'unique_cartons' => 0,
        'unique_products' => 0
    ];
    
    $cartons = [];
    $products = [];
    
    foreach ($contents as $content) {
        $summary['total_boxes'] += (int)$content['boxes_sent'];
        $summary['total_pairs'] += (int)$content['pairs_sent'];
        $cartons[$content['carton_id']] = true;
        $products[$content['product_id']] = true;
    }
    
    $summary['unique_cartons'] = count($cartons);
    $summary['unique_products'] = count($products);
    
    // Get created by username
    if ($shipment['created_by']) {
        $userSql = "SELECT username FROM users WHERE user_id = ?";
        $stmt = $db->prepare($userSql);
        $stmt->execute([$shipment['created_by']]);
        $user = $stmt->fetch();
        $shipment['created_by_username'] = $user ? $user['username'] : null;
    } else {
        $shipment['created_by_username'] = null;
    }
    
    sendJSON([
        'success' => true,
        'shipment' => $shipment,
        'contents' => $contents,
        'summary' => $summary
    ]);
    
} catch (Exception $e) {
    error_log("Get shipment details error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>