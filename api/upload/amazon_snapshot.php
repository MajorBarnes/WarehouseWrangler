<?php
/**
 * WarehouseWrangler - Amazon Snapshot Upload & Parser
 * 
 * Handles Amazon "Manage FBA Inventory" CSV upload, parsing, and database import
 * REPLACES existing snapshot data for the same date
 * 
 * @method POST
 * @param file - CSV file
 * @param action - 'preview' or 'confirm'
 * @returns JSON: parsed data or import results
 */

define('WAREHOUSEWRANGLER', true);
require_once '../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJSON(['success' => false, 'error' => 'Method not allowed'], 405);
}

try {
    // ========================================================================
    // AUTHENTICATION CHECK (Same pattern as lc_file.php)
    // ========================================================================
    
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
    
    // Extract user ID for logging
    $userId = $payload['user_id'] ?? null;
    
    // ========================================================================
    // FILE VALIDATION
    // ========================================================================
    
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        sendJSON(['success' => false, 'error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['file'];
    $action = $_POST['action'] ?? 'preview';
    
    // Validate file extension
    $fileName = $file['name'];
    $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    
    if ($fileExt !== 'csv') {
        sendJSON(['success' => false, 'error' => 'Only CSV files are allowed'], 400);
    }
    
    // Validate file size (5MB max)
    $maxSize = 5 * 1024 * 1024;
    if ($file['size'] > $maxSize) {
        sendJSON(['success' => false, 'error' => 'File too large. Maximum 5MB'], 400);
    }
    
    // Read file content
    $csvContent = file_get_contents($file['tmp_name']);
    
    if ($csvContent === false) {
        sendJSON(['success' => false, 'error' => 'Could not read file'], 500);
    }
    
    // ========================================================================
    // PARSE CSV
    // ========================================================================
    
    $parseResult = parseAmazonSnapshot($csvContent);
    
    if (!$parseResult['success']) {
        sendJSON(['success' => false, 'error' => $parseResult['error']], 400);
    }
    
    // ========================================================================
    // PREVIEW MODE - Return parsed data
    // ========================================================================
    
    if ($action === 'preview') {
        sendJSON([
            'success' => true,
            'action' => 'preview',
            'data' => $parseResult['data']
        ]);
    }
    
    // ========================================================================
    // CONFIRM MODE - Import to database
    // ========================================================================
    
    if ($action === 'confirm') {
        $db = getDBConnection();
        
        $importResult = importToDatabase($db, $parseResult['data'], $userId, $fileName);
        
        if (!$importResult['success']) {
            sendJSON(['success' => false, 'error' => $importResult['error']], 500);
        }
        
        sendJSON([
            'success' => true,
            'action' => 'saved',
            'message' => 'Successfully imported ' . $importResult['productsImported'] . ' products',
            'data' => $importResult
        ]);
    }
    
    sendJSON(['success' => false, 'error' => 'Invalid action'], 400);
    
} catch (Exception $e) {
    error_log("Amazon snapshot upload error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse Amazon snapshot CSV file
 * @param string $csvContent - Raw CSV content
 * @return array - ['success' => bool, 'data' => array, 'error' => string]
 */
function parseAmazonSnapshot($csvContent) {
    $result = [
        'success' => false,
        'data' => [
            'snapshotDate' => null,
            'products' => [],
            'statistics' => [
                'totalProducts' => 0,
                'totalBoxes' => 0,
                'rowsProcessed' => 0
            ],
            'warnings' => []
        ],
        'error' => null
    ];
    
    // Strip BOM if present
    $csvContent = preg_replace('/^\xEF\xBB\xBF/', '', $csvContent);
    
    // Split into lines (handle both \r\n and \n)
    $lines = preg_split('/\r?\n/', $csvContent);
    
    if (count($lines) < 2) {
        $result['error'] = 'File appears to be empty or too short';
        return $result;
    }
    
    // Parse CSV rows (comma-separated for Amazon reports)
    $rows = array_map(function($line) {
        return str_getcsv($line, ',');
    }, $lines);
    
    // Find header row (contains "snapshot-date", "fnsku", "available")
    $headerIndex = -1;
    for ($i = 0; $i < min(3, count($rows)); $i++) {
        $rowStr = strtolower(implode('|', $rows[$i]));
        if (strpos($rowStr, 'snapshot-date') !== false && strpos($rowStr, 'fnsku') !== false) {
            $headerIndex = $i;
            break;
        }
    }
    
    if ($headerIndex === -1) {
        $result['error'] = 'Could not find header row with required columns (snapshot-date, fnsku, available)';
        return $result;
    }
    
    $headers = $rows[$headerIndex];
    
    // Find column indices
    $colIndices = findColumnIndices($headers);
    
    if ($colIndices['snapshotDate'] === -1) {
        $result['error'] = 'snapshot-date column not found';
        return $result;
    }
    
    if ($colIndices['fnsku'] === -1) {
        $result['error'] = 'fnsku column not found';
        return $result;
    }
    
    if ($colIndices['available'] === -1) {
        $result['error'] = 'available column not found';
        return $result;
    }
    
    // Parse data rows
    $dataRows = array_slice($rows, $headerIndex + 1);
    $products = [];
    $snapshotDate = null;
    $totalBoxes = 0;
    $rowsProcessed = 0;
    
    foreach ($dataRows as $idx => $row) {
        $lineNum = $headerIndex + $idx + 2;
        
        // Skip if row is too short
        if (count($row) < max($colIndices['snapshotDate'], $colIndices['fnsku'], $colIndices['available']) + 1) {
            continue;
        }
        
        // Get values
        $dateStr = trim($row[$colIndices['snapshotDate']] ?? '');
        $fnsku = trim($row[$colIndices['fnsku']] ?? '');
        $sku = trim($row[$colIndices['sku']] ?? '');
        $productName = trim($row[$colIndices['productName']] ?? '');
        $availableStr = trim($row[$colIndices['available']] ?? '');
        
        // Skip if no FNSKU
        if (empty($fnsku)) {
            continue;
        }
        
        // Get snapshot date from first row
        if ($snapshotDate === null && !empty($dateStr)) {
            $snapshotDate = $dateStr;
        }
        
        // Validate available quantity
        $available = intval($availableStr);
        if ($available < 0) {
            $result['data']['warnings'][] = [
                'line' => $lineNum,
                'message' => "Invalid available quantity for FNSKU $fnsku"
            ];
            continue;
        }
        
        $products[] = [
            'fnsku' => $fnsku,
            'sku' => $sku,
            'product_name' => $productName,
            'available_boxes' => $available
        ];
        
        $totalBoxes += $available;
        $rowsProcessed++;
    }
    
    if (empty($snapshotDate)) {
        $result['error'] = 'Could not extract snapshot date from file';
        return $result;
    }
    
    if (empty($products)) {
        $result['error'] = 'No valid product data found in file';
        return $result;
    }
    
    // Update statistics
    $result['data']['snapshotDate'] = $snapshotDate;
    $result['data']['products'] = $products;
    $result['data']['statistics']['totalProducts'] = count($products);
    $result['data']['statistics']['totalBoxes'] = $totalBoxes;
    $result['data']['statistics']['rowsProcessed'] = $rowsProcessed;
    
    $result['success'] = true;
    
    return $result;
}

/**
 * Find column indices in header row
 */
function findColumnIndices($headers) {
    $indices = [
        'snapshotDate' => -1,
        'fnsku' => -1,
        'sku' => -1,
        'productName' => -1,
        'available' => -1
    ];
    
    foreach ($headers as $idx => $header) {
        $headerLower = strtolower(trim($header));
        
        if (strpos($headerLower, 'snapshot-date') !== false) {
            $indices['snapshotDate'] = $idx;
        }
        if (strpos($headerLower, 'fnsku') !== false) {
            $indices['fnsku'] = $idx;
        }
        if (strpos($headerLower, 'sku') !== false && strpos($headerLower, 'fnsku') === false) {
            $indices['sku'] = $idx;
        }
        if (strpos($headerLower, 'product-name') !== false) {
            $indices['productName'] = $idx;
        }
        if ($headerLower === 'available') {
            $indices['available'] = $idx;
        }
    }
    
    return $indices;
}

// ============================================================================
// DATABASE IMPORT FUNCTIONS
// ============================================================================

/**
 * Import parsed data to database
 * REPLACES existing snapshot data for the same date
 * 
 * @param PDO $db - Database connection
 * @param array $data - Parsed snapshot data
 * @param int $userId - User ID for logging
 * @param string $fileName - Original filename
 * @return array - ['success' => bool, 'productsImported' => int, 'error' => string]
 */
function importToDatabase($db, $data, $userId, $fileName) {
    $result = [
        'success' => false,
        'productsImported' => 0,
        'snapshotDate' => $data['snapshotDate'],
        'error' => null
    ];
    
    try {
        $db->beginTransaction();
        
        // ========================================================================
        // 1. DELETE EXISTING SNAPSHOT FOR THIS DATE
        // ========================================================================
        
        $deleteStmt = $db->prepare("
            DELETE FROM amazon_snapshots 
            WHERE snapshot_date = :snapshot_date
        ");
        
        $deleteStmt->execute(['snapshot_date' => $data['snapshotDate']]);
        
        $deletedRows = $deleteStmt->rowCount();
        
        // ========================================================================
        // 2. INSERT NEW SNAPSHOT DATA
        // ========================================================================
        
        $insertStmt = $db->prepare("
            INSERT INTO amazon_snapshots 
            (snapshot_date, fnsku, available_boxes, uploaded_by, upload_date)
            VALUES (:snapshot_date, :fnsku, :available_boxes, :uploaded_by, NOW())
        ");
        
        foreach ($data['products'] as $product) {
            $insertStmt->execute([
                'snapshot_date' => $data['snapshotDate'],
                'fnsku' => $product['fnsku'],
                'available_boxes' => $product['available_boxes'],
                'uploaded_by' => $userId
            ]);
        }
        
        $result['productsImported'] = count($data['products']);
        
        // ========================================================================
        // 3. LOG UPLOAD
        // ========================================================================
        
        $stmt = $db->prepare("
            INSERT INTO upload_history (user_id, file_type, file_name, records_imported, upload_status)
            VALUES (:user_id, 'amazon_snapshot', :file_name, :records_imported, 'success')
        ");
        
        $stmt->execute([
            'user_id' => $userId,
            'file_name' => $fileName,
            'records_imported' => $result['productsImported']
        ]);
        
        $db->commit();
        
        $result['success'] = true;
        $result['deletedRows'] = $deletedRows;
        
        return $result;
        
    } catch (Exception $e) {
        $db->rollBack();
        $result['error'] = $e->getMessage();
        return $result;
    }
}
?>
