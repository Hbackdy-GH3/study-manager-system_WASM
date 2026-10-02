@echo off
REM Run this from the project root folder
gcc -Iinclude src/*.c src/core/*.c src/queue/*.c src/plan/*.c src/storage/*.c -o build/study_manager.exe
if errorlevel 1 (
    echo Build failed
    exit /b 1
)
echo Build OK - run: build\study_manager.exe
