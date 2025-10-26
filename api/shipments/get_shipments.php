<?php
/**
 * WarehouseWrangler - Get Shipments
 * 
 * Returns list of all shipments with optional filtering
 * 
 * @method GET
 * @param string status (optional) - Filter by status: prepared, sent, recalled
 * @param string from_date (optional) - Filter shipments from this date (YYYY-MM-DD)
 * @param string to_date (optional) - Filter shipments to this date (YYYY-MM-DD)
 * @returns JSON: { "success": bool, "shipments": array, "summary": object }
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
    
    // Get database connection
    $db = getDBConnection();
    
    // Build query with optional filters
    $where = [];
    $params = [];
    
    // Filter by status
    if (isset($_GET['status']) && !empty($_GET['status'])) {
        $where[] = "s.status = ?";
        $params[] = $_GET['status'];
    }
    
    // Filter by date range
    if (isset($_GET['from_date']) && !empty($_GET['from_date'])) {
        $where[] = "s.shipment_date >= ?";
        $params[] = $_GET['from_date'];
    }
    
    if (isset($_GET['to_date']) && !empty($_GET['to_date'])) {
        $where[] = "s.shipment_date <= ?";
        $params[] = $_GET['to_date'];
    }
    
    $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';
    
    // Get shipments using the view (which includes summary data)
    $sql = "
        SELECT 
            shipment_id,
            shipment_reference,
            shipment_date,
            status,
            notes,
            carton_count,
            product_count,
            total_boxes,
            created_by_user,
            created_at
        FROM v_shipment_summary s
        $whereClause
        ORDER BY s.shipment_date DESC, s.created_at DESC
    ";
    
    $stmt = $db->prepare($sql);
    
    if (!empty($params)) {
        $stmt->execute($params);
    } else {
        $stmt->execute();
    }
    
    $shipments = $stmt->fetchAll();
    
    // Get overall summary statistics
    $summarySql = "
        SELECT 
            COUNT(*) as total_shipments,
            SUM(CASE WHEN status = 'prepared' THEN 1 ELSE 0 END) as prepared_count,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
            SUM(CASE WHEN status = 'recalled' THEN 1 ELSE 0 END) as recalled_count,
            SUM(CASE WHEN status = 'sent' THEN total_boxes ELSE 0 END) as total_boxes_sent
        FROM v_shipment_summary
        $whereClause
    ";
    
    $stmt = $db->prepare($summarySql);
    
    if (!empty($params)) {
        $stmt->execute($params);
    } else {
        $stmt->execute();
    }
    
    $summary = $stmt->fetch(PDO::FETCH_ASSOC);
    
    sendJSON([
        'success' => true,
        'shipments' => $shipments,
        'summary' => $summary,
        'count' => count($shipments)
    ]);
    
} catch (Exception $e) {
    error_log("Get shipments error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>