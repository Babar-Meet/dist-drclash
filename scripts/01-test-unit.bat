@echo off
cd /d "%~dp0.."
echo ============================================
echo  Running Unit Tests (Vitest, headless)
echo ============================================
call npx ng test --no-watch
if %errorlevel% neq 0 (
    echo FAILED: Unit tests
    pause
    exit /b %errorlevel%
)
echo OK - All unit tests passed.
pause
