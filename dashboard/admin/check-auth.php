<?php
session_start();
echo "<pre>";
echo "Session: " . print_r($_SESSION, true);
echo "\n\nCookie: " . print_r($_COOKIE, true);
echo "</pre>";
?>
