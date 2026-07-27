@echo off
cd /d "%~dp0.."
echo ============================================
echo  Running E2E Tests (Playwright, headless)
echo ============================================
echo  Make sure Chromium is installed first:
echo     scripts\00-install.bat
echo.
echo  This will:
echo    1. Start Angular dev server (ng serve)
echo    2. Run all E2E tests against it
echo    3. Generate HTML report in playwright-report/
echo.
set E2E_HEADLESS=true
call npx playwright test --config e2e/playwright.config.ts
if %errorlevel% neq 0 (
    echo.
    echo  Some tests failed. Check the report:
    echo     playwright-report\index.html
    pause
    exit /b %errorlevel%
)
echo OK - All E2E tests passed.
pause
