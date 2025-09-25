@echo off
echo Testing atomic task processing...
echo.

echo 1. Checking for pending atomic tasks...
curl -X POST "http://127.0.0.1:54321/functions/v1/process-pending-tasks" ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" ^
  -H "Content-Type: application/json"

echo.
echo.
echo 2. Testing Next.js API connection...
curl -X POST "http://localhost:3000/api/process-atomic-tasks" ^
  -H "Authorization: Bearer development-key" ^
  -H "Content-Type: application/json" ^
  -d "{}"

echo.
echo.
echo Test complete!
pause
