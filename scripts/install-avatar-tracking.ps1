$ErrorActionPreference = "Stop"

$AI = "E:\\AI-Shorts"
$Venv = Join-Path $AI "avatar\\tracking-venv"
$Python = Join-Path $Venv "Scripts\\python.exe"

Write-Host "=== WoHo AI Avatar Tracking Setup ===" -ForegroundColor Cyan
Write-Host "Installing local MediaPipe tracking environment on E:" -ForegroundColor Gray

if (-not (Test-Path $Venv)) {
    python -m venv $Venv
}

& $Python -m pip install --upgrade pip
& $Python -m pip install "mediapipe==0.10.21" "opencv-python" "numpy<2"

& $Python -c "import mediapipe, cv2, numpy; print('MediaPipe:', mediapipe.__version__); print('OpenCV:', cv2.__version__); print('NumPy:', numpy.__version__)"

Write-Host ""
Write-Host "[PASS] Avatar tracking environment ready:" -ForegroundColor Green
Write-Host $Python -ForegroundColor White
Write-Host ""
Write-Host "No video was generated." -ForegroundColor Yellow
