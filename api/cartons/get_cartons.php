<?php
/**
 * WarehouseWrangler - Get Cartons
 * 
 * Returns list of cartons with optional filtering
 * 
 * @method GET
 * @param string location (optional) - Filter by location: Incoming, WML, GMR
 * @param string status (optional) - Filter by status: in stock, empty, archived
 * @param string search (optional) - Search by carton number, product name, or FNSKU
 * @returns JSON: { "success": bool, "cartons": array, "summary": object }
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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
    
    // Get database connection
    $db = getDBConnection();
    
    // Build query with optional filters
    $where = [];
    $params = [];
    
    // Filter by location
    if (isset($_GET['location']) && !empty($_GET['location'])) {
        $where[] = "c.location = ?";
        $params[] = $_GET['location'];
    }
    
    // Filter by status
    if (isset($_GET['status']) && !empty($_GET['status'])) {
        $where[] = "c.status = ?";
        $params[] = $_GET['status'];
    }
    
    // Search by carton number, product name, or FNSKU
    if (isset($_GET['search']) && !empty($_GET['search'])) {
        $searchTerm = '%' . $_GET['search'] . '%';
        $where[] = "(c.carton_number LIKE ? OR p.product_name LIKE ? OR p.fnsku LIKE ?)";
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
    }

    $whereClause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

    // Get cartons with their contents
    $sql = "
        SELECT DISTINCT
            c.carton_id,
            c.carton_number,
            c.location,
            c.status,
            c.created_at,
            c.updated_at,
            COUNT(DISTINCT cc.product_id) as product_count,
            SUM(cc.boxes_current) as total_boxes_current,
            SUM(cc.boxes_initial) as total_boxes_initial,
            SUM(cc.boxes_sent_to_amazon) as total_boxes_sent
        FROM cartons c
        LEFT JOIN carton_contents cc ON c.carton_id = cc.carton_id
        LEFT JOIN products p ON cc.product_id = p.product_id
        $whereClause
        GROUP BY c.carton_id
        ORDER BY c.created_at DESC
    ";
    
    $stmt = $db->prepare($sql);
    
    if (!empty($params)) {
        $stmt->execute($params);
    } else {
        $stmt->execute();
    }
    
    $cartons = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $cartonMetadata = [];
    $cartonProductSeen = [];

    if (!empty($cartons)) {
        $cartonIds = array_map(static function ($carton) {
            return (int)$carton['carton_id'];
        }, $cartons);
        $cartonIds = array_values(array_unique($cartonIds));

        $placeholders = implode(',', array_fill(0, count($cartonIds), '?'));

        $metadataSql = "
            SELECT
                cc.carton_id,
                p.artikel,
                p.fnsku,
                p.product_name AS product_group
            FROM carton_contents cc
            JOIN products p ON cc.product_id = p.product_id
            WHERE cc.carton_id IN ($placeholders)
            ORDER BY p.product_name, p.artikel
        ";

        $metaStmt = $db->prepare($metadataSql);
        $metaStmt->execute($cartonIds);

        while ($row = $metaStmt->fetch(PDO::FETCH_ASSOC)) {
            $cartonId = (int)$row['carton_id'];
            $artikel = $row['artikel'] ?? '';
            $fnsku = $row['fnsku'] ?? '';
            $productGroup = $row['product_group'] ?? '';

            $dedupeKey = $fnsku . '|' . $artikel;

            if (!isset($cartonProductSeen[$cartonId])) {
                $cartonProductSeen[$cartonId] = [];
            }

            if (isset($cartonProductSeen[$cartonId][$dedupeKey])) {
                continue;
            }

            $cartonProductSeen[$cartonId][$dedupeKey] = true;

            if (!isset($cartonMetadata[$cartonId])) {
                $cartonMetadata[$cartonId] = [];
            }

            $cartonMetadata[$cartonId][] = [
                'artikel' => $artikel,
                'product_group' => $productGroup,
                'fnsku' => $fnsku
            ];
        }

        foreach ($cartons as &$carton) {
            $cartonId = (int)$carton['carton_id'];
            $carton['product_metadata'] = $cartonMetadata[$cartonId] ?? [];
        }
        unset($carton);
    }
    
    // Get summary statistics per location
    $summarySql = "
        SELECT 
            c.location,
            COUNT(DISTINCT c.carton_id) as carton_count,
            COUNT(DISTINCT CASE WHEN c.status = 'in stock' THEN c.carton_id END) as in_stock_count,
            COUNT(DISTINCT CASE WHEN c.status = 'empty' THEN c.carton_id END) as empty_count,
            SUM(cc.boxes_current) as total_boxes,
            COUNT(DISTINCT cc.product_id) as unique_products
        FROM cartons c
        LEFT JOIN carton_contents cc ON c.carton_id = cc.carton_id
        GROUP BY c.location
    ";
    
    $summaryStmt = $db->query($summarySql);
    $summaryData = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format summary as associative array
    $summary = [
        'Incoming' => ['carton_count' => 0, 'in_stock_count' => 0, 'empty_count' => 0, 'total_boxes' => 0, 'unique_products' => 0],
        'WML' => ['carton_count' => 0, 'in_stock_count' => 0, 'empty_count' => 0, 'total_boxes' => 0, 'unique_products' => 0],
        'GMR' => ['carton_count' => 0, 'in_stock_count' => 0, 'empty_count' => 0, 'total_boxes' => 0, 'unique_products' => 0]
    ];
    
    foreach ($summaryData as $row) {
        $summary[$row['location']] = [
            'carton_count' => (int)$row['carton_count'],
            'in_stock_count' => (int)$row['in_stock_count'],
            'empty_count' => (int)$row['empty_count'],
            'total_boxes' => (int)($row['total_boxes'] ?? 0),
            'unique_products' => (int)($row['unique_products'] ?? 0)
        ];
    }
    
    sendJSON([
        'success' => true,
        'cartons' => $cartons,
        'summary' => $summary,
        'count' => count($cartons)
    ]);
    
} catch (Exception $e) {
    error_log("Get cartons error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}
?>
