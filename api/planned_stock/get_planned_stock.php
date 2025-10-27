<?php
/**
 * WarehouseWrangler - Get Planned Stock (Additional Boxes)
 * 
 * Returns planned additional boxes per product (boxes, not cartons).
 * Default behavior: only committed, ETA <= today (or NULL), and is_active=1.
 * 
 * Query string (optional):
 * - product_id (int)
 * - include_simulations (0|1) default 0
 * - include_future (0|1) default 0
 * - include_inactive (0|1) default 0
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';
// require_once '../auth/require_auth.php'; // uncomment if required in your project

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (!function_exists('sendJSON')) {
    function sendJSON($data, $status = 200) {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $db = function_exists('getDBConnection') ? getDBConnection() : null;
    if (!$db) throw new Exception('DB connection not available');

    $productId       = isset($_GET['product_id']) ? (int)$_GET['product_id'] : null;
    $includeSim      = isset($_GET['include_simulations']) && $_GET['include_simulations'] == '1';
    $includeFuture   = isset($_GET['include_future']) && $_GET['include_future'] == '1';
    $includeInactive = isset($_GET['include_inactive']) && $_GET['include_inactive'] == '1';

    $where = ["ps.bucket = 'Additional'"];
    $params = [];

    if ($productId) {
        $where[] = "ps.product_id = :pid";
        $params[':pid'] = $productId;
    }

    if (!$includeInactive) {
        $where[] = "ps.is_active = 1";
    }

    if ($includeSim) {
        $where[] = "ps.scope IN ('committed','simulation')";
    } else {
        $where[] = "ps.scope = 'committed'";
    }

    if (!$includeFuture) {
        $where[] = "(ps.eta_date IS NULL OR ps.eta_date <= CURRENT_DATE())";
    }

    $whereSql = $where ? "WHERE " . implode(" AND ", $where) : "";

    $sql = "
        SELECT
            ps.id,
            ps.product_id,
            p.name AS product_name,
            ps.quantity_boxes,
            ps.bucket,
            ps.eta_date,
            ps.scope,
            ps.label,
            ps.is_active,
            ps.created_at,
            ps.updated_at
        FROM planned_stock ps
        INNER JOIN products p ON p.product_id = ps.product_id

        $whereSql
        ORDER BY ps.product_id, ps.scope, COALESCE(ps.eta_date, '1970-01-01') ASC, ps.id ASC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    sendJSON(['success' => true, 'data' => $rows]);
} catch (Throwable $e) {
    error_log("get_planned_stock error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error'], 500);
}
