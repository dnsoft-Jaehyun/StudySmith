@echo off
echo ChromaDB 서버 시작하기

:: 디렉토리 생성
if not exist chroma_db mkdir chroma_db

:: ChromaDB 서버 시작 - CORS 설정을 올바르게 변경
echo ChromaDB 서버를 시작합니다...
python -m chromadb.cli.cli server start --host localhost --port 8000 --path "./chroma_db" --allow-origins "http://localhost:3000"

pause 