<?php
define('WAREHOUSEWRANGLER', true);
declare(strict_types=1);

// 1) Never show notices/warnings in API responses
ini_set('display_errors', '0');
error_reporting(E_ERROR | E_PARSE);

// 2) OWN an output buffer before any include
ob_start();
require_once __DIR__ . '/../config.php';   // <-- do NOT echo/print this
$leakedBefore = ob_get_contents();          // capture anything that leaked (like '1')
ob_end_clean();                             // fully end & discard that buffer

// 3) Acquire PDO from config (covers $pdo, $db, function helpers)
$pdo = $pdo ?? ($db ?? (function_exists('getDBConnection') ? getDBConnection() : (function_exists('getPDO') ? getPDO() : (function_exists('db') ? db() : null))));
if (!$pdo instanceof PDO) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'DB handle not available', 'leaked' => $leakedBefore ?: null]);
    exit;
}

// 4) Now send headers for our JSON
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

try {
    $productId       = isset($_GET['product_id']) ? (int)$_GET['product_id'] : null;
    $includeSim      = !empty($_GET['include_simulations']) && $_GET['include_simulations'] === '1';
    $includeFuture   = !empty($_GET['include_future'])      && $_GET['include_future'] === '1';
    $includeInactive = !empty($_GET['include_inactive'])    && $_GET['include_inactive'] === '1';

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "
        SELECT
          ps.id,
          ps.product_id,
          p.product_name,
          p.pairs_per_box,
          ps.quantity_boxes,
          ps.eta_date,
          ps.scope,
          ps.label,
          ps.is_active
        FROM planned_stock ps
        JOIN products p ON p.product_id = ps.product_id
        WHERE ps.bucket = 'Additional'
          AND (:pid IS NULL OR ps.product_id = :pid)
          AND (:sim = 1 OR ps.scope = 'committed')
          AND (:future = 1 OR ps.eta_date IS NULL OR ps.eta_date <= CURDATE())
          AND (:inactive = 1 OR ps.is_active = 1)
        ORDER BY ps.product_id, ps.scope, COALESCE(ps.eta_date, '1970-01-01'), ps.id
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':pid'      => $productId,
        ':sim'      => $includeSim ? 1 : 0,
        ':future'   => $includeFuture ? 1 : 0,
        ':inactive' => $includeInactive ? 1 : 0,
    ]);

    // Final JSON (and we’ll also report any pre-include leak once to help you find it)
    echo json_encode([
        'success' => true,
        'data'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
        'leaked'  => $leakedBefore === '' ? null : substr($leakedBefore, 0, 200)
    ], JSON_UNESCAPED_UNICODE);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}
