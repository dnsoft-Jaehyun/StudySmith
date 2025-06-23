@echo off
echo 알공 국사과 대화셋 자동생성 시스템 설치 및 실행 스크립트

echo [1/3] NPM 패키지 설치 중...
call npm install

echo [2/3] API 키 설정 중...
echo 프로젝트 루트에 .env 파일이 있는지 확인하세요.
echo .env 파일에 OPENAI_API_KEY=your-api-key-here 설정이 있는지 확인하세요.
pause

echo [3/3] 개발 서버 시작하는 중...
call npm run dev

echo 개발 서버를 종료하려면 Ctrl+C를 누르세요.

# 애플리케이션 환경 변수
PORT=3000
NODE_ENV=development

# OpenAI API 키 설정 (실제 API 키로 수정하세요)
OPENAI_API_KEY=your-api-key-here

# 벡터 스토어 디렉토리 설정
VECTOR_STORE_DIR=./src/data/vector_store

# ChromaDB 설정 (임베디드 모드 사용을 위한 설정)
CHROMA_DB_IMPL=sqlite
CHROMA_COLLECTION_NAME=education_content

# 필요한 환경 변수 설정
export PERSIST_DIRECTORY=./chroma_data
export CHROMA_PORT=8000
export CHROMA_HOST=localhost
export CHROMA_SERVER_HTTP_PORT=8000
export CHROMA_SERVER_HOST=localhost

# 디렉토리 확인 및 생성
mkdir -p $PERSIST_DIRECTORY

# ChromaDB 버전 확인
python -c "import chromadb; print(f'ChromaDB 버전: {chromadb.__version__}')"

# ChromaDB 서버 시작 (최신 버전 API 방식)
python -c "import chromadb; from chromadb.server import Server; server = Server(port=$CHROMA_PORT, host='$CHROMA_HOST', persist_directory='$PERSIST_DIRECTORY', allow_reset=True, telemetry_enabled=False); server.run()"

# 스크립트 파일 생성
echo '#!/bin/bash

echo "ChromaDB 서버 시작하기 (최신 버전)"
echo "==================="

echo "필요한 환경 변수 설정"
PERSIST_DIRECTORY=./chroma_data
CHROMA_PORT=8000
CHROMA_HOST=localhost
CHROMA_SERVER_HTTP_PORT=8000
CHROMA_SERVER_HOST=localhost

echo "디렉토리 확인 및 생성"
mkdir -p $PERSIST_DIRECTORY

echo "ChromaDB 서버 시작 중..."
echo "http://localhost:$CHROMA_PORT에서 실행됩니다."
echo "Ctrl+C로 서버를 종료할 수 있습니다."

# 진단 정보 표시
python -c "import chromadb; print(f\"ChromaDB 버전: {chromadb.__version__}\")"

# ChromaDB 서버 시작 (최신 버전 API 방식)
echo "최신 API로 시작 중..."
python -c "import chromadb; from chromadb.server import Server; server = Server(port=$CHROMA_PORT, host=\"$CHROMA_HOST\", persist_directory=\"$PERSIST_DIRECTORY\", allow_reset=True, telemetry_enabled=False); server.run()"

echo ""
echo "서버가 종료되었습니다."' > start-chroma.sh

# 실행 권한 부여
chmod +x start-chroma.sh

# 스크립트 실행
./start-chroma.sh
