<?php
/**
 * WarehouseWrangler - Get Carton Details
 * 
 * Returns detailed information about a single carton including all contents
 * 
 * @method GET
 * @param int carton_id (required) - Carton ID to retrieve
 * @returns JSON: { "success": bool, "carton": object, "contents": array, "history": array }
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
    
    // Validate carton_id parameter
    if (!isset($_GET['carton_id']) || empty($_GET['carton_id'])) {
        sendJSON(['success' => false, 'error' => 'Carton ID is required'], 400);
    }
    
    $cartonId = (int)$_GET['carton_id'];
    
    // Get database connection
    $db = getDBConnection();
    
    // Get carton basic info
    $cartonSql = "
        SELECT 
            carton_id,
            carton_number,
            location,
            status,
            created_at,
            updated_at
        FROM cartons
        WHERE carton_id = ?
    ";
    
    $stmt = $db->prepare($cartonSql);
    $stmt->execute([$cartonId]);
    $carton = $stmt->fetch();
    
    if (!$carton) {
        sendJSON(['success' => false, 'error' => 'Carton not found'], 404);
    }
    
    // Get carton contents with product details
    $contentsSql = "
        SELECT 
            cc.content_id,
            cc.carton_id,
            cc.product_id,
            cc.boxes_initial,
            cc.boxes_current,
            cc.boxes_sent_to_amazon,
            p.product_name,
            p.fnsku,
            p.artikel,
            p.pairs_per_box,
            (cc.boxes_initial * p.pairs_per_box) as pairs_initial,
            (cc.boxes_current * p.pairs_per_box) as pairs_current,
            (cc.boxes_sent_to_amazon * p.pairs_per_box) as pairs_sent_to_amazon
        FROM carton_contents cc
        JOIN products p ON cc.product_id = p.product_id
        WHERE cc.carton_id = ?
        ORDER BY p.product_name
    ";
    
    $stmt = $db->prepare($contentsSql);
    $stmt->execute([$cartonId]);
    $contents = $stmt->fetchAll();
    
    // Get movement history from box_movement_log
    $historySql = "
        SELECT 
            bml.log_id,
            bml.movement_type,
            bml.boxes,
            bml.notes,
            bml.created_at,
            p.product_name,
            p.fnsku,
            u.username as created_by_user,
            s.shipment_reference
        FROM box_movement_log bml
        JOIN products p ON bml.product_id = p.product_id
        LEFT JOIN users u ON bml.created_by = u.user_id
        LEFT JOIN amazon_shipments s ON bml.shipment_id = s.shipment_id
        WHERE bml.carton_id = ?
        ORDER BY bml.created_at DESC
        LIMIT 50
    ";
    
    $stmt = $db->prepare($historySql);
    $stmt->execute([$cartonId]);
    $history = $stmt->fetchAll();
    
    // Calculate totals
    $totals = [
        'boxes_initial' => 0,
        'boxes_current' => 0,
        'boxes_sent_to_amazon' => 0,
        'pairs_initial' => 0,
        'pairs_current' => 0,
        'pairs_sent_to_amazon' => 0,
        'product_count' => count($contents)
    ];
    
    foreach ($contents as $content) {
        $totals['boxes_initial'] += (int)$content['boxes_initial'];
        $totals['boxes_current'] += (int)$content['boxes_current'];
        $totals['boxes_sent_to_amazon'] += (int)$content['boxes_sent_to_amazon'];
        $totals['pairs_initial'] += (int)$content['pairs_initial'];
        $totals['pairs_current'] += (int)$content['pairs_current'];
        $totals['pairs_sent_to_amazon'] += (int)$content['pairs_sent_to_amazon'];
    }
    
    sendJSON([
        'success' => true,
        'carton' => $carton,
        'contents' => $contents,
        'history' => $history,
        'totals' => $totals
    ]);
    
} catch (Exception $e) {
    error_log("Get carton details error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
