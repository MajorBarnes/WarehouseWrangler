<?php
/**
 * WarehouseWrangler - Move Carton
 * 
 * Updates carton location (moves between warehouses)
 * 
 * @method PUT
 * @body JSON: { "carton_id": int, "location": string, "notes": string (optional) }
 * @returns JSON: { "success": bool, "message": string }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow PUT requests
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Get token from Authorization header
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
    
    // Get user ID from token
    $userId = $payload['user_id'] ?? null;
    
    // Get PUT data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        sendJSON(['success' => false, 'error' => 'Invalid JSON data'], 400);
    }
    
    // Validate required fields
    if (!isset($data['carton_id']) || empty($data['carton_id'])) {
        sendJSON(['success' => false, 'error' => 'Carton ID is required'], 400);
    }
    
    if (!isset($data['location']) || empty($data['location'])) {
        sendJSON(['success' => false, 'error' => 'Location is required'], 400);
    }
    
    $cartonId = (int)$data['carton_id'];
    $newLocation = $data['location'];
    $notes = $data['notes'] ?? '';
    
    // Validate location value
    $validLocations = ['Incoming', 'WML', 'GMR'];
    if (!in_array($newLocation, $validLocations)) {
        sendJSON(['success' => false, 'error' => 'Invalid location. Must be: Incoming, WML, or GMR'], 400);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // Check if carton exists and get current location
        $checkSql = "SELECT carton_id, carton_number, location, status FROM cartons WHERE carton_id = ?";
        $stmt = $db->prepare($checkSql);
        $stmt->execute([$cartonId]);
        $carton = $stmt->fetch();
        
        if (!$carton) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Carton not found'], 404);
        }
        
        // Check if carton is archived
        if ($carton['status'] === 'archived') {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Cannot move archived carton'], 400);
        }
        
        // Check if location is actually changing
        if ($carton['location'] === $newLocation) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Carton is already in ' . $newLocation], 400);
        }
        
        $oldLocation = $carton['location'];
        
        // Update carton location
        $updateSql = "UPDATE cartons SET location = ?, updated_at = CURRENT_TIMESTAMP WHERE carton_id = ?";
        $stmt = $db->prepare($updateSql);
        $stmt->execute([$newLocation, $cartonId]);
        
        // Log the movement (we could add a carton_movement_log table later for audit trail)
        // For now, we'll use the notes in the response
        
        // Commit transaction
        $db->commit();
        
        sendJSON([
            'success' => true,
            'message' => "Carton {$carton['carton_number']} moved from {$oldLocation} to {$newLocation}",
            'carton' => [
                'carton_id' => $carton['carton_id'],
                'carton_number' => $carton['carton_number'],
                'old_location' => $oldLocation,
                'new_location' => $newLocation
            ]
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Move carton error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
