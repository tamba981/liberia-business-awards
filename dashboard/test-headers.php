<?php
header('Content-Type: text/plain');
echo "Testing headers...\n\n";
echo "All headers sent:\n";
foreach (headers_list() as $header) {
    echo $header . "\n";
}
?>
