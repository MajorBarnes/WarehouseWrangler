<?php
/**
 * WarehouseWrangler - Update Seasonal Factors
 * 
 * Updates seasonal sales factors for a specific article (by product_id)
 * 
 * UPDATED: Now uses product_id (not product_name)
 * 
 * @method POST
 * @accepts JSON: { product_id, factors: {jan, feb, mar, ...} }
 * @returns JSON: { "success": bool }
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
    
    if (empty($input['product_id'])) {
        sendJSON(['success' => false, 'error' => 'Missing product_id'], 400);
    }
    
    if (empty($input['factors'])) {
        sendJSON(['success' => false, 'error' => 'Missing factors'], 400);
    }
    
    $db = getDBConnection();
    $factors = $input['factors'];
    
    // Check if product exists
    $stmt = $db->prepare("SELECT product_id FROM products WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    if (!$stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'Product not found'], 404);
    }
    
    // Check if factors already exist for this product_id
    $stmt = $db->prepare("SELECT factor_id FROM product_sales_factors WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    $exists = $stmt->fetch();
    
    if ($exists) {
        // Update existing factors
        $stmt = $db->prepare("
            UPDATE product_sales_factors SET
                factor_jan = ?, factor_feb = ?, factor_mar = ?, factor_apr = ?,
                factor_may = ?, factor_jun = ?, factor_jul = ?, factor_aug = ?,
                factor_sep = ?, factor_oct = ?, factor_nov = ?, factor_dec = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE product_id = ?
        ");
        
        $stmt->execute([
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
            $factors['dec'] ?? 1.0,
            $input['product_id']
        ]);
    } else {
        // Insert new factors
        $stmt = $db->prepare("
            INSERT INTO product_sales_factors (
                product_id,
                factor_jan, factor_feb, factor_mar, factor_apr,
                factor_may, factor_jun, factor_jul, factor_aug,
                factor_sep, factor_oct, factor_nov, factor_dec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $input['product_id'],
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
        'message' => 'Seasonal factors updated successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("Update factors error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Update factors error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
