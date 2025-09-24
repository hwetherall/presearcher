@echo off
REM This script starts all necessary development servers for the Research Co-pilot.
REM It will open three separate terminal windows.

echo =======================================================
echo  Starting Research Co-pilot Development Environment
echo =======================================================
echo.

REM --- Step 1: Start the main Supabase backend ---
echo [1/3] Starting Supabase Backend (Database, etc.)...
start "Supabase Backend" npx supabase start

REM Wait for 5 seconds to give the backend a moment to initialize.
echo Waiting 5 seconds...
timeout /t 5 /nobreak >nul

REM --- Step 2: Start the Supabase Functions server ---
echo [2/3] Starting Supabase Functions Server...
REM IMPORTANT: This includes the --env-file flag we perfected.
start "Supabase Functions" npx supabase functions serve --env-file ./supabase/.env.local 

REM Wait for 5 seconds.
echo Waiting 5 seconds...
timeout /t 5 /nobreak >nul

REM --- Step 3: Start the Next.js frontend server ---
echo [3/3] Starting Next.js Frontend...
start "Next.js Frontend" npm run dev

echo.
echo =======================================================
echo  All services have been launched in new windows!
echo =======================================================
echo.
pause