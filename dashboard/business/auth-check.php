<?php
// /dashboard/business/auth-check.php

// ============================================
// PREVENT CACHING - NO FLASH, NO STORED PAGES
// ============================================
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');
header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');

// ============================================
// START SESSION
// ============================================
session_start();

// ============================================
// CHECK IF ALREADY AUTHENTICATED (SKIP TOKEN VERIFICATION)
// ============================================
if (isset($_SESSION['lba_business_authenticated']) && $_SESSION['lba_business_authenticated'] === true) {
    // Already authenticated, no need to verify token again
    return;
}

// ============================================
// GET TOKEN FROM COOKIE OR AUTHORIZATION HEADER
// ============================================
$token = null;

// Check cookie first (more reliable for .htaccess redirects)
if (isset($_COOKIE['lba_auth_token'])) {
    $token = $_COOKIE['lba_auth_token'];
}

// Then check Authorization header
if (!$token) {
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        $token = str_replace('Bearer ', '', $headers['Authorization']);
    }
}

// No token found - redirect to login
if (!$token) {
    header('Location: /dashboard/login.html');
    exit();
}

// ============================================
// VERIFY TOKEN WITH BACKEND
// ============================================
$ch = curl_init('https://liberia-business-awards-production.up.railway.app/api/auth/verify');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Required for some hosting environments

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Token invalid - clear and redirect
if ($httpCode !== 200) {
    // Clear invalid cookie
    setcookie('lba_auth_token', '', time() - 3600, '/');
    header('Location: /dashboard/login.html');
    exit();
}

$data = json_decode($response, true);

// ============================================
// CHECK IF USER IS BUSINESS (NOT ADMIN!)
// ============================================
if (!$data['success'] || $data['user']['role'] !== 'business') {
    // Not a business user - redirect to login
    header('Location: /dashboard/login.html');
    exit();
}

// ============================================
// SET SESSION AND RENEW COOKIE
// ============================================
$_SESSION['lba_business_authenticated'] = true;
$_SESSION['lba_business_email'] = $data['user']['email'];
$_SESSION['lba_business_name'] = $data['user']['name'] ?? $data['user']['business_name'] ?? 'Business User';
$_SESSION['lba_business_id'] = $data['user']['id'] ?? $data['user']['business_id'] ?? null;

// Renew the cookie (extends expiration)
setcookie('lba_auth_token', $token, time() + (60 * 60), '/', '', true, true);

// Optional: Store user data in session for quick access
$_SESSION['lba_user_data'] = $data['user'];
?>
