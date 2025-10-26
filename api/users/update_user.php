<?php
/**
 * WarehouseWrangler - Update User
 * 
 * Updates user details (admin only, or own profile)
 * 
 * @method PUT
 * @accepts JSON: { "user_id": int, "email": "string", "role": "admin|user", "is_active": bool }
 * @returns JSON: { "success": bool }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow PUT
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
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
    
    $currentUserId = $payload['user_id'];
    $currentUserRole = $payload['role'];
    
    // Get JSON input
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);
    
    // Validate input
    if (!isset($data['user_id'])) {
        sendJSON(['success' => false, 'error' => 'User ID is required'], 400);
    }
    
    $userId = (int)$data['user_id'];
    
    // Check permissions: admin can edit anyone, users can only edit themselves
    if ($currentUserRole !== 'admin' && $currentUserId !== $userId) {
        sendJSON(['success' => false, 'error' => 'Permission denied'], 403);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Build update query dynamically based on provided fields
    $updates = [];
    $params = [];
    
    if (isset($data['email'])) {
        $email = trim($data['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendJSON(['success' => false, 'error' => 'Invalid email address'], 400);
        }
        $updates[] = "email = ?";
        $params[] = $email;
    }
    
    // Only admin can change role and active status
    if ($currentUserRole === 'admin') {
        if (isset($data['role'])) {
            if (!in_array($data['role'], ['admin', 'user'])) {
                sendJSON(['success' => false, 'error' => 'Invalid role'], 400);
            }
            $updates[] = "role = ?";
            $params[] = $data['role'];
        }
        
        if (isset($data['is_active'])) {
            $updates[] = "is_active = ?";
            $params[] = $data['is_active'] ? 1 : 0;
        }
    }
    
    if (empty($updates)) {
        sendJSON(['success' => false, 'error' => 'No fields to update'], 400);
    }
    
    // Add user_id to params
    $params[] = $userId;
    
    // Update user
    $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE user_id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    sendJSON([
        'success' => true,
        'message' => 'User updated successfully'
    ]);
    
} catch (Exception $e) {
    error_log("Update user error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
