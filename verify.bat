@echo off
REM engine_tensorflow+js 一键验收（Node 22，无需浏览器/无需 TF.js）
REM   运行全部 smoke 并报告 ALL_DONE；另提示浏览器预览入口。
cd /d "%~dp0"
echo === engine_tensorflow+js smoke ===
node tools/run_smoke.js
if errorlevel 1 (echo SMOKE_FAIL & exit /b 1)
echo.
echo === games 核心逻辑自测（Node，不触 DOM/RHI）===
node games/selftest.js
if errorlevel 1 (echo GAMES_SELFTEST_FAIL & exit /b 1)
echo.
echo 全部 smoke + games 自测通过。浏览器预览： node serve.mjs  ->  http://localhost:8080/
exit /b 0
