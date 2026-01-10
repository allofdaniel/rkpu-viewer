@echo off
REM UBIKAIS Auto Crawler - Windows Task Scheduler용
REM 5~15분 주기로 실행하도록 작업 스케줄러에 등록

cd /d "%~dp0"

echo ========================================
echo UBIKAIS Auto Crawler
echo %date% %time%
echo ========================================

python auto_crawl_and_deploy.py

echo ========================================
echo 완료
echo ========================================
