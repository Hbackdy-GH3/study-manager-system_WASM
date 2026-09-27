@echo off

echo ==========================================
echo Study Management System - WASM Build
echo ==========================================

echo.
echo Activating Emscripten...
call C:\Users\Shahab\emsdk\emsdk_env.bat

echo.
echo Moving to project...
cd /d "C:\Users\Shahab\Desktop\Projects\StudyManagementSystem-WASM"

echo.
echo Building WebAssembly...

emcc ^
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
-Iinclude ^
-O2 ^
-sWASM=1 ^
-sALLOW_MEMORY_GROWTH=1 ^
-sFORCE_FILESYSTEM=1 ^
-sEXPORTED_FUNCTIONS=_wasm_test,_wasm_init,_wasm_save,_wasm_add_topic,_wasm_topic_count,_wasm_get_topics_json,_wasm_update_topic,_wasm_delete_topic,_wasm_available_count,_wasm_enqueue,_wasm_queue_count,_wasm_get_queue_json,_wasm_dequeue,_wasm_clear_queue ^
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
