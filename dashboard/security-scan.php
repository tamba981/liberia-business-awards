<?php
// ============================================
// SECURITY SCANNER - Run daily via cron
// ============================================

$scanResults = [];

// 1. Check for suspicious files
function scanSuspiciousFiles($directory) {
    $suspicious = [];
    $patterns = [
        '/eval\s*\(/',
        '/base64_decode\s*\(/',
        '/system\s*\(/',
        '/exec\s*\(/',
        '/passthru\s*\(/',
        '/shell_exec\s*\(/',
        '/gzinflate/',
        '/str_rot13/'
    ];
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile() && $file->getExtension() === 'php') {
            $content = file_get_contents($file->getRealPath());
            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $content)) {
                    $suspicious[] = $file->getRealPath();
                    break;
                }
            }
        }
    }
    
    return $suspicious;
}

// 2. Check file permissions
function checkFilePermissions($directory) {
    $issues = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        $perms = fileperms($file->getRealPath()) & 0777;
        if (($file->isDir() && $perms > 755) || ($file->isFile() && $perms > 644)) {
            $issues[] = [
                'file' => $file->getRealPath(),
                'permissions' => decoct($perms)
            ];
        }
    }
    
    return $issues;
}

// 3. Check for outdated files
function checkFileModificationDates($directory, $daysOld = 30) {
    $oldFiles = [];
    $threshold = time() - ($daysOld * 24 * 60 * 60);
    
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    
    foreach ($iterator as $file) {
        if ($file->isFile() && $file->getMTime() < $threshold) {
            $oldFiles[] = [
                'file' => $file->getRealPath(),
                'modified' => date('Y-m-d H:i:s', $file->getMTime())
            ];
        }
    }
    
    return $oldFiles;
}

// Run scans
$scanResults['suspicious_files'] = scanSuspiciousFiles(__DIR__);
$scanResults['permission_issues'] = checkFilePermissions(__DIR__);
$scanResults['old_files'] = checkFileModificationDates(__DIR__, 90);

// Send email report
if (!empty($scanResults['suspicious_files']) || !empty($scanResults['permission_issues'])) {
    $subject = '[SECURITY ALERT] Website Scan Results - ' . date('Y-m-d');
    $message = "Security scan completed on " . date('Y-m-d H:i:s') . "\n\n";
    $message .= "SUSPICIOUS FILES:\n" . print_r($scanResults['suspicious_files'], true) . "\n\n";
    $message .= "PERMISSION ISSUES:\n" . print_r($scanResults['permission_issues'], true) . "\n\n";
    
    mail('admin@liberiabusinessawardslr.com', $subject, $message);
}

// Output results (for cron job logging)
echo json_encode($scanResults, JSON_PRETTY_PRINT);
