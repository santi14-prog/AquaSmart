@echo off
REM Copia os ficheiros do site para a pasta data/ do sketch
REM Executa antes de usar Tools -> ESP8266 LittleFS Data Upload

set SKETCH_DIR=%~dp0
set DATA_DIR=%SKETCH_DIR%data
set SRC_DIR=%SKETCH_DIR%..\

echo A copiar ficheiros para %DATA_DIR%...

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\css" mkdir "%DATA_DIR%\css"
if not exist "%DATA_DIR%\js" mkdir "%DATA_DIR%\js"
if not exist "%DATA_DIR%\icons" mkdir "%DATA_DIR%\icons"

copy /Y "%SRC_DIR%index.html" "%DATA_DIR%\" >nul
copy /Y "%SRC_DIR%manifest.json" "%DATA_DIR%\" >nul
copy /Y "%SRC_DIR%service-worker.js" "%DATA_DIR%\" >nul
copy /Y "%SRC_DIR%css\style.css" "%DATA_DIR%\css\" >nul
copy /Y "%SRC_DIR%css\splash.css" "%DATA_DIR%\css\" >nul
copy /Y "%SRC_DIR%js\app.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%js\logger.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%js\bluetooth.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%js\serial.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%js\wifi.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%js\demo.js" "%DATA_DIR%\js\" >nul
copy /Y "%SRC_DIR%icons\icon-192.png" "%DATA_DIR%\icons\" >nul
copy /Y "%SRC_DIR%icons\icon-512.png" "%DATA_DIR%\icons\" >nul
copy /Y "%SRC_DIR%icons\logo.png" "%DATA_DIR%\icons\" >nul

echo Ficheiros copiados para data/
echo Agora usa Arduino IDE: Tools -> ESP8266 LittleFS Data Upload
