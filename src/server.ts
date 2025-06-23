/****************************************************************
 * server.ts ― Express + WebSocket + ChromaDB(BM25) Bootstrap
 ****************************************************************/
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import { setupWebSocket } from './api/websocket';
import { initializeJobs, jobQueue } from './modules/jobQueue';
import { documentProcessor } from './modules/documentProcessor';
import multer from 'multer';
import apiRouter from './api/index';

const app = express();
const server = http.createServer(app);

// 필수 디렉토리 생성
const ensureDirectories = () => {
  const directories = ['uploads', 'tmp', 'data/vector_store'];
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 디렉토리 생성: ${dir}`);
    }
  });
};

// 서버 시작 전 디렉토리 확인
ensureDirectories();

// 서버 연결 안정성 개선 설정
server.keepAliveTimeout = 300000; // 5분 keep-alive
server.headersTimeout = 310000; // 5분 10초 헤더 타임아웃
server.requestTimeout = 300000; // 5분 요청 타임아웃

// CORS 설정
const corsOptions = {
  origin: '*', // 디버깅을 위해 모든 출처를 임시로 허용합니다.
  credentials: true,
};
app.use(cors(corsOptions));

// 미들웨어 설정
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',
  parameterLimit: 1000000
}));

// UTF-8 인코딩 설정
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// 정적 파일 제공 (개발/프로덕션 모두)
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.static(path.join(__dirname, '../public')));

// API 라우터 설정
app.use('/api', apiRouter);

// 웹소켓 설정
setupWebSocket(server);

// 작업 큐 초기화
initializeJobs();

// SPA fallback: 모든 환경에서 실행
app.get('*', (req, res) => {
  // API 요청이 아닌 경우에만 index.html을 반환
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  }
});

// 서버 시작
const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 서버 실행 → http://localhost:${PORT}`);
  if (PORT === 3000) {
    console.log(`🌐 웹페이지 접속 → http://localhost:3000`);
  } else {
    console.log(`🔧 백엔드 API → http://localhost:${PORT}/api`);
  }
});

export default server;
