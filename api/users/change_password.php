<?php
/**
 * WarehouseWrangler - Change Password
 * 
 * Changes user password (admin can change any, users can change own)
 * 
 * @method POST
 * @accepts JSON: { "user_id": int, "current_password": "string" (optional for admin), "new_password": "string" }
 * @returns JSON: { "success": bool }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
    if (!isset($data['user_id']) || !isset($data['new_password'])) {
        sendJSON(['success' => false, 'error' => 'User ID and new password are required'], 400);
    }
    
    $userId = (int)$data['user_id'];
    $newPassword = $data['new_password'];
    $currentPassword = $data['current_password'] ?? null;
    
    // Validate new password
    if (strlen($newPassword) < PASSWORD_MIN_LENGTH) {
        sendJSON(['success' => false, 'error' => 'Password must be at least ' . PASSWORD_MIN_LENGTH . ' characters'], 400);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Check permissions
    $isChangingOwnPassword = ($currentUserId === $userId);
    $isAdmin = ($currentUserRole === 'admin');
    
    if (!$isChangingOwnPassword && !$isAdmin) {
        sendJSON(['success' => false, 'error' => 'Permission denied'], 403);
    }
    
    // If user is changing their own password, verify current password
    if ($isChangingOwnPassword && !$isAdmin) {
        if (empty($currentPassword)) {
            sendJSON(['success' => false, 'error' => 'Current password is required'], 400);
        }
        
        // Get current password hash
        $stmt = $db->prepare("SELECT password_hash FROM users WHERE user_id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            sendJSON(['success' => false, 'error' => 'Current password is incorrect'], 401);
        }
    }
    
    // Hash new password
    $newPasswordHash = password_hash($newPassword, PASSWORD_BCRYPT);
    
    // Update password
    $stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE user_id = ?");
    $stmt->execute([$newPasswordHash, $userId]);
    
    sendJSON([
        'success' => true,
        'message' => 'Password changed successfully'
    ]);
    
} catch (Exception $e) {
    error_log("Change password error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
