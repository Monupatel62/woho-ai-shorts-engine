$ErrorActionPreference = "Stop"

$AI = "E:\\AI-Shorts"
$Root = Join-Path $AI "avatar\\MuseTalk"
$Python = Join-Path $AI "avatar\\musetalk-venv\\Scripts\\python.exe"
$Source = Join-Path $AI "avatars\\presenter.mp4"
$Inference = Join-Path $Root "scripts\\inference.py"
$Model = Join-Path $Root "models\\musetalkV15\\unet.pth"
$Tracker = Join-Path (Get-Location) "scripts\\avatar_track.py"

Write-Host ""
Write-Host "=== WoHo AI Advanced Avatar Preflight ===" -ForegroundColor Cyan
Write-Host ""

$checks = @(
    @("Presenter video", $Source),
    @("MuseTalk root", $Root),
    @("MuseTalk Python", $Python),
    @("MuseTalk inference", $Inference),
    @("MuseTalk 1.5 model", $Model),
    @("Avatar tracker", $Tracker),
    @("FFmpeg", (Join-Path $AI "ffmpeg\\bin\\ffmpeg.exe"))
)

$failed = $false

foreach ($check in $checks) {
    if (Test-Path $check[1]) {
        Write-Host ("[PASS] {0}" -f $check[0]) -ForegroundColor Green
    } else {
        Write-Host ("[MISSING] {0}: {1}" -f $check[0], $check[1]) -ForegroundColor Yellow
        $failed = $true
    }
}

Write-Host ""
if ($failed) {
    Write-Host "Avatar backend is not ready yet. No video was generated." -ForegroundColor Yellow
    exit 1
}

Write-Host "Avatar backend is READY." -ForegroundColor Green
Write-Host "Next runtime mode: AVATAR_MODE=musetalk" -ForegroundColor Cyan
