<?php
/**
 * WarehouseWrangler - Get All Users
 * 
 * Returns list of all users (admin only)
 * 
 * @method GET
 * @returns JSON: { "success": bool, "users": array }
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
    // Get token from Authorization header (works on all servers)
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
    
    // Validate token (simple validation for now)
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendJSON(['success' => false, 'error' => 'Invalid token format'], 401);
    }
    
    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
    
    // Check token expiration
    if ($payload['exp'] < time()) {
        sendJSON(['success' => false, 'error' => 'Token expired'], 401);
    }
    
    // Check if user is admin
    if ($payload['role'] !== 'admin') {
        sendJSON(['success' => false, 'error' => 'Admin access required'], 403);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Get all users
    $stmt = $db->query("
        SELECT user_id, username, email, role, is_active, created_at, last_login
        FROM users
        ORDER BY created_at DESC
    ");
    
    $users = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'users' => $users
    ]);
    
} catch (Exception $e) {
    error_log("Get users error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
