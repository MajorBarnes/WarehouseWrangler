<?php
if (!defined('WAREHOUSEWRANGLER')) {
    define('WAREHOUSEWRANGLER', true);
}

require_once __DIR__ . '/../config.php';

function send_unauthorized($msg = 'Authentication required') {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

function get_bearer_token() {
    // Try standard header first
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$hdr && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) $hdr = $headers['Authorization'];
    }
    if (stripos($hdr, 'Bearer ') === 0) {
        return trim(substr($hdr, 7));
    }
    return null;
}

function verify_jwt($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;

    [$h64, $p64, $s64] = $parts;
    $header  = json_decode(base64_decode(strtr($h64, '-_', '+/')), true);
    $payload = json_decode(base64_decode(strtr($p64, '-_', '+/')), true);
    $sig     = base64_decode(strtr($s64, '-_', '+/'));

    if (!$header || !$payload || !$sig) return null;
    if (($header['alg'] ?? '') !== 'HS256') return null;

    $expected = hash_hmac('sha256', "$h64.$p64", JWT_SECRET, true);
    if (!hash_equals($expected, $sig)) return null;

    if (($payload['exp'] ?? 0) <= time()) return null;

    return $payload; // contains user_id, username, role, exp…
}

function require_auth() {
    $token = get_bearer_token();
    if (!$token) send_unauthorized();
    $claims = verify_jwt($token);
    if (!$claims) send_unauthorized('Invalid or expired token');
    return $claims;
}
