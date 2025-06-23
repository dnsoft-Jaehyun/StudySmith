@echo off
REM restart.bat - Windows용 애플리케이션 재시작 스크립트

echo 🔄 교육 대화 시스템 재시작 중...

REM 기존 프로세스 종료
echo ⏹️  기존 프로세스 종료...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul

REM 대기
timeout /t 2 /nobreak >nul

REM TypeScript 컴파일
echo 🔨 TypeScript 컴파일...
call npx tsc

REM ChromaDB 서버 시작 (새 창에서)
echo 🚀 ChromaDB 서버 시작...
start "ChromaDB Server" cmd /k "cd chroma && python run_chroma.py"

REM 대기
timeout /t 3 /nobreak >nul

REM Node.js 서버 시작 (새 창에서)
echo 🚀 Node.js 서버 시작...
start "Node.js Server" cmd /k "node dist/server.js"

echo.
echo ✅ 시스템 시작 완료!
echo.
echo 📌 서버 주소:
echo    - Node.js: http://localhost:3000
echo    - ChromaDB: http://localhost:8000
echo.
echo 이 창을 닫아도 서버는 계속 실행됩니다.
pause
