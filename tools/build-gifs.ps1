<#
=======================================================================
 GPU LAB · build-gifs.ps1
 Une los PNG capturados en tools/frames/ y produce los GIF en assets/gifs/

 Ejemplos:
   pwsh tools/build-gifs.ps1 -Demo 02-galaxia-particulas
   pwsh tools/build-gifs.ps1 -All
=======================================================================
#>
param(
  [string]$Demo = '',
  [switch]$All,
  [double]$Fps = 12.5,
  [int]$Colors = 168,
  [string]$Ffmpeg = 'ffmpeg'
)

$tools  = $PSScriptRoot
$root   = Split-Path -Parent $tools
$frames = Join-Path $tools 'frames'
$outDir = Join-Path $root 'assets\gifs'

if (-not (Test-Path $frames)) { throw "No hay fotogramas en $frames" }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$demos = @()
if ($All) {
  $demos = Get-ChildItem $frames -Filter '*.png' |
    ForEach-Object { ($_.BaseName -replace '_\d+$', '') } |
    Sort-Object -Unique
} elseif ($Demo) {
  $demos = @($Demo)
} else {
  throw 'Indica -Demo <nombre> o -All'
}

foreach ($d in $demos) {
  $first = Join-Path $frames "${d}_000.png"
  if (-not (Test-Path $first)) { Write-Warning "sin fotogramas para $d"; continue }

  $target = Join-Path $outDir "$d.gif"
  $filter = "[0:v]fps=$Fps,split[a][b];[a]palettegen=max_colors=$Colors" +
            ":stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4"

  & $Ffmpeg -y -loglevel error -framerate 15 -i (Join-Path $frames "${d}_%03d.png") `
    -filter_complex $filter -loop 0 $target

  if (Test-Path $target) {
    $kb = [math]::Round((Get-Item $target).Length / 1KB)
    Write-Host ("{0,-26} -> assets/gifs/{0}.gif  ({1} KB)" -f $d, $kb)
  }
}
