<?php
/* =====================================================================
   GPU LAB · receptor de fotogramas
   Recibe el PNG (data URL en base64) que envía el arnés de captura y lo
   escribe en tools/frames/ para luego unirlos con FFmpeg.
   ===================================================================== */
header('Content-Type: text/plain; charset=utf-8');

$name = isset($_GET['name']) ? basename($_GET['name']) : '';
if (!preg_match('/^[A-Za-z0-9_\-]+\.png$/', $name)) {
    http_response_code(400);
    echo 'nombre inválido';
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo 'cuerpo vacío';
    exit;
}

$marker = strpos($raw, 'base64,');
if ($marker !== false) {
    $raw = substr($raw, $marker + 7);
}
$bin = base64_decode($raw, true);
if ($bin === false || strlen($bin) < 100) {
    http_response_code(400);
    echo 'base64 inválido';
    exit;
}

$dir = __DIR__ . DIRECTORY_SEPARATOR . 'frames';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$path = $dir . DIRECTORY_SEPARATOR . $name;
if (file_put_contents($path, $bin) === false) {
    http_response_code(500);
    echo 'no se pudo escribir';
    exit;
}

echo 'ok ' . strlen($bin) . ' bytes';
