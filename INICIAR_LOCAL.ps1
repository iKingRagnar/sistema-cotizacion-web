# Arranca SOLO el proyecto oficial (Old y BackUp). No uses la carpeta "sistema-cotizacion-web".
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$here = (Get-Location).Path
Write-Host ""
Write-Host "=== Carpeta de trabajo (debe terminar en: sistema-cotizacion-web-Old y BackUp) ===" -ForegroundColor Cyan
Write-Host $here
Write-Host ""

if (-not $here.EndsWith('sistema-cotizacion-web-Old y BackUp')) {
  Write-Host "ERROR: Esta script debe vivir dentro de sistema-cotizacion-web-Old y BackUp." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath '.\server.js')) {
  Write-Host "ERROR: No hay server.js aqui. Carpeta equivocada." -ForegroundColor Red
  exit 1
}

if (-not $env:PORT) { $env:PORT = '3456' }
Write-Host "Puerto PORT=$($env:PORT)" -ForegroundColor Green
Write-Host "Abre en el navegador: http://127.0.0.1:$($env:PORT)/deploy-proof.html" -ForegroundColor Green
Write-Host ""

node server.js
