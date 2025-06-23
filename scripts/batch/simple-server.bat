@echo off
echo 간단한 ChromaDB 서버 시작하기

:: 디렉토리 생성
if not exist chroma_db mkdir chroma_db

:: ChromaDB 서버 시작 - 환경 변수 대신 명령행 인자만 사용
echo ChromaDB 서버를 시작합니다...
python -m chromadb.cli.cli server start --host localhost --port 8000 --path "./chroma_db"

pause 