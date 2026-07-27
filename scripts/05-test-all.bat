@echo off
cd /d "%~dp0.."
echo ============================================
echo  Running ALL Tests
echo ============================================
echo.

echo [1/2] Unit tests...
call npx ng test --no-watch
if %errorlevel% neq 0 (
    echo FAILED: Unit tests
    pause
    exit /b %errorlevel%
)
echo OK

echo.
echo [2/2] E2E tests (headless)...
set E2E_HEADLESS=true
call npx playwright test --config e2e/playwright.config.ts
if %errorlevel% neq 0 (
    echo FAILED: E2E tests. Check playwright-report\index.html
    pause
    exit /b %errorlevel%
)
echo OK

echo.
echo ============================================
echo  ALL TESTS PASSED
echo ============================================
pause
