$ErrorActionPreference="Stop"
Set-Location "E:\AI-Shorts\projects\shorts-engine"
& npm run start -- --auto
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
