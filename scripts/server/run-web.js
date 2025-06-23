/**
 * 웹 서버 실행 스크립트 (ChromaDB HTTP 서버 연결)
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('웹 애플리케이션 서버 시작 중...');

// 환경 변수 명시적 설정
const env = {
  ...process.env,
  PORT: '3000',
  NODE_ENV: 'development',
  CHROMA_SERVER_HOST: 'localhost',
  CHROMA_SERVER_PORT: '8000',
  CHROMA_SERVER_HTTP_PORT: '8000',
  CHROMA_SERVER_URL: 'http://localhost:8000',
  CHROMA_EXTERNAL_SERVER: 'true',
  CHROMA_DB_PATH: path.join(process.cwd(), 'chroma_db'),
  CHROMA_SERVER_CORS_ALLOW_ORIGINS: '*'
};

// 웹 서버 실행
const serverProcess = spawn('node', ['dist/server.js'], {
  env,
  stdio: 'inherit'
});

// 종료 이벤트 처리
serverProcess.on('close', (code) => {
  console.log(`웹 서버가 종료되었습니다(코드: ${code})`);
});

// 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('\n웹 서버 종료 중...');
  serverProcess.kill();
  process.exit(0);
}); 