@echo off
echo ChromaDB와 웹 서버 시작하기

:: 환경 변수 설정
set PORT=3000
set NODE_ENV=development
set CHROMA_SERVER_HOST=localhost
set CHROMA_SERVER_PORT=8000
set CHROMA_SERVER_URL=http://localhost:8000
set CHROMA_DB_PATH=./chroma_db
set CHROMA_EXTERNAL_SERVER=false
set CHROMA_SERVER_CORS_ALLOW_ORIGINS=*

:: 디렉토리 생성
if not exist chroma_db mkdir chroma_db
if not exist tmp mkdir tmp
if not exist uploads mkdir uploads

:: ChromaDB 서버 시작 (새 창에서)
echo ChromaDB 서버를 시작합니다...
start cmd /k "python -m chromadb.cli.cli server start --host %CHROMA_SERVER_HOST% --port %CHROMA_SERVER_PORT% --path %CHROMA_DB_PATH% --allow-origins %CHROMA_SERVER_CORS_ALLOW_ORIGINS%"

:: ChromaDB 서버가 시작될 때까지 대기
echo ChromaDB 서버 시작 대기 중...
timeout /t 5 /nobreak

:: 웹 서버 시작
echo 웹 서버를 시작합니다...
node dist/server.js 