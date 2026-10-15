@echo off
chcp 65001 >nul
title Web FTP Client Manager
cd /d "%~dp0"

echo ============================================
echo  Web-Based Dual-Pane FTP Client Manager
echo ============================================
echo.

REM 1. Cek Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan!
    echo Silakan install dulu dari https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Install dependencies backend kalau belum ada
if not exist "node_modules" (
    echo [1/3] Menginstall dependencies server...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Gagal install dependencies server.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencies server OK.
)

REM 3. Install + build frontend (selalu build ulang supaya perubahan kode ikut)
echo [2/3] Build frontend...
if not exist "client\node_modules" (
    echo       Menginstall dependencies client...
    cd client
    call npm install
    if errorlevel 1 (
        echo [ERROR] Gagal install dependencies client.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)
call npm run build:client
if errorlevel 1 (
    echo [ERROR] Gagal build frontend.
    pause
    exit /b 1
)

echo [3/3] Menjalankan server di http://localhost:5000 ...
echo       Browser akan terbuka otomatis. Jangan tutup jendela ini.
echo.

REM Buka browser 3 detik setelah server jalan, tanpa memblokir server
start /b cmd /c "timeout /t 3 /nobreak >nul & start "" "http://localhost:5000""

call npm start

echo.
echo Server berhenti. Tekan tombol apa saja untuk keluar.
pause >nul
