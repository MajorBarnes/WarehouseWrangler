<?php
/**
 * WarehouseWrangler - Create Shipment
 * 
 * Creates a new shipment batch to Amazon
 * 
 * @method POST
 * @body JSON: { "shipment_reference": string, "shipment_date": string, "notes": string }
 * @returns JSON: { "success": bool, "shipment_id": int, "shipment": object }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle OPTIONS preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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
    
    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data) {
        sendJSON(['success' => false, 'error' => 'Invalid JSON data'], 400);
    }
    
    // Validate required fields
    if (!isset($data['shipment_reference']) || empty($data['shipment_reference'])) {
        sendJSON(['success' => false, 'error' => 'Shipment reference is required'], 400);
    }
    
    if (!isset($data['shipment_date']) || empty($data['shipment_date'])) {
        sendJSON(['success' => false, 'error' => 'Shipment date is required'], 400);
    }
    
    $shipmentReference = trim($data['shipment_reference']);
    $shipmentDate = $data['shipment_date'];
    $notes = isset($data['notes']) ? trim($data['notes']) : '';
    
    // Validate date format (YYYY-MM-DD)
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $shipmentDate)) {
        sendJSON(['success' => false, 'error' => 'Invalid date format. Use YYYY-MM-DD'], 400);
    }
    
    // Get database connection
    $db = getDBConnection();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // Check if shipment reference already exists
        $checkSql = "SELECT shipment_id FROM amazon_shipments WHERE shipment_reference = ?";
        $stmt = $db->prepare($checkSql);
        $stmt->execute([$shipmentReference]);
        
        if ($stmt->fetch()) {
            $db->rollBack();
            sendJSON(['success' => false, 'error' => 'Shipment reference already exists. Please use a unique reference.'], 400);
        }
        
        // Create shipment with status 'prepared'
        $insertSql = "
            INSERT INTO amazon_shipments 
            (shipment_reference, shipment_date, notes, status, created_by, created_at, updated_at)
            VALUES (?, ?, ?, 'prepared', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ";
        
        $stmt = $db->prepare($insertSql);
        $stmt->execute([$shipmentReference, $shipmentDate, $notes, $userId]);
        
        $shipmentId = $db->lastInsertId();
        
        // Get the created shipment
        $getSql = "
            SELECT 
                shipment_id,
                shipment_reference,
                shipment_date,
                notes,
                status,
                created_by,
                created_at,
                updated_at
            FROM amazon_shipments
            WHERE shipment_id = ?
        ";
        
        $stmt = $db->prepare($getSql);
        $stmt->execute([$shipmentId]);
        $shipment = $stmt->fetch();
        
        // Commit transaction
        $db->commit();
        
        sendJSON([
            'success' => true,
            'message' => 'Shipment created successfully',
            'shipment_id' => $shipmentId,
            'shipment' => $shipment
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Create shipment error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>