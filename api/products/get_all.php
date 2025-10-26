<?php
/**
 * WarehouseWrangler - Get All Products
 * 
 * Returns list of all products with seasonal factors
 * 
 * UPDATED: Now links seasonal factors by product_id (not product_name)
 * 
 * @method GET
 * @returns JSON: { "success": bool, "products": array }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Authenticate
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
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendJSON(['success' => false, 'error' => 'Invalid token format'], 401);
    }
    
    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    if ($payload['exp'] < time()) {
        sendJSON(['success' => false, 'error' => 'Token expired'], 401);
    }
    
    $db = getDBConnection();
    
    // Get all products with seasonal factors
    // NOW USES: product_id link (not product_name)
    $stmt = $db->query("
        SELECT 
            p.product_id,
            p.artikel,
            p.fnsku,
            p.asin,
            p.sku,
            p.ean,
            p.product_name,
            p.average_weekly_sales,
            p.pairs_per_box,
            p.color,
            p.created_at,
            p.updated_at,
            psf.factor_jan,
            psf.factor_feb,
            psf.factor_mar,
            psf.factor_apr,
            psf.factor_may,
            psf.factor_jun,
            psf.factor_jul,
            psf.factor_aug,
            psf.factor_sep,
            psf.factor_oct,
            psf.factor_nov,
            psf.factor_dec
        FROM products p
        LEFT JOIN product_sales_factors psf ON p.product_id = psf.product_id
        ORDER BY p.artikel ASC
    ");
    
    $products = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Extract seasonal factors
        $factors = [
            'jan' => (float)($row['factor_jan'] ?? 1.0),
            'feb' => (float)($row['factor_feb'] ?? 1.0),
            'mar' => (float)($row['factor_mar'] ?? 1.0),
            'apr' => (float)($row['factor_apr'] ?? 1.0),
            'may' => (float)($row['factor_may'] ?? 1.0),
            'jun' => (float)($row['factor_jun'] ?? 1.0),
            'jul' => (float)($row['factor_jul'] ?? 1.0),
            'aug' => (float)($row['factor_aug'] ?? 1.0),
            'sep' => (float)($row['factor_sep'] ?? 1.0),
            'oct' => (float)($row['factor_oct'] ?? 1.0),
            'nov' => (float)($row['factor_nov'] ?? 1.0),
            'dec' => (float)($row['factor_dec'] ?? 1.0)
        ];
        
        // Build product object
        $product = [
            'product_id' => (int)$row['product_id'],
            'artikel' => $row['artikel'],
            'fnsku' => $row['fnsku'],
            'asin' => $row['asin'],
            'sku' => $row['sku'],
            'ean' => $row['ean'],
            'product_name' => $row['product_name'],
            'average_weekly_sales' => (float)$row['average_weekly_sales'],
            'pairs_per_box' => (int)$row['pairs_per_box'],
            'color' => $row['color'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
            'seasonal_factors' => $factors
        ];
        
        $products[] = $product;
    }
    
    sendJSON([
        'success' => true,
        'products' => $products,
        'count' => count($products)
    ]);
    
} catch (PDOException $e) {
    error_log("Get products error (PDO): " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Get products error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
