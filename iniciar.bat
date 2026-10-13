@echo off
echo =========================================
echo    HOME CCTV SYSTEM - Iniciando...
echo =========================================
echo.
echo Abre en tu navegador:
echo   Dashboard: http://localhost:3000/dashboard
echo   Movil:     http://localhost:3000/mobile
echo   Camaras:   http://localhost:3000/camera
echo.
echo Clave por defecto: homecctv2024
echo.
echo IMPORTANTE: No cierres esta ventana
echo Presiona Ctrl+C para detener el servidor
echo =========================================
echo.
cd /d "%~dp0"
node server/index.js
pause
