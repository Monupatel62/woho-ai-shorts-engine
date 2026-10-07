$ErrorActionPreference="Stop"
$Project="E:\AI-Shorts\projects\shorts-engine"
$TaskName="WoHo AI Shorts Daily"
$Action=New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File $Project\scripts\run-daily.ps1"
$Trigger=New-ScheduledTaskTrigger -Daily -At 7:00AM
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Generate WoHo AI Shorts daily" -Force
Write-Host "Scheduled: $TaskName at 07:00 daily"
