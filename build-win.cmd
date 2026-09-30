@echo off
setlocal EnableExtensions

rem One-click Windows build. Double-click to build the x64 installer,
rem portable exe and zip into .\release.
rem   build-win.cmd [x64|arm64] [version] [proxy-url]
rem Default HTTP proxy is used for double-click builds. Override it with the
rem third argument or NETCATTY_BUILD_PROXY when building elsewhere.
rem Set NETCATTY_BUILD_DEBUG=1 for detailed packaging/download logs.
rem package.json stays at 0.0.0 (CI sets the real version), so the version is
rem injected into the packaged app via electron-builder extraMetadata.

set "DEFAULT_VERSION=1.1.84-bg.1"
set "DEFAULT_PROXY=http://127.0.0.1:7890"

cd /d "%~dp0"

set "ARCH=%~1"
if "%ARCH%"=="" set "ARCH=x64"
if /i not "%ARCH%"=="x64" if /i not "%ARCH%"=="arm64" (
  echo [build-win] Unsupported arch "%ARCH%". Use x64 or arm64.
  goto :fail
)

set "VERSION=%~2"
if "%VERSION%"=="" (
  set /p "VERSION=[build-win] Version [%DEFAULT_VERSION%]: "
)
if "%VERSION%"=="" set "VERSION=%DEFAULT_VERSION%"

if not "%~3"=="" set "NETCATTY_BUILD_PROXY=%~3"
if not defined NETCATTY_BUILD_PROXY set "NETCATTY_BUILD_PROXY=%DEFAULT_PROXY%"
set "HTTP_PROXY=%NETCATTY_BUILD_PROXY%"
set "HTTPS_PROXY=%NETCATTY_BUILD_PROXY%"
set "npm_config_proxy=%NETCATTY_BUILD_PROXY%"
set "npm_config_https_proxy=%NETCATTY_BUILD_PROXY%"
set "ELECTRON_GET_USE_PROXY=true"
echo [build-win] HTTP proxy configured for package downloads.
if "%NETCATTY_BUILD_DEBUG%"=="1" (
  set "DEBUG=electron-builder*,@electron/get*"
  echo [build-win] Detailed packaging logs enabled.
)

where node >nul 2>nul || (
  echo [build-win] Node.js not found. Install Node.js 22+ from https://nodejs.org/
  goto :fail
)
where npm >nul 2>nul || (
  echo [build-win] npm not found.
  goto :fail
)

for /f "delims=" %%v in ('node -v') do echo [build-win] Node %%v, target win-%ARCH%, version %VERSION%

if not exist "node_modules\" (
  echo [build-win] Installing dependencies...
  call npm ci || goto :fail
)

echo [build-win] Building...
call npm run build || goto :fail
call npx cross-env npm_config_arch=%ARCH% NODE_OPTIONS=--disable-warning=DEP0190 electron-builder --config electron-builder.config.cjs --win --%ARCH% --publish=never -c.extraMetadata.version=%VERSION% || goto :fail

echo.
echo [build-win] Done. Output: %CD%\release\Netcatty-%VERSION%-win-%ARCH%.exe
start "" "%CD%\release"
if "%~1"=="" pause
exit /b 0

:fail
echo.
echo [build-win] Build FAILED.
pause
exit /b 1
