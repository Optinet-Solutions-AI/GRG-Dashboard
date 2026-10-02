@echo off
REM Scheduled every 5 minutes: import any new OpenSEO rankings export for .com, .org or .net.
REM Created with:
REM   schtasks /create /tn "GRG OpenSEO import" /tr "<this file>" /sc minute /mo 5 /f
REM Remove with:
REM   schtasks /delete /tn "GRG OpenSEO import" /f
cd /d "C:\Users\User\Desktop\SEO SKILL\optinet-seo-dashboard"
node --env-file=.env scripts\openseo-import.mjs >> ".tmp\openseo-task.log" 2>&1
