@echo off
rem Builds the console version (wasm_bridge.c is browser-only, so it is skipped)
cd /d "%~dp0"
gcc -Wall main.c src/globals.c src/input.c src/insert.c src/delete.c src/display.c src/filters.c src/file_handling.c src/progress_stat.c src/search.c src/temp_session.c src/update.c -Iinclude -o study_manager.exe
if errorlevel 1 (
    echo BUILD FAILED.
    pause
    exit /b 1
)
echo Built study_manager.exe - run it from this folder: .\study_manager.exe
