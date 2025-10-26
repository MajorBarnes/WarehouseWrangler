<?php
/**
 * WarehouseWrangler - Get Locations Summary
 * 
 * Returns summary statistics for each warehouse location
 * 
 * @method GET
 * @returns JSON: { "success": bool, "summary": object, "totals": object }
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
    
    // Get detailed summary per location
    $summarySql = "
        SELECT 
            c.location,
            COUNT(DISTINCT c.carton_id) as total_cartons,
            COUNT(DISTINCT CASE WHEN c.status = 'in stock' THEN c.carton_id END) as in_stock_cartons,
            COUNT(DISTINCT CASE WHEN c.status = 'empty' THEN c.carton_id END) as empty_cartons,
            COUNT(DISTINCT CASE WHEN c.status = 'archived' THEN c.carton_id END) as archived_cartons,
            COUNT(DISTINCT cc.product_id) as unique_products,
            COALESCE(SUM(cc.boxes_initial), 0) as total_boxes_initial,
            COALESCE(SUM(cc.boxes_current), 0) as total_boxes_current,
            COALESCE(SUM(cc.boxes_sent_to_amazon), 0) as total_boxes_sent,
            COALESCE(SUM(cc.boxes_current * p.pairs_per_box), 0) as total_pairs_current
        FROM cartons c
        LEFT JOIN carton_contents cc ON c.carton_id = cc.carton_id
        LEFT JOIN products p ON cc.product_id = p.product_id
        GROUP BY c.location
    ";
    
    $stmt = $db->query($summarySql);
    $summaryData = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format summary as associative array with all locations
    $summary = [
        'Incoming' => [
            'location' => 'Incoming',
            'total_cartons' => 0,
            'in_stock_cartons' => 0,
            'empty_cartons' => 0,
            'archived_cartons' => 0,
            'unique_products' => 0,
            'total_boxes_initial' => 0,
            'total_boxes_current' => 0,
            'total_boxes_sent' => 0,
            'total_pairs_current' => 0
        ],
        'WML' => [
            'location' => 'WML',
            'total_cartons' => 0,
            'in_stock_cartons' => 0,
            'empty_cartons' => 0,
            'archived_cartons' => 0,
            'unique_products' => 0,
            'total_boxes_initial' => 0,
            'total_boxes_current' => 0,
            'total_boxes_sent' => 0,
            'total_pairs_current' => 0
        ],
        'GMR' => [
            'location' => 'GMR',
            'total_cartons' => 0,
            'in_stock_cartons' => 0,
            'empty_cartons' => 0,
            'archived_cartons' => 0,
            'unique_products' => 0,
            'total_boxes_initial' => 0,
            'total_boxes_current' => 0,
            'total_boxes_sent' => 0,
            'total_pairs_current' => 0
        ]
    ];
    
    // Populate with actual data
    foreach ($summaryData as $row) {
        $location = $row['location'];
        $summary[$location] = [
            'location' => $location,
            'total_cartons' => (int)$row['total_cartons'],
            'in_stock_cartons' => (int)$row['in_stock_cartons'],
            'empty_cartons' => (int)$row['empty_cartons'],
            'archived_cartons' => (int)$row['archived_cartons'],
            'unique_products' => (int)$row['unique_products'],
            'total_boxes_initial' => (int)$row['total_boxes_initial'],
            'total_boxes_current' => (int)$row['total_boxes_current'],
            'total_boxes_sent' => (int)$row['total_boxes_sent'],
            'total_pairs_current' => (int)$row['total_pairs_current']
        ];
    }
    
    // Calculate grand totals across all locations
    $totals = [
        'total_cartons' => 0,
        'in_stock_cartons' => 0,
        'empty_cartons' => 0,
        'archived_cartons' => 0,
        'unique_products' => 0,
        'total_boxes_current' => 0,
        'total_pairs_current' => 0
    ];
    
    // Get unique products across all locations
    $uniqueProductsSql = "
        SELECT COUNT(DISTINCT cc.product_id) as unique_products
        FROM carton_contents cc
        JOIN cartons c ON cc.carton_id = c.carton_id
        WHERE c.status != 'archived'
    ";
    $stmt = $db->query($uniqueProductsSql);
    $uniqueProductsData = $stmt->fetch();
    
    foreach ($summary as $locationData) {
        $totals['total_cartons'] += $locationData['total_cartons'];
        $totals['in_stock_cartons'] += $locationData['in_stock_cartons'];
        $totals['empty_cartons'] += $locationData['empty_cartons'];
        $totals['archived_cartons'] += $locationData['archived_cartons'];
        $totals['total_boxes_current'] += $locationData['total_boxes_current'];
        $totals['total_pairs_current'] += $locationData['total_pairs_current'];
    }
    
    $totals['unique_products'] = (int)($uniqueProductsData['unique_products'] ?? 0);
    
    // Get top products by quantity
    $topProductsSql = "
        SELECT 
            p.product_id,
            p.product_name,
            p.fnsku,
            p.pairs_per_box,
            SUM(cc.boxes_current) as total_boxes,
            SUM(cc.boxes_current * p.pairs_per_box) as total_pairs,
            COUNT(DISTINCT cc.carton_id) as carton_count
        FROM carton_contents cc
        JOIN products p ON cc.product_id = p.product_id
        JOIN cartons c ON cc.carton_id = c.carton_id
        WHERE c.status = 'in stock' AND cc.boxes_current > 0
        GROUP BY p.product_id
        ORDER BY total_boxes DESC
        LIMIT 10
    ";
    
    $stmt = $db->query($topProductsSql);
    $topProducts = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    sendJSON([
        'success' => true,
        'summary' => $summary,
        'totals' => $totals,
        'top_products' => $topProducts
    ]);
    
} catch (Exception $e) {
    error_log("Get locations summary error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
