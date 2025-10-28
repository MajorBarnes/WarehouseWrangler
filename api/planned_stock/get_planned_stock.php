<?php
declare(strict_types=1);

define('WAREHOUSEWRANGLER', true);

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
    $includeSim      = isset($_GET['include_simulations']) && $_GET['include_simulations'] === '1';
    $includeFuture   = isset($_GET['include_future'])      && $_GET['include_future'] === '1';
    $includeInactive = isset($_GET['include_inactive'])    && $_GET['include_inactive'] === '1';

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $columnNames = [];
    try {
        $colStmt = $pdo->query('SHOW COLUMNS FROM planned_stock');
        $columnNames = array_values(array_filter(array_map(static function ($row) {
            return strtolower($row['Field'] ?? '');
        }, $colStmt->fetchAll(PDO::FETCH_ASSOC))));
    } catch (Throwable $e) {
        // If SHOW COLUMNS fails (permissions, etc.), fall back to assuming minimal schema
        $columnNames = [];
    }

    $hasColumn = static function (array $columns, string $name): bool {
        return in_array(strtolower($name), $columns, true);
    };

    $hasBucket    = $hasColumn($columnNames, 'bucket');
    $hasScope     = $hasColumn($columnNames, 'scope');
    $hasLabel     = $hasColumn($columnNames, 'label');
    $hasEta       = $hasColumn($columnNames, 'eta_date');
    $hasIsActive  = $hasColumn($columnNames, 'is_active');

    $selectParts = [
        'ps.id',
        'ps.product_id',
        'p.product_name',
        'p.pairs_per_box',
        'ps.quantity_boxes',
    ];
    $selectParts[] = $hasEta ? 'ps.eta_date' : "NULL AS eta_date";
    $selectParts[] = $hasScope ? 'ps.scope' : "'committed' AS scope";
    $selectParts[] = $hasLabel ? 'ps.label' : 'NULL AS label';
    $selectParts[] = $hasIsActive ? 'ps.is_active' : '1 AS is_active';

    $whereParts = [];
    if ($hasBucket) {
        $whereParts[] = "ps.bucket = 'Additional'";
    }
    if ($productId !== null) {
        $whereParts[] = 'ps.product_id = :pid';
    }
    if ($hasScope && !$includeSim) {
        $whereParts[] = "ps.scope = 'committed'";
    }
    if ($hasEta && !$includeFuture) {
        $whereParts[] = '(ps.eta_date IS NULL OR ps.eta_date <= CURDATE())';
    }
    if ($hasIsActive && !$includeInactive) {
        $whereParts[] = 'ps.is_active = 1';
    }

    $orderParts = ['ps.product_id'];
    if ($hasScope) {
        $orderParts[] = 'ps.scope';
    }
    if ($hasEta) {
        $orderParts[] = "COALESCE(ps.eta_date, '1970-01-01')";
    }
    $orderParts[] = 'ps.id';

    if (empty($whereParts)) {
        $whereParts[] = '1=1';
    }

    $sql = 'SELECT ' . implode(",\n          ", $selectParts) . "\n        FROM planned_stock ps\n        JOIN products p ON p.product_id = ps.product_id\n        WHERE " . implode("\n          AND ", $whereParts) . "\n        ORDER BY " . implode(', ', $orderParts);

    $stmt = $pdo->prepare($sql);
    if ($productId !== null) {
        $stmt->bindValue(':pid', $productId, PDO::PARAM_INT);
    }
    $stmt->execute();

    // Final JSON (and we’ll also report any pre-include leak once to help you find it)
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        if (!array_key_exists('scope', $row) || $row['scope'] === null || $row['scope'] === '') {
            $row['scope'] = 'committed';
        }
        if (!array_key_exists('label', $row)) {
            $row['label'] = null;
        }
        if (!array_key_exists('is_active', $row)) {
            $row['is_active'] = 1;
        }
        if (!array_key_exists('eta_date', $row)) {
            $row['eta_date'] = null;
        } elseif ($row['eta_date'] === '') {
            $row['eta_date'] = null;
        }
    }
    unset($row);

    echo json_encode([
        'success' => true,
        'data'    => $rows,
        'leaked'  => $leakedBefore === '' ? null : substr($leakedBefore, 0, 200)
    ], JSON_UNESCAPED_UNICODE);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}
