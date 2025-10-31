<?php
/**
 * WarehouseWrangler - Delete Planned Stock (Additional Boxes)
 * 
 * @method POST (mirrors users API style)
 * Body JSON:
 * {
 *   "id": int,
 *   "hard": false   // optional; default soft delete (is_active=0). If true -> hard delete.
 * }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';
require_once __DIR__ . '/../auth/require_auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$token = get_bearer_token();
if (!$token) {
    send_unauthorized('No authorization token provided');
}

$claims = verify_jwt($token);
if (!$claims) {
    send_unauthorized('Invalid or expired token');
}

if (!function_exists('sendJSON')) {
    function sendJSON($data, $status = 200) {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function readJSON() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
    }

    $db = function_exists('getDBConnection') ? getDBConnection() : null;
    if (!$db) throw new Exception('DB connection not available');

    $in = readJSON();
    $id   = isset($in['id']) ? (int)$in['id'] : 0;
    $hard = !empty($in['hard']);

    if ($id < 1) {
        sendJSON(['success' => false, 'error' => 'id is required'], 400);
    }

    if ($hard) {
        $stmt = $db->prepare("DELETE FROM planned_stock WHERE id = :id");
        $stmt->execute([':id' => $id]);
        sendJSON(['success' => true, 'deleted' => 'hard']);
    } else {
        $stmt = $db->prepare("UPDATE planned_stock SET is_active = 0 WHERE id = :id");
        $stmt->execute([':id' => $id]);
        sendJSON(['success' => true, 'deleted' => 'soft']);
    }
} catch (Throwable $e) {
    error_log("delete_planned_stock error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error'], 500);
}
