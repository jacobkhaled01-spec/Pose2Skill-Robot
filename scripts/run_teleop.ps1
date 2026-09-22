# Pose2Skill-Robot: NAO Humanoid Full-Body Teleoperation Launcher
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host " Pose2Skill-Robot: NAO Full-Body Humanoid Teleoperation System" -ForegroundColor Cyan
Write-Host " Academic Graduation Project - Computer Vision & Robotics" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Clean previous python bridge processes
Get-Process python* -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*Pose2Skill*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Find Webots
$webotsPath = "C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe"
if (-not (Test-Path $webotsPath)) {
    $webotsPath = "C:\Program Files\Webots\msys64\mingw64\bin\webots.exe"
}
if (-not (Test-Path $webotsPath)) {
    $webotsPath = "C:\Program Files\Webots\webots.exe"
}

$worldPath = Join-Path $PSScriptRoot "..\sim\webots\worlds\nao_teleop.wbt"
$worldPath = [System.IO.Path]::GetFullPath($worldPath)

Write-Host "[*] Launching Webots NAO World: $worldPath" -ForegroundColor Green
Start-Process -FilePath $webotsPath -ArgumentList $worldPath -WorkingDirectory "C:\Program Files\Webots"

Write-Host "[*] Waiting 4 seconds for Webots simulation..." -ForegroundColor Yellow
Start-Sleep -Seconds 4

Write-Host "[*] Starting Vision Teleoperation Bridge..." -ForegroundColor Green
$visionScript = Join-Path $PSScriptRoot "vision_to_nao_teleop.py"
python "$visionScript"

Write-Host "[*] Teleoperation finished." -ForegroundColor Cyan
