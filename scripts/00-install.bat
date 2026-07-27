@echo off
cd /d "%~dp0.."
echo ============================================
echo  Step 1/6 - Install npm dependencies
echo ============================================
call npm install
if %errorlevel% neq 0 (
    echo FAILED: npm install
    pause
    exit /b %errorlevel%
)
echo OK

echo.
echo ============================================
echo  Step 2/6 - Install Playwright Chromium browser
echo ============================================
echo  This downloads ~192 MB. May take a few minutes.
echo.
npx playwright install chromium
if %errorlevel% neq 0 (
    echo FAILED: playwright install chromium
    pause
    exit /b %errorlevel%
)
echo OK

echo.
echo ============================================
echo  All dependencies installed successfully.
echo  You can now run:
echo     scripts\01-test-unit.bat       - Unit tests
echo     scripts\02-test-e2e.bat        - E2E tests (headless)
echo     scripts\03-test-e2e-headed.bat - E2E tests (see browser)
echo     scripts\04-test-e2e-gui.bat    - E2E UI dashboard
echo     scripts\05-test-all.bat        - Everything
echo ============================================
pause
