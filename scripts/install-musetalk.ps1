$ErrorActionPreference = "Stop"

$AI = "E:\\AI-Shorts"
$Root = Join-Path $AI "avatar\\MuseTalk"
$Venv = Join-Path $AI "avatar\\musetalk-venv"
$Python = Join-Path $Venv "Scripts\\python.exe"
$FFmpegBin = Join-Path $AI "ffmpeg\\bin"
$PresenterDir = Join-Path $AI "avatars"

Write-Host ""
Write-Host "=== WoHo AI MuseTalk 1.5 Installer ===" -ForegroundColor Cyan
Write-Host "Target: E:\\AI-Shorts" -ForegroundColor Gray
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is required. Install Git for Windows first."
}

$py310 = $null
try {
    $py310 = (& py -3.10 -c "import sys; print(sys.executable)" 2>$null).Trim()
} catch {}

if (-not $py310) {
    Write-Host "[STOP] Python 3.10 was not found." -ForegroundColor Yellow
    Write-Host "MuseTalk officially recommends Python 3.10; do not use the existing Python 3.12 environment for MuseTalk." -ForegroundColor Yellow
    Write-Host "Install Python 3.10 x64, then rerun this script." -ForegroundColor Yellow
    exit 2
}

New-Item -ItemType Directory -Force -Path (Join-Path $AI "avatar") | Out-Null
New-Item -ItemType Directory -Force -Path $PresenterDir | Out-Null

if (-not (Test-Path (Join-Path $Root ".git"))) {
    if (Test-Path $Root) {
        throw "MuseTalk folder exists but is not a Git checkout: $Root"
    }
    git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git $Root
} else {
    git -C $Root pull --ff-only
}

if (-not (Test-Path $Python)) {
    & py -3.10 -m venv $Venv
}

& $Python -m pip install --upgrade pip setuptools wheel

Write-Host ""
Write-Host "[1/5] Installing PyTorch CPU runtime..." -ForegroundColor Cyan
& $Python -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu

Write-Host ""
Write-Host "[2/5] Installing MuseTalk requirements..." -ForegroundColor Cyan
& $Python -m pip install -r (Join-Path $Root "requirements.txt")

Write-Host ""
Write-Host "[3/5] Installing MMLab dependencies..." -ForegroundColor Cyan
& $Python -m pip install --no-cache-dir -U openmim
& $Python -m mim install mmengine
& $Python -m mim install "mmcv==2.0.1"
& $Python -m mim install "mmdet==3.1.0"
& $Python -m mim install "mmpose==1.1.0"

Write-Host ""
Write-Host "[4/5] Downloading MuseTalk model weights..." -ForegroundColor Cyan
Push-Location $Root
try {
    & (Join-Path $Root "download_weights.bat")
    if ($LASTEXITCODE -ne 0) {
        throw "download_weights.bat failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "[5/5] Verifying model tree..." -ForegroundColor Cyan

$required = @(
    (Join-Path $Root "models\\musetalkV15\\musetalk.json"),
    (Join-Path $Root "models\\musetalkV15\\unet.pth"),
    (Join-Path $Root "models\\syncnet\\latentsync_syncnet.pt"),
    (Join-Path $Root "models\\dwpose\\dw-ll_ucoco_384.pth"),
    (Join-Path $Root "models\\face-parse-bisent\\79999_iter.pth"),
    (Join-Path $Root "models\\face-parse-bisent\\resnet18-5c106cde.pth"),
    (Join-Path $Root "models\\sd-vae\\config.json"),
    (Join-Path $Root "models\\sd-vae\\diffusion_pytorch_model.bin"),
    (Join-Path $Root "models\\whisper\\config.json"),
    (Join-Path $Root "models\\whisper\\pytorch_model.bin"),
    (Join-Path $Root "models\\whisper\\preprocessor_config.json")
)

$missing = @()
foreach ($file in $required) {
    if (Test-Path $file) {
        Write-Host "[PASS] $file" -ForegroundColor Green
    } else {
        Write-Host "[MISSING] $file" -ForegroundColor Yellow
        $missing += $file
    }
}

Write-Host ""
Write-Host "FFmpeg: $FFmpegBin" -ForegroundColor Gray
Write-Host "MuseTalk Python: $Python" -ForegroundColor Gray
Write-Host "Presenter directory: $PresenterDir" -ForegroundColor Gray

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "MuseTalk installation is incomplete." -ForegroundColor Yellow
    exit 3
}

Write-Host ""
Write-Host "[PASS] MuseTalk 1.5 backend installed." -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Put your licensed presenter video here:" -ForegroundColor Cyan
Write-Host "  $PresenterDir\\presenter.mp4" -ForegroundColor White
Write-Host ""
Write-Host "No video was generated." -ForegroundColor Yellow
