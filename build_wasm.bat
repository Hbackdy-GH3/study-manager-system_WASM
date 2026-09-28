@echo off
setlocal

echo ==========================================
echo Study Management System - WASM Build
echo ==========================================

rem Go to the folder this .bat file is in (works on any PC / any path)
cd /d "%~dp0"

rem Activate Emscripten only if emcc is not already available.
rem Set EMSDK_DIR if your emsdk is somewhere else.
where emcc >nul 2>nul
if not errorlevel 1 goto build

if "%EMSDK_DIR%"=="" set "EMSDK_DIR=%USERPROFILE%\emsdk"

if not exist "%EMSDK_DIR%\emsdk_env.bat" goto no_emsdk

echo.
echo Activating Emscripten from %EMSDK_DIR% ...
call "%EMSDK_DIR%\emsdk_env.bat" >nul

:build

echo.
echo Building WebAssembly...

rem -lidbfs.js is REQUIRED: without it IDBFS is missing and
rem browser data is lost on every refresh.

call emcc ^
src/wasm_bridge.c ^
src/insert.c ^
src/delete.c ^
src/display.c ^
src/filters.c ^
src/globals.c ^
src/file_handling.c ^
src/progress_stat.c ^
src/search.c ^
src/temp_session.c ^
src/update.c ^
src/input.c ^
-Iinclude ^
-O2 ^
-lidbfs.js ^
-sWASM=1 ^
-sALLOW_MEMORY_GROWTH=1 ^
-sFORCE_FILESYSTEM=1 ^
-sEXPORTED_FUNCTIONS=_wasm_test,_wasm_init,_wasm_save,_wasm_reload,_wasm_import_topics_append,_wasm_add_topic,_wasm_topic_count,_wasm_get_topics_json,_wasm_update_topic,_wasm_delete_topic,_wasm_available_count,_wasm_enqueue,_wasm_queue_count,_wasm_get_queue_json,_wasm_dequeue,_wasm_study_next,_wasm_clear_queue ^
-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS ^
-o web/wasm.js

if errorlevel 1 (
    echo.
    echo BUILD FAILED.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo BUILD SUCCESSFUL
echo ==========================================
echo.

pause
exit /b 0

:no_emsdk
echo.
echo emsdk not found at %EMSDK_DIR%
echo Set the correct folder first, for example:
echo     set EMSDK_DIR=C:\path\to\emsdk
pause
exit /b 1