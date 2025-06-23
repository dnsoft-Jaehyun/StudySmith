@echo off
echo ChromaDB TypeScript 서버 시작하기
echo ===================

echo 필요한 패키지 확인 중...
npm list typescript 2>nul | findstr typescript >nul
if %ERRORLEVEL% NEQ 0 (
  echo TypeScript 패키지가 없습니다. 설치합니다...
  npm install typescript @types/node
)

echo ChromaDB 패키지 확인 중...
npm list chromadb 2>nul | findstr chromadb >nul
if %ERRORLEVEL% NEQ 0 (
  echo ChromaDB 패키지가 없습니다. 최신 버전을 설치합니다...
  npm install chromadb@latest chromadb-default-embed@latest
)

echo 데이터 디렉토리 설정
set DATA_DIR=./chroma_ts_data
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

REM 환경 변수 설정
set CHROMA_SERVER_HOST=localhost
set CHROMA_SERVER_PORT=8001

echo TypeScript 컴파일 중...
npx tsc chroma-server.ts --esModuleInterop --resolveJsonModule --lib ES2020,DOM --module CommonJS --target ES2020

echo ChromaDB 서버를 시작합니다...
echo 데이터는 %DATA_DIR%에 저장됩니다
echo Ctrl+C로 서버를 종료할 수 있습니다.

node chroma-server.js

echo.
echo ChromaDB 서버가 종료되었습니다. 