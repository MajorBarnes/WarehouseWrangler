<?php
/**
 * WarehouseWrangler - Get Available Cartons for Shipment
 * 
 * Returns cartons available for shipment with reserved quantities
 * Shows boxes_current minus boxes reserved in other prepared shipments
 * 
 * @method GET
 * @param int exclude_shipment_id (optional) - Exclude this shipment when calculating reserved boxes
 * @returns JSON: { "success": bool, "cartons": array }
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
    
    // Get optional exclude_shipment_id parameter
    $excludeShipmentId = isset($_GET['exclude_shipment_id']) ? (int)$_GET['exclude_shipment_id'] : null;
    
    // Get database connection
    $db = getDBConnection();
    
    // Get cartons from WML and GMR with availability info
    $sql = "
        SELECT 
            c.carton_id,
            c.carton_number,
            c.location,
            c.status,
            COUNT(DISTINCT cc.product_id) as product_count,
            SUM(cc.boxes_current) as total_boxes_current,
            c.created_at
        FROM cartons c
        LEFT JOIN carton_contents cc ON c.carton_id = cc.carton_id
        WHERE c.status = 'in stock'
          AND c.location IN ('WML', 'GMR')
        GROUP BY c.carton_id
        HAVING total_boxes_current > 0
        ORDER BY c.location, c.carton_number
    ";
    
    $stmt = $db->prepare($sql);
    $stmt->execute();
    $cartons = $stmt->fetchAll();
    
    // For each carton, get products with reserved quantities
    foreach ($cartons as &$carton) {
        $productSql = "
            SELECT 
                cc.content_id,
                cc.product_id,
                cc.boxes_current,
                p.product_name,
                p.artikel,
                p.fnsku,
                p.pairs_per_box,
                (cc.boxes_current * p.pairs_per_box) as pairs_current,
                COALESCE((
                    SELECT SUM(sc.boxes_sent)
                    FROM shipment_contents sc
                    JOIN amazon_shipments s ON sc.shipment_id = s.shipment_id
                    WHERE sc.carton_id = cc.carton_id
                      AND sc.product_id = cc.product_id
                      AND s.status = 'prepared'
                      " . ($excludeShipmentId ? "AND s.shipment_id != ?" : "") . "
                ), 0) as boxes_reserved,
                (cc.boxes_current - COALESCE((
                    SELECT SUM(sc.boxes_sent)
                    FROM shipment_contents sc
                    JOIN amazon_shipments s ON sc.shipment_id = s.shipment_id
                    WHERE sc.carton_id = cc.carton_id
                      AND sc.product_id = cc.product_id
                      AND s.status = 'prepared'
                      " . ($excludeShipmentId ? "AND s.shipment_id != ?" : "") . "
                ), 0)) as boxes_available_for_shipment
            FROM carton_contents cc
            JOIN products p ON cc.product_id = p.product_id
            WHERE cc.carton_id = ?
            ORDER BY p.product_name
        ";
        
        $stmt = $db->prepare($productSql);
        if ($excludeShipmentId) {
            $stmt->execute([$excludeShipmentId, $excludeShipmentId, $carton['carton_id']]);
        } else {
            $stmt->execute([$carton['carton_id']]);
        }
        $carton['products'] = $stmt->fetchAll();
        
        // Calculate total available for shipment
        $carton['total_boxes_available_for_shipment'] = array_sum(array_column($carton['products'], 'boxes_available_for_shipment'));
        $carton['total_boxes_reserved'] = array_sum(array_column($carton['products'], 'boxes_reserved'));
    }
    
    // Filter out cartons with no available boxes
    $cartons = array_filter($cartons, function($carton) {
        return $carton['total_boxes_available_for_shipment'] > 0;
    });
    
    // Re-index array
    $cartons = array_values($cartons);
    
    sendJSON([
        'success' => true,
        'cartons' => $cartons,
        'count' => count($cartons)
    ]);
    
} catch (Exception $e) {
    error_log("Get available cartons error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
