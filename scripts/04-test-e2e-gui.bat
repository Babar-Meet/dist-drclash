@echo off
cd /d "%~dp0.."
echo ============================================
echo  Opening Playwright UI Dashboard
echo ============================================
echo  A web dashboard will open in your browser.
echo  You can run individual tests, filter, and
echo  debug from the UI.
echo.
call npx playwright test --config e2e/playwright.config.ts --ui
if %errorlevel% neq 0 (
    pause
    exit /b %errorlevel%
)
pause
