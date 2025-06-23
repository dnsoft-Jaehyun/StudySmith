#!/bin/bash

# 환경 변수 설정
export PORT=3000
export NODE_ENV=development
export CHROMA_SERVER_HOST=localhost
export CHROMA_SERVER_PORT=8000
export CHROMA_SERVER_URL=http://localhost:8000
export CHROMA_DB_PATH=./chroma_db
export CHROMA_EXTERNAL_SERVER=false
export CHROMA_SERVER_CORS_ALLOW_ORIGINS=*

# 디렉토리 생성
mkdir -p ./chroma_db
mkdir -p ./tmp
mkdir -p ./uploads

# ChromaDB 서버 시작 (백그라운드에서 실행)
echo "ChromaDB 서버를 시작합니다..."
python -m chromadb.cli.cli server start --host $CHROMA_SERVER_HOST --port $CHROMA_SERVER_PORT --path "$CHROMA_DB_PATH" --allow-origins $CHROMA_SERVER_CORS_ALLOW_ORIGINS &

# ChromaDB 서버가 시작될 때까지 대기
echo "ChromaDB 서버 시작 대기 중..."
sleep 5

# 웹 서버 시작
echo "웹 서버를 시작합니다..."
node dist/server.js 