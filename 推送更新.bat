@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === teaching-progress ===
git add -A
git diff --cached --quiet && (echo No changes. & pause & exit /b 0)
git status --short
echo.
set MSG=%*
if "%MSG%"=="" set MSG=update from Cowork
git commit -m "%MSG%"
if errorlevel 1 (echo Commit failed. & pause & exit /b 1)
git push
if errorlevel 1 (echo Push failed - check network or credentials. & pause & exit /b 1)
echo.
echo Pushed. Pages will rebuild in a minute:
echo https://kinwang94.github.io/teaching-progress/
pause
