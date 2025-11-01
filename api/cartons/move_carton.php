<?php
/**
 * WarehouseWrangler - Move Carton
 * 
 * Updates carton location (moves between warehouses)
 * 
 * @method PUT
 * @body JSON: { "carton_ids": int[], "location": string, "notes": string (optional) }
 * @returns JSON: { "success": bool, "message": string, "summary": array }
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

    if (!is_array($data)) {
        sendJSON(['success' => false, 'error' => 'Invalid JSON data'], 400);
    }

    if (!isset($data['carton_ids']) || !is_array($data['carton_ids']) || count($data['carton_ids']) === 0) {
        sendJSON(['success' => false, 'error' => 'carton_ids array is required'], 400);
    }

    if (!isset($data['location']) || empty($data['location'])) {
        sendJSON(['success' => false, 'error' => 'Location is required'], 400);
    }

    $rawCartonIds = array_map('intval', $data['carton_ids']);
    $cartonIds = array_values(array_unique(array_filter($rawCartonIds, static function ($id) {
        return $id > 0;
    })));

    if (empty($cartonIds)) {
        sendJSON(['success' => false, 'error' => 'At least one valid carton ID is required'], 400);
    }

    $newLocation = $data['location'];
    $notes = trim((string)($data['notes'] ?? ''));

    // Validate location value
    $validLocations = ['Incoming', 'WML', 'GMR'];
    if (!in_array($newLocation, $validLocations, true)) {
        sendJSON(['success' => false, 'error' => 'Invalid location. Must be: Incoming, WML, or GMR'], 400);
    }

    // Get database connection
    $db = getDBConnection();

    // Start transaction
    $db->beginTransaction();

    try {
        $checkStmt = $db->prepare('SELECT carton_id, carton_number, location, status FROM cartons WHERE carton_id = ?');
        $updateStmt = $db->prepare('UPDATE cartons SET location = ?, updated_at = CURRENT_TIMESTAMP WHERE carton_id = ?');

        $moved = [];
        $skipped = [];

        foreach ($cartonIds as $cartonId) {
            $checkStmt->execute([$cartonId]);
            $carton = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if (!$carton) {
                $skipped[] = [
                    'carton_id' => $cartonId,
                    'reason' => 'not_found'
                ];
                continue;
            }

            if ($carton['status'] === 'archived') {
                $skipped[] = [
                    'carton_id' => (int)$carton['carton_id'],
                    'carton_number' => $carton['carton_number'],
                    'reason' => 'archived'
                ];
                continue;
            }

            if ($carton['location'] === $newLocation) {
                $skipped[] = [
                    'carton_id' => (int)$carton['carton_id'],
                    'carton_number' => $carton['carton_number'],
                    'reason' => 'unchanged'
                ];
                continue;
            }

            $updateStmt->execute([$newLocation, $cartonId]);

            $moved[] = [
                'carton_id' => (int)$carton['carton_id'],
                'carton_number' => $carton['carton_number'],
                'old_location' => $carton['location'],
                'new_location' => $newLocation
            ];
        }

        $db->commit();

        $requestedCount = count($cartonIds);
        $movedCount = count($moved);
        $skippedCount = count($skipped);

        if ($movedCount === 0) {
            $message = 'Keine Cartons wurden bewegt.';
        } elseif ($movedCount === 1) {
            $message = "1 Carton wurde nach {$newLocation} verschoben.";
        } else {
            $message = "{$movedCount} Cartons wurden nach {$newLocation} verschoben.";
        }

        sendJSON([
            'success' => true,
            'message' => $message,
            'summary' => [
                'requested' => $requestedCount,
                'moved' => $movedCount,
                'skipped_count' => $skippedCount,
                'skipped' => $skipped,
                'target_location' => $newLocation,
                'notes' => $notes,
                'processed_by' => $userId
            ],
            'moved_cartons' => $moved
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
