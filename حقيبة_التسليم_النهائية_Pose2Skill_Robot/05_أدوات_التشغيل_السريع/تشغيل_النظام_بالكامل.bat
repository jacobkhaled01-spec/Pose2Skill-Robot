@echo off
chcp 65001 >nul
title Pose2Skill-Robot: تشغيل النظام بالكامل (محاكاة + كاميرا)
color 0B

echo =====================================================================
echo  مشروع: Pose2Skill-Robot (معالجة صور عملي - المستوى الرابع)
echo  جامعة إب - كلية الحاسبات والعلوم التطبيقية - قسم علوم الحاسوب
echo =====================================================================
echo.

:: إغلاق أي جلسات بايثون سابقة محررة للمنافذ والكاميرا
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Pose2Skill*" >nul 2>&1

:: البحث عن مسار Webots
set "WEBOTS_EXE="
if exist "C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webotsw.exe"
) else if exist "C:\Program Files\Webots\msys64\mingw64\bin\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\msys64\mingw64\bin\webots.exe"
) else if exist "C:\Program Files\Webots\webots.exe" (
    set "WEBOTS_EXE=C:\Program Files\Webots\webots.exe"
)

if "%WEBOTS_EXE%"=="" (
    echo [تنبيه] لم يتم العثور على Webots في المسار الافتراضي C:\Program Files\Webots
    echo يرجى التأكد من تثبيت Webots أو تعديل المسار.
    pause
    exit /b 1
)

:: مسار عالم الروبوت في المحاكاة
for %%I in ("%~dp0..\03_محاكاة_الروبوت_Webots\worlds\nao_teleop.wbt") do set "WORLD_PATH=%%~fI"

echo [*] جاري تشغيل بيئة محاكاة Webots وعالم الروبوت NAO...
pushd "C:\Program Files\Webots"
start "" "%WEBOTS_EXE%" "%WORLD_PATH%"
popd

echo [*] الانتظار 5 ثوانٍ لاكتمال تحميل محرك الفيزياء والمتحكم...
ping 127.0.0.1 -n 6 >nul

echo.
echo [*] جاري تشغيل معالج الرؤية بالكاميرا والتوجيه اللحظي...
cd /d "%~dp0..\02_الكود_المصدري_الأساسي"
python "%~dp0..\02_الكود_المصدري_الأساسي\vision_to_nao_teleop.py"

echo.
echo [*] تم إنهاء الجلسة بنجاح.
pause
