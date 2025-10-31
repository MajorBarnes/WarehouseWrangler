<?php
/**
 * WarehouseWrangler - Update Planned Stock (Additional Boxes)
 * 
 * @method POST (mirrors users API style)
 * Body JSON:
 * {
 *   "id": int,                       // required
 *   "product_id": int,               // optional
 *   "quantity_boxes": int,           // optional (>= 0; 0 keeps value)
 *   "eta_date": "YYYY-MM-DD"|null,   // optional
 *   "scope": "committed"|"simulation", // optional
 *   "label": "text",                 // optional
 *   "is_active": true|false          // optional
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

    $id = isset($in['id']) ? (int)$in['id'] : 0;
    if ($id < 1) sendJSON(['success' => false, 'error' => 'id is required'], 400);

    $fields = [];
    $params = [':id' => $id];

    if (isset($in['product_id'])) {
        $fields[] = "product_id = :pid";
        $params[':pid'] = (int)$in['product_id'];
    }
    if (isset($in['quantity_boxes'])) {
        $qb = (int)$in['quantity_boxes'];
        if ($qb < 0) sendJSON(['success' => false, 'error' => 'quantity_boxes must be >= 0'], 400);
        $fields[] = "quantity_boxes = :qb";
        $params[':qb'] = $qb;
    }
    if (array_key_exists('eta_date', $in)) {
        $eta = $in['eta_date'];
        if ($eta !== null && $eta !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $eta)) {
            sendJSON(['success' => false, 'error' => 'Invalid eta_date'], 400);
        }
        $fields[] = "eta_date = :eta";
        $params[':eta'] = ($eta === '' ? null : $eta);
    }
    if (isset($in['scope'])) {
        $scope = $in['scope'];
        if ($scope !== 'committed' && $scope !== 'simulation') {
            sendJSON(['success' => false, 'error' => 'Invalid scope'], 400);
        }
        $fields[] = "scope = :scope";
        $params[':scope'] = $scope;
    }
    if (isset($in['label'])) {
        $fields[] = "label = :label";
        $params[':label'] = trim((string)$in['label']);
    }
    if (isset($in['is_active'])) {
        $fields[] = "is_active = :ia";
        $params[':ia'] = $in['is_active'] ? 1 : 0;
    }

    if (!$fields) {
        sendJSON(['success' => false, 'error' => 'Nothing to update'], 400);
    }

    // bucket is fixed to 'Additional' by design (no update path)
    $sql = "UPDATE planned_stock SET " . implode(", ", $fields) . " WHERE id = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $stmt = $db->prepare("SELECT * FROM planned_stock WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    sendJSON(['success' => true, 'data' => $row]);
} catch (Throwable $e) {
    error_log("update_planned_stock error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error'], 500);
}
