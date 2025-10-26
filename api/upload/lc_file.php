<?php
/**
 * WarehouseWrangler - LC File Upload & Parser
 * 
 * Handles packing list CSV upload, parsing, and database import
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
    // AUTHENTICATION CHECK (Same pattern as get_users.php)
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
    
    $parseResult = parseLCFile($csvContent);
    
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
            'message' => 'Successfully imported ' . $importResult['cartonsCreated'] . ' cartons',
            'data' => $importResult
        ]);
    }
    
    sendJSON(['success' => false, 'error' => 'Invalid action'], 400);
    
} catch (Exception $e) {
    error_log("LC upload error: " . $e->getMessage());
    sendJSON(['success' => false, 'error' => 'Server error occurred'], 500);
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse LC CSV file
 * @param string $csvContent - Raw CSV content
 * @return array - ['success' => bool, 'data' => array, 'error' => string]
 */
function parseLCFile($csvContent) {
    $result = [
        'success' => false,
        'data' => [
            'cartonPrefix' => null,
            'cartons' => [],
            'statistics' => [
                'totalCartons' => 0,
                'uniqueProducts' => 0,
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
    
    if (count($lines) < 3) {
        $result['error'] = 'File appears to be empty or too short';
        return $result;
    }
    
    // Extract carton prefix from first 3 rows
    $cartonPrefix = null;
    for ($i = 0; $i < min(3, count($lines)); $i++) {
        if (preg_match('/(\d{2}SVS\d+)/', $lines[$i], $matches)) {
            $cartonPrefix = $matches[1];
            break;
        }
    }
    
    if (!$cartonPrefix) {
        $result['error'] = 'Could not find carton prefix (e.g., 24SVS88) in file';
        return $result;
    }
    
    $result['data']['cartonPrefix'] = $cartonPrefix;
    
    // Parse CSV rows
    $rows = array_map(function($line) {
        return str_getcsv($line, ';');
    }, $lines);
    
    // Find header row (contains FNSKU and CTN NO)
    $headerIndex = -1;
    for ($i = 0; $i < min(10, count($rows)); $i++) {
        $rowStr = implode('|', $rows[$i]);
        if (stripos($rowStr, 'FNSKU') !== false && stripos($rowStr, 'CTN') !== false) {
            $headerIndex = $i;
            break;
        }
    }
    
    if ($headerIndex === -1) {
        $result['error'] = 'Could not find header row with FNSKU and CTN NO columns';
        return $result;
    }
    
    $headers = $rows[$headerIndex];
    
    // Find column indices
    $colIndices = findColumnIndices($headers);
    
    if ($colIndices['fnsku'] === -1) {
        $result['error'] = 'FNSKU column not found';
        return $result;
    }
    
    // Parse data rows
    $dataRows = array_slice($rows, $headerIndex + 1);
    $currentCartonNumbers = null;
    $currentCartonRange = '';
    $productMap = []; // Track unique products
    $cartonMap = []; // Group products by carton
    $rowsProcessed = 0;
    
    foreach ($dataRows as $idx => $row) {
        $lineNum = $headerIndex + $idx + 2;
        
        // Skip if row is too short
        if (count($row) < max($colIndices['fnsku'], $colIndices['ctnNo'], $colIndices['boxes']) + 1) {
            continue;
        }
        
        // Skip total/summary rows
        if (isset($row[0]) && stripos($row[0], 'TTL') !== false) {
            continue;
        }
        
        // Get values
        $fnsku = trim($row[$colIndices['fnsku']] ?? '');
        $sku = trim($row[$colIndices['sku']] ?? '');
        $ctnNo = trim($row[$colIndices['ctnNo']] ?? '');
        $boxesStr = trim($row[$colIndices['boxes']] ?? '');
        $pairsPerBoxStr = trim($row[$colIndices['pairsPerBox']] ?? '');
        
        // Skip if no FNSKU
        if (empty($fnsku)) {
            continue;
        }
        
        // If CTN NO present, parse new carton set
        if (!empty($ctnNo)) {
            $currentCartonNumbers = parseCartonNumbers($ctnNo, $cartonPrefix);
            $currentCartonRange = $ctnNo;
            
            if (count($currentCartonNumbers) === 0) {
                $result['data']['warnings'][] = [
                    'line' => $lineNum,
                    'message' => "Could not parse carton range: \"$ctnNo\""
                ];
                $currentCartonNumbers = null;
                continue;
            }
        }
        
        // If no current carton set, error
        if ($currentCartonNumbers === null || count($currentCartonNumbers) === 0) {
            $result['data']['warnings'][] = [
                'line' => $lineNum,
                'message' => 'No carton number (first row must have CTN NO)'
            ];
            continue;
        }
        
        // Validate boxes
        $boxes = intval($boxesStr);
        if ($boxes <= 0) {
            $result['data']['warnings'][] = [
                'line' => $lineNum,
                'message' => 'Invalid or missing BOX/CARTON value'
            ];
            continue;
        }
        
        $pairsPerBox = !empty($pairsPerBoxStr) ? intval($pairsPerBoxStr) : null;
        
        // Track unique product
        $productMap[$fnsku] = [
            'fnsku' => $fnsku,
            'sku' => $sku,
            'pairsPerBox' => $pairsPerBox
        ];
        
        // Add to all cartons in current set
        foreach ($currentCartonNumbers as $cartonNumber) {
            if (!isset($cartonMap[$cartonNumber])) {
                $cartonMap[$cartonNumber] = [];
            }
            
            $cartonMap[$cartonNumber][] = [
                'cartonNumber' => $cartonNumber,
                'fnsku' => $fnsku,
                'sku' => $sku,
                'boxes' => $boxes,
                'pairsPerBox' => $pairsPerBox,
                'productName' => $sku, // Use SKU as temp name
                'lineNumber' => $lineNum
            ];
        }
        
        $rowsProcessed++;
    }
    
    // Flatten carton map to array
    $cartons = [];
    foreach ($cartonMap as $cartonNumber => $products) {
        foreach ($products as $product) {
            $cartons[] = $product;
        }
    }
    
    // Update statistics
    $result['data']['cartons'] = $cartons;
    $result['data']['statistics']['totalCartons'] = count($cartonMap);
    $result['data']['statistics']['uniqueProducts'] = count($productMap);
    $result['data']['statistics']['rowsProcessed'] = $rowsProcessed;
    
    $result['success'] = true;
    
    return $result;
}

/**
 * Find column indices in header row
 */
function findColumnIndices($headers) {
    $indices = [
        'fnsku' => -1,
        'sku' => -1,
        'ctnNo' => -1,
        'boxes' => -1,
        'pairsPerBox' => -1
    ];
    
    foreach ($headers as $idx => $header) {
        $headerUpper = strtoupper(trim($header));
        
        if (stripos($headerUpper, 'FNSKU') !== false) {
            $indices['fnsku'] = $idx;
        }
        if (stripos($headerUpper, 'SKU') !== false && stripos($headerUpper, 'FNSKU') === false) {
            $indices['sku'] = $idx;
        }
        if (stripos($headerUpper, 'CTN') !== false) {
            $indices['ctnNo'] = $idx;
        }
        if (stripos($headerUpper, 'BOX/CART') !== false || stripos($headerUpper, 'BOX/CARTO') !== false) {
            $indices['boxes'] = $idx;
        }
        if (stripos($headerUpper, 'PAIRS/') !== false) {
            $indices['pairsPerBox'] = $idx;
        }
    }
    
    return $indices;
}

/**
 * Parse carton number range (e.g., "1--9", "1-5", "31")
 */
function parseCartonNumbers($ctnNo, $prefix) {
    $cartons = [];
    
    // Handle range with -- or -
    if (preg_match('/(\d+)--?(\d+)/', $ctnNo, $matches)) {
        $start = intval($matches[1]);
        $end = intval($matches[2]);
        
        for ($i = $start; $i <= $end; $i++) {
            $cartons[] = $prefix . '-' . $i;
        }
    } else {
        // Single carton
        $num = intval($ctnNo);
        if ($num > 0) {
            $cartons[] = $prefix . '-' . $num;
        }
    }
    
    return $cartons;
}

// ============================================================================
// DATABASE IMPORT FUNCTIONS
// ============================================================================

/**
 * Import parsed data to database
 * 
 * FIXED: Uses proper FNSKU lookup strategy and new carton_contents schema
 */
function importToDatabase($db, $data, $userId, $fileName) {
    $result = [
        'success' => false,
        'cartonsCreated' => 0,
        'productsUpdated' => 0,
        'error' => null
    ];
    
    try {
        $db->beginTransaction();
        
        // ========================================================================
        // 1. PRODUCT HANDLING - STRATEGY B: FNSKU Lookup
        // ========================================================================
        
        $uniqueProducts = [];
        foreach ($data['cartons'] as $carton) {
            if (!isset($uniqueProducts[$carton['fnsku']])) {
                $uniqueProducts[$carton['fnsku']] = [
                    'fnsku' => $carton['fnsku'],
                    'sku' => $carton['sku'],
                    'pairsPerBox' => $carton['pairsPerBox']
                ];
            }
        }
        
        // Process each unique product
        foreach ($uniqueProducts as $product) {
            // Check if product exists by FNSKU
            $checkStmt = $db->prepare("
                SELECT product_id, artikel, product_name, sku, pairs_per_box 
                FROM products 
                WHERE fnsku = :fnsku
            ");
            $checkStmt->execute(['fnsku' => $product['fnsku']]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing) {
                // Product exists - optionally update SKU if it was NULL
                if (empty($existing['sku']) && !empty($product['sku'])) {
                    $updateStmt = $db->prepare("
                        UPDATE products 
                        SET sku = :sku, updated_at = CURRENT_TIMESTAMP
                        WHERE fnsku = :fnsku
                    ");
                    $updateStmt->execute([
                        'sku' => $product['sku'],
                        'fnsku' => $product['fnsku']
                    ]);
                }
                // No need to do anything else - product already exists with proper artikel
            } else {
                // New product - create with FNSKU as temporary artikel
                // User will edit artikel via Products page later
                $insertStmt = $db->prepare("
                    INSERT INTO products (fnsku, artikel, sku, product_name, pairs_per_box)
                    VALUES (:fnsku, :artikel, :sku, :product_name, :pairs_per_box)
                ");
                
                $insertStmt->execute([
                    'fnsku' => $product['fnsku'],
                    'artikel' => $product['fnsku'], // Temporary - user edits later
                    'sku' => $product['sku'] ?? null,
                    'product_name' => 'Unknown Product', // Temporary
                    'pairs_per_box' => $product['pairsPerBox'] ?? 8
                ]);
            }
        }
        
        $result['productsUpdated'] = count($uniqueProducts);
        
        // ========================================================================
        // 2. CREATE CARTONS
        // ========================================================================
        
        $uniqueCartons = [];
        foreach ($data['cartons'] as $carton) {
            $uniqueCartons[$carton['cartonNumber']] = true;
        }
        
        foreach (array_keys($uniqueCartons) as $cartonNumber) {
            // Check if carton already exists
            $checkStmt = $db->prepare("SELECT carton_id FROM cartons WHERE carton_number = :carton_number");
            $checkStmt->execute(['carton_number' => $cartonNumber]);
            
            if ($checkStmt->fetch()) {
                throw new Exception("Carton $cartonNumber already exists. Please remove or move existing cartons first.");
            }
            
            // Create carton with default location "Incoming"
            $stmt = $db->prepare("
                INSERT INTO cartons (carton_number, location, status)
                VALUES (:carton_number, 'Incoming', 'in stock')
            ");
            
            $stmt->execute(['carton_number' => $cartonNumber]);
        }
        
        $result['cartonsCreated'] = count($uniqueCartons);
        
        // ========================================================================
        // 3. CREATE CARTON CONTENTS - NEW SCHEMA (FIXED: Unique placeholders) 
        // ========================================================================
        
        foreach ($data['cartons'] as $carton) {
            // Get carton_id
            $stmt = $db->prepare("SELECT carton_id FROM cartons WHERE carton_number = :carton_number");
            $stmt->execute(['carton_number' => $carton['cartonNumber']]);
            $cartonRow = $stmt->fetch(PDO::FETCH_ASSOC);
            $cartonId = $cartonRow['carton_id'];
            
            // Get product_id
            $stmt = $db->prepare("SELECT product_id FROM products WHERE fnsku = :fnsku");
            $stmt->execute(['fnsku' => $carton['fnsku']]);
            $productRow = $stmt->fetch(PDO::FETCH_ASSOC);
            $productId = $productRow['product_id'];
            
            // Insert into carton_contents with new schema
            // FIXED: Use unique placeholders for each value
            // boxes_initial = boxes from LC file
            // boxes_current = same as boxes_initial (nothing sent yet)
            // boxes_sent_to_amazon = 0 (nothing sent yet)
            $stmt = $db->prepare("
                INSERT INTO carton_contents 
                (carton_id, product_id, boxes_initial, boxes_current, boxes_sent_to_amazon)
                VALUES (:carton_id, :product_id, :boxes_initial, :boxes_current, 0)
            ");
            
            $stmt->execute([
                'carton_id' => $cartonId,
                'product_id' => $productId,
                'boxes_initial' => $carton['boxes'],
                'boxes_current' => $carton['boxes']
            ]);
        }
        
        // ========================================================================
        // 4. LOG UPLOAD
        // ========================================================================
        
        $stmt = $db->prepare("
            INSERT INTO upload_history (user_id, file_type, file_name, records_imported, upload_status)
            VALUES (:user_id, 'packing_list', :file_name, :records_imported, 'success')
        ");
        
        $stmt->execute([
            'user_id' => $userId,
            'file_name' => $fileName,
            'records_imported' => $result['cartonsCreated']
        ]);
        
        $db->commit();
        
        $result['success'] = true;
        return $result;
        
    } catch (Exception $e) {
        $db->rollBack();
        $result['error'] = $e->getMessage();
        return $result;
    }
}
?>
