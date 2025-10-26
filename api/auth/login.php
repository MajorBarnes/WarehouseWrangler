<?php
/**
 * WarehouseWrangler - Login API Endpoint
 * 
 * Authenticates users and returns a JWT token
 * 
 * @method POST
 * @accepts JSON: { "username": "string", "password": "string" }
 * @returns JSON: { "success": bool, "token": "string", "user": object }
 */

// Security constant
define('WAREHOUSEWRANGLER', true);

// Include configuration
require_once '../config.php';

// Set CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON([
        'success' => false,
        'error' => 'Method not allowed. Use POST.'
    ], 405);
}

/**
 * Generate JWT token
 */
function generateJWT($userId, $username, $role) {
    $header = json_encode([
        'typ' => 'JWT',
        'alg' => JWT_ALGORITHM
    ]);

    $payload = json_encode([
        'user_id' => $userId,
        'username' => $username,
        'role' => $role,
        'iat' => time(),
        'exp' => time() + JWT_EXPIRY
    ]);

    // Base64 encode
    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));

    // Create signature
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, JWT_SECRET, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    // Create JWT
    $jwt = $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;

    return $jwt;
}

/**
 * Log login attempt
 */
function logLoginAttempt($username, $success, $ipAddress) {
    try {
        $db = getDBConnection();
        $stmt = $db->prepare("
            INSERT INTO login_attempts (username, ip_address, success, attempted_at)
            VALUES (?, ?, ?, NOW())
        ");
        $stmt->execute([$username, $ipAddress, $success ? 1 : 0]);
    } catch (PDOException $e) {
        error_log("Failed to log login attempt: " . $e->getMessage());
    }
}

/**
 * Check for too many failed login attempts
 */
function checkLoginAttempts($username, $ipAddress) {
    try {
        $db = getDBConnection();
        
        // Check failed attempts in last 15 minutes
        $stmt = $db->prepare("
            SELECT COUNT(*) as attempts
            FROM login_attempts
            WHERE (username = ? OR ip_address = ?)
            AND success = 0
            AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
        ");
        $stmt->execute([$username, $ipAddress]);
        $result = $stmt->fetch();
        
        // Block after 5 failed attempts
        if ($result['attempts'] >= 5) {
            return false;
        }
        
        return true;
    } catch (PDOException $e) {
        error_log("Failed to check login attempts: " . $e->getMessage());
        return true; // Allow login on error (fail open)
    }
}

// ============================================================================
// MAIN AUTHENTICATION LOGIC
// ============================================================================

try {
    // Get JSON input
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);

    // Validate input
    if (!isset($data['username']) || !isset($data['password'])) {
        sendJSON([
            'success' => false,
            'error' => 'Username and password are required.'
        ], 400);
    }

    $username = trim($data['username']);
    $password = $data['password'];

    // Basic validation
    if (empty($username) || empty($password)) {
        sendJSON([
            'success' => false,
            'error' => 'Username and password cannot be empty.'
        ], 400);
    }

    // Get client IP
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // Check for too many failed attempts
    if (!checkLoginAttempts($username, $ipAddress)) {
        logLoginAttempt($username, false, $ipAddress);
        sendJSON([
            'success' => false,
            'error' => 'Too many failed login attempts. Please try again in 15 minutes.'
        ], 429);
    }

    // Get database connection
    $db = getDBConnection();

    // Find user by username
    $stmt = $db->prepare("
        SELECT user_id, username, password_hash, role, is_active
        FROM users
        WHERE username = ?
        LIMIT 1
    ");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    // Check if user exists
    if (!$user) {
        logLoginAttempt($username, false, $ipAddress);
        sendJSON([
            'success' => false,
            'error' => 'Invalid username or password.'
        ], 401);
    }

    // Check if user is active
    if (!$user['is_active']) {
        logLoginAttempt($username, false, $ipAddress);
        sendJSON([
            'success' => false,
            'error' => 'Account is disabled. Please contact administrator.'
        ], 403);
    }

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        logLoginAttempt($username, false, $ipAddress);
        sendJSON([
            'success' => false,
            'error' => 'Invalid username or password.'
        ], 401);
    }

    // ✅ Authentication successful!
    logLoginAttempt($username, true, $ipAddress);

    // Update last login time
    $updateStmt = $db->prepare("
        UPDATE users 
        SET last_login = NOW() 
        WHERE user_id = ?
    ");
    $updateStmt->execute([$user['user_id']]);

    // Generate JWT token
    $token = generateJWT($user['user_id'], $user['username'], $user['role']);

    // Return success response
    sendJSON([
        'success' => true,
        'message' => 'Login successful',
        'token' => $token,
        'user' => [
            'id' => $user['user_id'],
            'username' => $user['username'],
            'role' => $user['role']
        ]
    ], 200);

} catch (PDOException $e) {
    error_log("Login error: " . $e->getMessage());
    sendJSON([
        'success' => false,
        'error' => 'Database error occurred. Please try again.'
    ], 500);
} catch (Exception $e) {
    error_log("Login error: " . $e->getMessage());
    sendJSON([
        'success' => false,
        'error' => 'An unexpected error occurred.'
    ], 500);
}
?>
