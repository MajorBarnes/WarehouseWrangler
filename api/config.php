<?php
/**
 * WarehouseWrangler - Database Configuration
 * 
 * SECURITY WARNING: This file contains sensitive credentials!
 * - Keep this file OUTSIDE the public web directory if possible
 * - Never commit this file to version control
 * - Use strong, unique passwords
 * 
 * Version: 1.0.0
 * Created: October 24, 2025
 */

declare(strict_types=1);

// Keep errors out of the HTTP response body (but log them)
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Prevent direct access
if (!defined('WAREHOUSEWRANGLER')) {
    define('WAREHOUSEWRANGLER', true);
}

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================
// Update these values with your Strato database credentials

define('DB_HOST', 'database-5017707534.webspace-host.com');           // Database host (usually localhost) - that'swhat I got on Strato: database-5017707534.webspace-host.com
define('DB_NAME', 'dbs14153282');         // Your Strato database name
define('DB_USER', 'dbu1579224');          // Your Strato database username
define('DB_PASS', 'eV92.2Q!3csWgZc');
define('DB_CHARSET', 'utf8mb4');

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================

define('APP_NAME', 'WarehouseWrangler');
define('APP_VERSION', '1.0.0');
define('APP_ENV', 'development'); // Change to 'production' when live!

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// JWT Secret Key - CRITICAL: Change this to a unique random string!
// Generate a secure key: openssl rand -base64 32
define('JWT_SECRET', 'pRGYg0a3rB6S6t7kqQ3r7iXxYFqf4yPDa3aYwG0Qb2s=');
define('JWT_ALGORITHM', 'HS256');
define('JWT_EXPIRY', 86400); // Token expiry in seconds (24 hours)

// Session settings
define('SESSION_NAME', 'WW_SESSION');
define('SESSION_LIFETIME', 86400); // 24 hours

// Password requirements
define('PASSWORD_MIN_LENGTH', 8);
define('PASSWORD_REQUIRE_SPECIAL', true);

// ============================================================================
// ERROR HANDLING
// ============================================================================

if (APP_ENV === 'development') {
    // Development: Show errors
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
} else {
    // Production: Hide errors, log them
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    error_reporting(E_ALL);
    ini_set('log_errors', 1);
    ini_set('error_log', __DIR__ . '/../logs/php_errors.log');
}

// ============================================================================
// TIMEZONE
// ============================================================================

date_default_timezone_set('Europe/Berlin');

// ============================================================================
// CORS SETTINGS (for API)
// ============================================================================

define('ALLOWED_ORIGINS', [
    'https://threegents.biz',
    'https://*.threegents.biz',
    'http://localhost:3000', // For local development
]);

// ============================================================================
// FILE UPLOAD SETTINGS
// ============================================================================

define('UPLOAD_MAX_SIZE', 5 * 1024 * 1024); // 5MB max file size
define('ALLOWED_FILE_TYPES', [
    'csv' => 'text/csv',
    'txt' => 'text/plain',
]);

// ============================================================================
// DATABASE CONNECTION FUNCTION
// ============================================================================

/**
 * Get database connection using PDO
 * 
 * @return PDO Database connection object
 * @throws PDOException if connection fails
 */
function getDBConnection() {
    static $pdo = null;
    
    // Return existing connection if available
    if ($pdo !== null) {
        return $pdo;
    }
    
    try {
        $dsn = "mysql:host=" . DB_HOST . ";port=3306;dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];
        
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        
        return $pdo;
        
    } catch (PDOException $e) {
        // Log the error
        error_log("Database Connection Error: " . $e->getMessage());
        
        // Return user-friendly error
        if (APP_ENV === 'development') {
            die(json_encode([
                'success' => false,
                'error' => 'Database connection failed: ' . $e->getMessage()
            ]));
        } else {
            die(json_encode([
                'success' => false,
                'error' => 'Database connection failed. Please contact support.'
            ]));
        }
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send JSON response
 */
function sendJSON($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

/**
 * Get system configuration value
 */
function getConfig($key, $default = null) {
    try {
        $db = getDBConnection();
        $stmt = $db->prepare("SELECT config_value FROM system_config WHERE config_key = ?");
        $stmt->execute([$key]);
        $result = $stmt->fetch();
        
        return $result ? $result['config_value'] : $default;
    } catch (PDOException $e) {
        error_log("Config retrieval error: " . $e->getMessage());
        return $default;
    }
}

/**
 * Set system configuration value
 */
function setConfig($key, $value, $description = null) {
    try {
        $db = getDBConnection();
        
        if ($description) {
            $stmt = $db->prepare("
                INSERT INTO system_config (config_key, config_value, description) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE config_value = ?, description = ?
            ");
            $stmt->execute([$key, $value, $description, $value, $description]);
        } else {
            $stmt = $db->prepare("
                INSERT INTO system_config (config_key, config_value) 
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE config_value = ?
            ");
            $stmt->execute([$key, $value, $value]);
        }
        
        return true;
    } catch (PDOException $e) {
        error_log("Config update error: " . $e->getMessage());
        return false;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_name(SESSION_NAME);
    session_start();
}

// Set security headers
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('X-XSS-Protection: 1; mode=block');

// ---------------------------------------------------------------------------
// When this file is hit directly (not included), output JSON config for the UI
// ---------------------------------------------------------------------------
if (
    php_sapi_name() !== 'cli' &&                 // not CLI
    isset($_SERVER['SCRIPT_FILENAME']) &&
    realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME']) // direct request
) {
    // If you require auth for API endpoints, include it here:
    // require_once __DIR__ . '/auth/require_auth.php';

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');

    // Pull from system_config with safe fallbacks
    $leadTime = (int) getConfig('LEAD_TIME_WEEKS', 13);
    $awsUnit  = strtolower((string) getConfig('AWS_UNIT', 'boxes')) === 'pairs' ? 'pairs' : 'boxes';

    echo json_encode([
        'LEAD_TIME_WEEKS' => $leadTime,
        'AWS_UNIT'        => $awsUnit
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

// ============================================================================
// END OF CONFIGURATION
// ============================================================================