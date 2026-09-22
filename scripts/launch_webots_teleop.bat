@echo off
chcp 65001 >nul
title Pose2Skill-Robot: NAO Humanoid Teleoperation & Skill Teaching Engine
color 0B

echo =====================================================================
echo  Pose2Skill-Robot: NAO Humanoid Teleoperation & Skill Teaching (LfD)
echo  Computer Vision Practical Project (Level 4)
echo =====================================================================
echo.

:: 1. Free camera & network ports by cleaning previous python bridge instances
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Pose2Skill*" >nul 2>&1

:: 2. Find Webots installation
set "WEBOTS_EXE="
if exist "C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe"
) else if exist "C:\Program Files\Webots\msys64\mingw64\bin\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webots.exe"
) else if exist "C:\Program Files\Webots\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\webots.exe"
)

if "%WEBOTS_EXE%"=="" (
    echo [ERROR] Webots installation not found in default paths!
    pause
    exit /b 1
)

:: Resolve canonical full absolute path to the NAO world file
for %%I in ("%~dp0..\sim\webots\worlds\nao_teleop.wbt") do set "WORLD_PATH=%%~fI"

echo [*] Starting Webots NAO Simulation World...
pushd "C:\Program Files\Webots"
start "" "%WEBOTS_EXE%" "%WORLD_PATH%"
popd

echo [*] Waiting 5 seconds for Webots simulation to load...
ping 127.0.0.1 -n 6 >nul

echo.
echo =====================================================================
echo  [LfD TEACHING INSTRUCTIONS]:
echo   [T] or [SPACE] : Start / Stop Teaching (Records ^& Saves Skill to /skills)
echo   [P]            : Play / Replay Learned Skill on NAO in Webots
echo   [S]            : Test Squat / Knee Flex
echo   [Q]            : Quit Cleanly
echo =====================================================================
echo.
python "%~dp0vision_to_nao_teleop.py"

echo.
echo [*] Teleoperation stopped cleanly.
pause
