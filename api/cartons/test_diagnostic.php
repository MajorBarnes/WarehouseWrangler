<?php
/**
 * WarehouseWrangler - Diagnostic Test
 * 
 * Tests basic setup: config, database, auth
 */

// Enable error display for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$diagnostics = [
    'success' => true,
    'checks' => []
];

// Check 1: Config file exists
$configPath = '../config.php';
if (file_exists($configPath)) {
    $diagnostics['checks'][] = [
        'name' => 'Config file exists',
        'status' => 'PASS',
        'path' => realpath($configPath)
    ];
    
    // Try to include it
    try {
        define('WAREHOUSEWRANGLER', true);
        require_once $configPath;
        $diagnostics['checks'][] = [
            'name' => 'Config file loads',
            'status' => 'PASS'
        ];
        
        // Check if sendJSON function exists
        if (function_exists('sendJSON')) {
            $diagnostics['checks'][] = [
                'name' => 'sendJSON function exists',
                'status' => 'PASS'
            ];
        } else {
            $diagnostics['checks'][] = [
                'name' => 'sendJSON function exists',
                'status' => 'FAIL',
                'message' => 'Function not defined in config.php'
            ];
        }
        
        // Check if getDBConnection function exists
        if (function_exists('getDBConnection')) {
            $diagnostics['checks'][] = [
                'name' => 'getDBConnection function exists',
                'status' => 'PASS'
            ];
            
            // Try to connect
            try {
                $db = getDBConnection();
                $diagnostics['checks'][] = [
                    'name' => 'Database connection',
                    'status' => 'PASS'
                ];
                
                // Try a simple query
                $stmt = $db->query("SELECT COUNT(*) as count FROM cartons");
                $result = $stmt->fetch();
                $diagnostics['checks'][] = [
                    'name' => 'Query cartons table',
                    'status' => 'PASS',
                    'carton_count' => $result['count']
                ];
                
            } catch (Exception $e) {
                $diagnostics['checks'][] = [
                    'name' => 'Database connection',
                    'status' => 'FAIL',
                    'error' => $e->getMessage()
                ];
            }
            
        } else {
            $diagnostics['checks'][] = [
                'name' => 'getDBConnection function exists',
                'status' => 'FAIL',
                'message' => 'Function not defined in config.php'
            ];
        }
        
    } catch (Exception $e) {
        $diagnostics['checks'][] = [
            'name' => 'Config file loads',
            'status' => 'FAIL',
            'error' => $e->getMessage()
        ];
    }
    
} else {
    $diagnostics['checks'][] = [
        'name' => 'Config file exists',
        'status' => 'FAIL',
        'message' => 'File not found at: ' . $configPath,
        'expected_path' => realpath(__DIR__ . '/../../config.php')
    ];
}

// Check 2: Authorization header
$authHeader = '';
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
} elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
} elseif (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $authHeader = $headers['Authorization'] ?? '';
}

if (!empty($authHeader)) {
    $diagnostics['checks'][] = [
        'name' => 'Authorization header',
        'status' => 'PASS',
        'header_length' => strlen($authHeader)
    ];
    
    // Try to parse token
    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = $matches[1];
        $parts = explode('.', $token);
        
        if (count($parts) === 3) {
            $diagnostics['checks'][] = [
                'name' => 'JWT token format',
                'status' => 'PASS',
                'parts' => count($parts)
            ];
            
            try {
                $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1])), true);
                $diagnostics['checks'][] = [
                    'name' => 'JWT token decode',
                    'status' => 'PASS',
                    'user_id' => $payload['user_id'] ?? 'not found',
                    'role' => $payload['role'] ?? 'not found',
                    'exp' => $payload['exp'] ?? 'not found',
                    'expired' => isset($payload['exp']) ? ($payload['exp'] < time() ? 'YES' : 'NO') : 'unknown'
                ];
            } catch (Exception $e) {
                $diagnostics['checks'][] = [
                    'name' => 'JWT token decode',
                    'status' => 'FAIL',
                    'error' => $e->getMessage()
                ];
            }
        } else {
            $diagnostics['checks'][] = [
                'name' => 'JWT token format',
                'status' => 'FAIL',
                'parts' => count($parts),
                'expected' => 3
            ];
        }
    } else {
        $diagnostics['checks'][] = [
            'name' => 'JWT token format',
            'status' => 'FAIL',
            'message' => 'Does not match "Bearer {token}" pattern'
        ];
    }
} else {
    $diagnostics['checks'][] = [
        'name' => 'Authorization header',
        'status' => 'FAIL',
        'message' => 'No authorization header found'
    ];
}

// Check PHP version
$diagnostics['checks'][] = [
    'name' => 'PHP version',
    'status' => 'INFO',
    'version' => PHP_VERSION
];

// Check current directory
$diagnostics['checks'][] = [
    'name' => 'Current directory',
    'status' => 'INFO',
    'dir' => __DIR__,
    'file' => __FILE__
];

echo json_encode($diagnostics, JSON_PRETTY_PRINT);
?>
