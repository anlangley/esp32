@echo off
chcp 65001 > nul
set PYTHONIOENCODING=utf-8
title IoT Car - Python Vision Server (FastAPI + YOLOv8 + RTX 3050)
echo ====================================================================
echo    KHOI DONG PYTHON VISION MICROSERVICE (PORT 8000)
echo    YOLOV8 + OPENCV ACCELERATION
echo ====================================================================

cd /d "%~dp0"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
