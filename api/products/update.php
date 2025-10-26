<?php
/**
 * WarehouseWrangler - Update Product
 * 
 * Updates existing product/article
 * 
 * UPDATED: Seasonal factors are now per product_id, no need to update them when artikel/product_name changes
 * 
 * @method PUT
 * @accepts JSON: { product_id, artikel, asin, sku, ean, product_name, pairs_per_box, color }
 * @returns JSON: { "success": bool }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Authenticate
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        sendJSON(['success' => false, 'error' => 'No authorization token'], 401);
    }
    
    $token = $matches[1];
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendJSON(['success' => false, 'error' => 'Invalid token'], 401);
    }
    
    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    if ($payload['exp'] < time()) {
        sendJSON(['success' => false, 'error' => 'Token expired'], 401);
    }
    
    // Get input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate
    if (empty($input['product_id'])) {
        sendJSON(['success' => false, 'error' => 'Missing product_id'], 400);
    }
    
    $db = getDBConnection();
    
    // Check if product exists
    $stmt = $db->prepare("SELECT product_id FROM products WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    if (!$stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'Product not found'], 404);
    }
    
    // Update product
    // Note: No need to update seasonal_factors table anymore since it links by product_id
    $stmt = $db->prepare("
        UPDATE products SET
            artikel = ?,
            asin = ?,
            sku = ?,
            ean = ?,
            product_name = ?,
            pairs_per_box = ?,
            color = ?,
            average_weekly_sales = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
    ");
    
    $stmt->execute([
        $input['artikel'] ?? null,
        $input['asin'] ?? null,
        $input['sku'] ?? null,
        $input['ean'] ?? null,
        $input['product_name'] ?? null,
        $input['pairs_per_box'] ?? null,
        $input['color'] ?? null,
        $input['average_weekly_sales'] ?? null,
        $input['product_id']
    ]);
    
    sendJSON([
        'success' => true,
        'message' => 'Product updated successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("Update product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Update product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
