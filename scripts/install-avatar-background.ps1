$ErrorActionPreference = "Stop"
$root = "E:\AI-Shorts"
$venv = Join-Path $root "avatar\background-venv"
$python = Join-Path $venv "Scripts\python.exe"

Write-Host "=== WoHo Avatar Background Engine ===" -ForegroundColor Cyan

if (-not (Test-Path $python)) {
  Write-Host "[1/3] Creating Python 3.10 venv..."
  py -3.10 -m venv $venv
}

Write-Host "[2/3] Installing CPU background segmentation..."
& $python -m pip install --upgrade pip
& $python -m pip install "rembg[cpu]"

Write-Host "[3/3] Verifying..."
& $python -c "from rembg import new_session; s=new_session('u2net_human_seg'); print('Background segmentation model: PASS')"

Write-Host ""
Write-Host "Background engine ready: $python" -ForegroundColor Green
