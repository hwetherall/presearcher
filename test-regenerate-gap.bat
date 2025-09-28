@echo off
echo Testing gap analysis report regeneration...
echo.

echo Enter the Gap Analysis Report ID to regenerate (you can find this in the database or browser console):
set /p REPORT_ID=

echo.
echo Attempting to regenerate gap analysis report %REPORT_ID%...
echo.

curl -X POST "http://127.0.0.1:54321/functions/v1/regenerate-gap-report" ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" ^
  -H "Content-Type: application/json" ^
  -d "{\"report_id\":\"%REPORT_ID%\"}"

echo.
echo.
echo Test complete!
pause
