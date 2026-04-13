<?php
// /dashboard/admin/auth-check.php
session_start();

// Check if user is authenticated
if (!isset($_SESSION['lba_admin_authenticated']) || $_SESSION['lba_admin_authenticated'] !== true) {
    // Check for valid token in Authorization header or cookie
    $headers = getallheaders();
    $token = null;
    
    if (isset($headers['Authorization'])) {
        $token = str_replace('Bearer ', '', $headers['Authorization']);
    } elseif (isset($_COOKIE['lba_auth_token'])) {
        $token = $_COOKIE['lba_auth_token'];
    }
    
    if (!$token) {
        header('Location: /dashboard/login.html');
        exit();
    }
    
    // Verify token with your backend
    $ch = curl_init('https://liberia-business-awards-production.up.railway.app/api/auth/verify');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        header('Location: /dashboard/login.html');
        exit();
    }
    
    $data = json_decode($response, true);
    if (!$data['success'] || $data['user']['role'] !== 'admin') {
        header('Location: /dashboard/login.html');
        exit();
    }
    
    $_SESSION['lba_admin_authenticated'] = true;
    $_SESSION['lba_admin_email'] = $data['user']['email'];
}
?>
