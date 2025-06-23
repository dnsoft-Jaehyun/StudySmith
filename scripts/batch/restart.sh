#!/bin/bash
# restart.sh - 애플리케이션 재시작 스크립트

echo "🔄 교육 대화 시스템 재시작 중..."

# 기존 프로세스 종료
echo "⏹️  기존 프로세스 종료..."
pkill -f "node.*dist/server.js" || true
pkill -f "python.*chroma" || true

# 대기
sleep 2

# TypeScript 컴파일
echo "🔨 TypeScript 컴파일..."
npx tsc

# ChromaDB 서버 시작
echo "🚀 ChromaDB 서버 시작..."
cd chroma && python run_chroma.py &
CHROMA_PID=$!

# 대기
sleep 3

# Node.js 서버 시작
echo "🚀 Node.js 서버 시작..."
cd .. && node dist/server.js &
NODE_PID=$!

echo "✅ 시스템 시작 완료!"
echo "   ChromaDB PID: $CHROMA_PID"
echo "   Node.js PID: $NODE_PID"
echo ""
echo "📌 서버 주소:"
echo "   - Node.js: http://localhost:3000"
echo "   - ChromaDB: http://localhost:8000"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."

# 프로세스 대기
wait
