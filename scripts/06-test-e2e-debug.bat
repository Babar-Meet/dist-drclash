@echo off
cd /d "%~dp0.."
echo ============================================
echo  Running E2E Tests in Debug Mode
echo ============================================
echo  Playwright Inspector will open + browser.
echo  Step through each test one action at a time.
echo.
set PWDEBUG=1
call npx playwright test --config e2e/playwright.config.ts --headed
if %errorlevel% neq 0 (
    pause
    exit /b %errorlevel%
)
pause
