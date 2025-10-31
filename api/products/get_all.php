<?php
/**
 * WarehouseWrangler - Get All Products
 * 
 * Returns list of all products with seasonal factors
 * 
 * UPDATED: Now links seasonal factors by product_id (not product_name)
 * 
 * @method GET
 * @returns JSON: { "success": bool, "products": array }
 */

define('WAREHOUSEWRANGLER', true);
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth/require_auth.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // Authenticate request
    $claims = require_auth();
    
    $db = getDBConnection();

    $viewColumns = [];
    try {
        $colStmt = $db->prepare("
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'v_product_stock_summary'
        ");
        $colStmt->execute();
        $viewColumns = array_map(static function ($row) {
            return strtolower($row['COLUMN_NAME']);
        }, $colStmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        $viewColumns = [];
    }

    $hasView = !empty($viewColumns);
    $hasAvgSales = in_array('average_weekly_sales', $viewColumns, true);
    $hasPairsPerBox = in_array('pairs_per_box', $viewColumns, true);
    $hasIncoming = in_array('incoming_pairs', $viewColumns, true);
    $hasIncomingBoxes = in_array('incoming_boxes', $viewColumns, true);
    $hasWml = in_array('wml_pairs', $viewColumns, true);
    $hasWmlBoxes = in_array('wml_boxes', $viewColumns, true);
    $hasGmr = in_array('gmr_pairs', $viewColumns, true);
    $hasGmrBoxes = in_array('gmr_boxes', $viewColumns, true);
    $hasAmz = in_array('amz_pairs', $viewColumns, true);

    $selectParts = [
        'p.product_id',
        'p.artikel',
        'p.fnsku',
        'p.asin',
        'p.sku',
        'p.ean',
        'p.product_name',
        'p.color',
        'p.created_at',
        'p.updated_at',
        'psf.factor_jan',
        'psf.factor_feb',
        'psf.factor_mar',
        'psf.factor_apr',
        'psf.factor_may',
        'psf.factor_jun',
        'psf.factor_jul',
        'psf.factor_aug',
        'psf.factor_sep',
        'psf.factor_oct',
        'psf.factor_nov',
        'psf.factor_dec'
    ];

    if ($hasAvgSales) {
        $selectParts[] = 'COALESCE(v.average_weekly_sales, p.average_weekly_sales) AS average_weekly_sales';
    } else {
        $selectParts[] = 'p.average_weekly_sales AS average_weekly_sales';
    }

    if ($hasPairsPerBox) {
        $selectParts[] = 'COALESCE(v.pairs_per_box, p.pairs_per_box) AS pairs_per_box';
    } else {
        $selectParts[] = 'p.pairs_per_box AS pairs_per_box';
    }

    $selectParts[] = $hasIncoming ? 'COALESCE(v.incoming_pairs, 0) AS incoming_pairs' : '0 AS incoming_pairs';
    $selectParts[] = $hasIncomingBoxes ? 'COALESCE(v.incoming_boxes, 0) AS incoming_boxes' : '0 AS incoming_boxes';
    $selectParts[] = $hasWml ? 'COALESCE(v.wml_pairs, 0) AS wml_pairs' : '0 AS wml_pairs';
    $selectParts[] = $hasWmlBoxes ? 'COALESCE(v.wml_boxes, 0) AS wml_boxes' : '0 AS wml_boxes';
    $selectParts[] = $hasGmr ? 'COALESCE(v.gmr_pairs, 0) AS gmr_pairs' : '0 AS gmr_pairs';
    $selectParts[] = $hasGmrBoxes ? 'COALESCE(v.gmr_boxes, 0) AS gmr_boxes' : '0 AS gmr_boxes';
    $selectParts[] = $hasAmz ? 'COALESCE(v.amz_pairs, 0) AS amz_pairs' : '0 AS amz_pairs';

    $sql = "SELECT\n            " . implode(",\n            ", $selectParts) . "\n        FROM products p";

    if ($hasView) {
        $sql .= "\n        LEFT JOIN v_product_stock_summary v ON v.product_id = p.product_id";
    }

    $sql .= "\n        LEFT JOIN product_sales_factors psf ON p.product_id = psf.product_id\n        ORDER BY p.artikel ASC";

    $stmt = $db->query($sql);
    
    $products = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Extract seasonal factors
        $factors = [
            'jan' => (float)($row['factor_jan'] ?? 1.0),
            'feb' => (float)($row['factor_feb'] ?? 1.0),
            'mar' => (float)($row['factor_mar'] ?? 1.0),
            'apr' => (float)($row['factor_apr'] ?? 1.0),
            'may' => (float)($row['factor_may'] ?? 1.0),
            'jun' => (float)($row['factor_jun'] ?? 1.0),
            'jul' => (float)($row['factor_jul'] ?? 1.0),
            'aug' => (float)($row['factor_aug'] ?? 1.0),
            'sep' => (float)($row['factor_sep'] ?? 1.0),
            'oct' => (float)($row['factor_oct'] ?? 1.0),
            'nov' => (float)($row['factor_nov'] ?? 1.0),
            'dec' => (float)($row['factor_dec'] ?? 1.0)
        ];
        
        // Build product object
        $pairsPerBox = (float)($row['pairs_per_box'] ?? 0);

        $incomingPairs = (float)($row['incoming_pairs'] ?? 0);
        if (!$hasIncoming && $hasIncomingBoxes) {
            $incomingPairs = (float)($row['incoming_boxes'] ?? 0) * $pairsPerBox;
        }

        $wmlPairs = (float)($row['wml_pairs'] ?? 0);
        if (!$hasWml && $hasWmlBoxes) {
            $wmlPairs = (float)($row['wml_boxes'] ?? 0) * $pairsPerBox;
        }

        $gmrPairs = (float)($row['gmr_pairs'] ?? 0);
        if (!$hasGmr && $hasGmrBoxes) {
            $gmrPairs = (float)($row['gmr_boxes'] ?? 0) * $pairsPerBox;
        }
        $amzPairs = (float)($row['amz_pairs'] ?? 0);

        $product = [
            'product_id' => (int)$row['product_id'],
            'artikel' => $row['artikel'],
            'fnsku' => $row['fnsku'],
            'asin' => $row['asin'],
            'sku' => $row['sku'],
            'ean' => $row['ean'],
            'product_name' => $row['product_name'],
            'average_weekly_sales' => (float)$row['average_weekly_sales'],
            'pairs_per_box' => (float)$row['pairs_per_box'],
            'incoming_pairs' => $incomingPairs,
            'wml_pairs' => $wmlPairs,
            'gmr_pairs' => $gmrPairs,
            'amz_pairs' => $amzPairs,
            'color' => $row['color'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
            'seasonal_factors' => $factors
        ];

        $product['total_pairs_internal'] = $incomingPairs + $wmlPairs + $gmrPairs;
        $product['total_pairs_all'] = $product['total_pairs_internal'] + $amzPairs;

        $products[] = $product;
    }
    
    sendJSON([
        'success' => true,
        'products' => $products,
        'count' => count($products)
    ]);
    
} catch (PDOException $e) {
    error_log("Get products error (PDO): " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log("Get products error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error: ' . $e->getMessage()], 500);
}
?>
