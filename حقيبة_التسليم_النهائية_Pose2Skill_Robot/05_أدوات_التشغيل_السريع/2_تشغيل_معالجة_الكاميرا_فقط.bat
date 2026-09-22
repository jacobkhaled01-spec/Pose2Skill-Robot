@echo off
chcp 65001 >nul
title تشغيل معالجة الكاميرا والتوجيه فقط
color 0E

cd /d "%~dp0..\02_الكود_المصدري_الأساسي"
python vision_to_nao_teleop.py
pause
