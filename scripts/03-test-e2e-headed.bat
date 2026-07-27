@echo off
cd /d "%~dp0.."
echo ============================================
echo  Running E2E Tests (Playwright, GUI mode)
echo ============================================
echo  A browser window will open so you can watch
echo  each test run in real time.
echo.
set E2E_HEADLESS=false
call npx playwright test --config e2e/playwright.config.ts
if %errorlevel% neq 0 (
    pause
    exit /b %errorlevel%
)
pause
