$ErrorActionPreference = "Stop"
$root = "E:\AI-Shorts"
$python = Join-Path $root "avatar\background-venv\Scripts\python.exe"
$script = Join-Path (Get-Location) "scripts\prepare_presenter.py"
$input = Join-Path $root "avatars\presenter-original.mp4"
$background = Join-Path $root "avatars\wohoTech-presenter-background.png"
$output = Join-Path $root "avatars\presenter.mp4"
$ffmpeg = Join-Path $root "ffmpeg\bin\ffmpeg.exe"

foreach ($p in @($python,$script,$input,$background,$ffmpeg)) {
  if (-not (Test-Path $p)) { throw "Missing: $p" }
}

& $python $script --input $input --background $background --output $output --ffmpeg $ffmpeg
if ($LASTEXITCODE -ne 0) { throw "Presenter preparation failed." }
Write-Host "Presenter source ready: $output" -ForegroundColor Green
