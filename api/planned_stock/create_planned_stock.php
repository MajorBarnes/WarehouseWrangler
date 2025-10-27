<?php
/**
 * WarehouseWrangler - Create Planned Stock (Additional Boxes)
 * 
 * @method POST
 * Body JSON:
 * {
 *   "product_id": int,            // required
 *   "quantity_boxes": int,        // required, >= 1
 *   "eta_date": "YYYY-MM-DD"|null,
 *   "scope": "committed"|"simulation",
 *   "label": "text",
 *   "is_active": true|false
 * }
 * bucket is always 'Additional' here.
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';
// require_once '../auth/require_auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

    $productId = isset($in['product_id']) ? (int)$in['product_id'] : 0;
    $qtyBoxes  = isset($in['quantity_boxes']) ? (int)$in['quantity_boxes'] : 0;
    $etaDate   = array_key_exists('eta_date', $in) ? $in['eta_date'] : null;
    $scope     = isset($in['scope']) ? $in['scope'] : 'committed';
    $label     = isset($in['label']) ? trim((string)$in['label']) : null;
    $isActive  = array_key_exists('is_active', $in) ? (bool)$in['is_active'] : true;

    if ($productId < 1)  sendJSON(['success' => false, 'error' => 'product_id is required'], 400);
    if ($qtyBoxes < 1)   sendJSON(['success' => false, 'error' => 'quantity_boxes must be >= 1'], 400);
    if ($etaDate !== null && $etaDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $etaDate)) {
        sendJSON(['success' => false, 'error' => 'Invalid eta_date'], 400);
    }
    if ($scope !== 'committed' && $scope !== 'simulation') {
        sendJSON(['success' => false, 'error' => 'Invalid scope'], 400);
    }

    $sql = "
        INSERT INTO planned_stock
            (product_id, quantity_boxes, bucket, eta_date, scope, label, is_active)
        VALUES
            (:pid, :qb, 'Additional', :eta, :scope, :label, :ia)
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute([
        ':pid'   => $productId,
        ':qb'    => $qtyBoxes,
        ':eta'   => ($etaDate === '' ? null : $etaDate),
        ':scope' => $scope,
        ':label' => $label,
        ':ia'    => $isActive ? 1 : 0,
    ]);

    $newId = (int)$db->lastInsertId();
    $stmt = $db->prepare("SELECT * FROM planned_stock WHERE id = :id");
    $stmt->execute([':id' => $newId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    sendJSON(['success' => true, 'data' => $row]);
} catch (Throwable $e) {
    error_log("create_planned_stock error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error'], 500);
}
