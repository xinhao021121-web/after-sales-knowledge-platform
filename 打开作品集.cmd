@echo off
chcp 65001 >nul
setlocal
set "PROJECT_ROOT=%~dp0"
set "PORTFOLIO=%PROJECT_ROOT%作品集\index.html"
set "PROTOTYPE=%PROJECT_ROOT%文档\阶段3B_高保真交互原型\index.html"

if not exist "%PORTFOLIO%" (
  echo 找不到作品集文件：%PORTFOLIO%
  pause
  exit /b 1
)
if not exist "%PROTOTYPE%" (
  echo 找不到交互原型文件：%PROTOTYPE%
  pause
  exit /b 1
)

start "" "%PORTFOLIO%"
start "" "%PROTOTYPE%"
endlocal
