@echo off
chcp 65001 >nul
title تشغيل محاكاة الروبوت Webots فقط
color 0A

set "WEBOTS_EXE="
if exist "C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe"
) else if exist "C:\Program Files\Webots\msys64\mingw64\bin\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webots.exe"
) else if exist "C:\Program Files\Webots\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\webots.exe"
)

for %%I in ("%~dp0..\03_محاكاة_الروبوت_Webots\worlds\nao_teleop.wbt") do set "WORLD_PATH=%%~fI"

echo [*] فتح عالم الروبوت في Webots...
pushd "C:\Program Files\Webots"
start "" "%WEBOTS_EXE%" "%WORLD_PATH%"
popd
