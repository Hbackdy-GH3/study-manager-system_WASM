@echo off
REM Run this from the project root folder
REM Needs emsdk: https://emscripten.org/docs/getting_started/downloads.html
REM Set EMSDK_DIR below to your emsdk folder if emcc is not already on PATH

set EMSDK_DIR=C:\emsdk

where emcc >nul 2>nul
if not errorlevel 1 goto build
if not exist "%EMSDK_DIR%\emsdk_env.bat" goto noemsdk
call "%EMSDK_DIR%\emsdk_env.bat" >nul

:build
call emcc -O2 -Iinclude src/globals.c src/core/*.c src/queue/*.c src/plan/*.c src/storage/*.c wasm/wasm_api.c -o web/study.js -lidbfs.js -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_RUNTIME_METHODS=['ccall','FS'] -sEXPORTED_FUNCTIONS=['_wasm_add_topic','_wasm_add_topic_at','_wasm_create_plan','_wasm_delete_first','_wasm_delete_last','_wasm_delete_plan','_wasm_delete_topic','_wasm_enqueue_filtered','_wasm_enqueue_topic','_wasm_extend_plan','_wasm_fill_queue','_wasm_finish_queue_topic','_wasm_get_state','_wasm_import_done','_wasm_import_plan','_wasm_import_queue','_wasm_import_topic','_wasm_init','_wasm_queue_at','_wasm_set_completed','_wasm_set_plan_topics','_wasm_set_priority','_wasm_set_status']
if errorlevel 1 goto failed
echo Build OK - web\study.js and web\study.wasm updated
echo Run: cd web  then  python -m http.server 8000  and open http://localhost:8000
exit /b 0

:noemsdk
echo emcc not found. Install emsdk or set EMSDK_DIR in build_wasm.bat
exit /b 1

:failed
echo Build failed
exit /b 1
