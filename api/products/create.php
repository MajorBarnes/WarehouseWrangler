<?php
/**
 * WarehouseWrangler - Create Product
 * 
 * Creates a new product/article with seasonal factors
 * 
 * UPDATED: Now uses product_id for seasonal factors (not product_name)
 * 
 * @method POST
 * @accepts JSON: { artikel, fnsku, asin, sku, ean, product_name, pairs_per_box, color, seasonal_factors }
 * @returns JSON: { "success": bool, "product_id": int }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
    
    // Validate required fields
    $required = ['artikel', 'fnsku', 'product_name', 'pairs_per_box'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            sendJSON(['success' => false, 'error' => "Missing required field: $field"], 400);
        }
    }
    
    $db = getDBConnection();
    
    // Check if FNSKU already exists
    $stmt = $db->prepare("SELECT product_id FROM products WHERE fnsku = ?");
    $stmt->execute([$input['fnsku']]);
    if ($stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'FNSKU already exists'], 400);
    }
    
    // Insert product
    $stmt = $db->prepare("
        INSERT INTO products (
            artikel, fnsku, asin, sku, ean, product_name, 
            pairs_per_box, color, average_weekly_sales
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    
    $stmt->execute([
        $input['artikel'],
        $input['fnsku'],
        $input['asin'] ?? null,
        $input['sku'] ?? null,
        $input['ean'] ?? null,
        $input['product_name'],
        $input['pairs_per_box'],
        $input['color'] ?? null,
        $input['average_weekly_sales'] ?? 0
    ]);
    
    $productId = $db->lastInsertId();
    
    // Insert seasonal factors if provided (uses product_id, not product_name)
    if (!empty($input['seasonal_factors'])) {
        $factors = $input['seasonal_factors'];
        $stmt = $db->prepare("
            INSERT INTO product_sales_factors (
                product_id,
                factor_jan, factor_feb, factor_mar, factor_apr,
                factor_may, factor_jun, factor_jul, factor_aug,
                factor_sep, factor_oct, factor_nov, factor_dec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $productId,
            $factors['jan'] ?? 1.0,
            $factors['feb'] ?? 1.0,
            $factors['mar'] ?? 1.0,
            $factors['apr'] ?? 1.0,
            $factors['may'] ?? 1.0,
            $factors['jun'] ?? 1.0,
            $factors['jul'] ?? 1.0,
            $factors['aug'] ?? 1.0,
            $factors['sep'] ?? 1.0,
            $factors['oct'] ?? 1.0,
            $factors['nov'] ?? 1.0,
            $factors['dec'] ?? 1.0
        ]);
    }
    
    sendJSON([
        'success' => true,
        'product_id' => $productId,
        'message' => 'Product created successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("Create product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Create product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
