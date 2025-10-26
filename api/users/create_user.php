<?php
/**
 * WarehouseWrangler - Create User
 * 
 * Creates a new user (admin only)
 * 
 * @method POST
 * @accepts JSON: { "username": "string", "email": "string", "password": "string", "role": "admin|user" }
 * @returns JSON: { "success": bool, "user_id": int }
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
    
    // Check if user is admin
    if ($payload['role'] !== 'admin') {
        sendJSON(['success' => false, 'error' => 'Admin access required'], 403);
    }
    
    // Get JSON input
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);
    
    // Validate input
    if (!isset($data['username']) || !isset($data['email']) || !isset($data['password'])) {
        sendJSON(['success' => false, 'error' => 'Username, email, and password are required'], 400);
    }
    
    $username = trim($data['username']);
    $email = trim($data['email']);
    $password = $data['password'];
    $role = $data['role'] ?? 'user';
    
    // Validate role
    if (!in_array($role, ['admin', 'user'])) {
        sendJSON(['success' => false, 'error' => 'Invalid role. Must be admin or user'], 400);
    }
    
    // Validate username
    if (strlen($username) < 3) {
        sendJSON(['success' => false, 'error' => 'Username must be at least 3 characters'], 400);
    }
    
    // Validate email
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendJSON(['success' => false, 'error' => 'Invalid email address'], 400);
    }
    
    // Validate password
    if (strlen($password) < PASSWORD_MIN_LENGTH) {
        sendJSON(['success' => false, 'error' => 'Password must be at least ' . PASSWORD_MIN_LENGTH . ' characters'], 400);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Check if username already exists
    $stmt = $db->prepare("SELECT user_id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'Username already exists'], 400);
    }
    
    // Check if email already exists
    $stmt = $db->prepare("SELECT user_id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendJSON(['success' => false, 'error' => 'Email already exists'], 400);
    }
    
    // Hash password
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    
    // Insert user
    $stmt = $db->prepare("
        INSERT INTO users (username, email, password_hash, role, is_active, created_at)
        VALUES (?, ?, ?, ?, 1, NOW())
    ");
    
    $stmt->execute([$username, $email, $passwordHash, $role]);
    $userId = $db->lastInsertId();
    
    sendJSON([
        'success' => true,
        'message' => 'User created successfully',
        'user_id' => $userId
    ], 201);
    
} catch (Exception $e) {
    error_log("Create user error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
