@echo off
echo 웹 서버 시작하기

:: 환경 변수 설정
set PORT=3000
set NODE_ENV=development
set CHROMA_SERVER_URL=http://localhost:8000
set CHROMA_EXTERNAL_SERVER=true

:: 디렉토리 생성
if not exist tmp mkdir tmp
if not exist uploads mkdir uploads

:: 웹 서버 시작
echo 웹 서버를 시작합니다...
node dist/server.js

pause 