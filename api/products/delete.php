<?php
/**
 * WarehouseWrangler - Delete Product
 * 
 * Deletes a product (only if not in any cartons)
 * 
 * UPDATED: Deletes seasonal factors by product_id (not product_name)
 * 
 * @method DELETE
 * @accepts JSON: { product_id }
 * @returns JSON: { "success": bool }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
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
    
    $db = getDBConnection();
    
    // Check if product exists in any cartons
    $stmt = $db->prepare("
        SELECT COUNT(*) as count 
        FROM carton_contents 
        WHERE product_id = ?
    ");
    $stmt->execute([$input['product_id']]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($result['count'] > 0) {
        sendJSON([
            'success' => false, 
            'error' => 'Cannot delete product that exists in cartons. Found in ' . $result['count'] . ' carton(s).'
        ], 400);
    }
    
    // Check if product exists
    $stmt = $db->prepare("SELECT product_id FROM products WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    if (!$stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'Product not found'], 404);
    }
    
    // Delete seasonal factors (CASCADE will handle this if FK is set, but explicit is clearer)
    $stmt = $db->prepare("DELETE FROM product_sales_factors WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    
    // Delete product
    $stmt = $db->prepare("DELETE FROM products WHERE product_id = ?");
    $stmt->execute([$input['product_id']]);
    
    sendJSON([
        'success' => true,
        'message' => 'Product deleted successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("Delete product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Delete product error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
