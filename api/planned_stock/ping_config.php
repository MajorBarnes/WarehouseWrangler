<?php
declare(strict_types=1);
ini_set('display_errors','0'); error_reporting(E_ERROR|E_PARSE);
ob_start();
require_once __DIR__.'/../config.php';
$leaked = ob_get_contents(); ob_end_clean();
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok'=>true,'len'=>strlen($leaked),'preview'=>substr($leaked,0,50)]);
