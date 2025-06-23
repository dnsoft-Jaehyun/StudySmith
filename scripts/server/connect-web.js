/**
 * ChromaDB 로컬 모드 연결을 사용하는 웹 애플리케이션 실행 스크립트
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('웹 애플리케이션 서버 시작 중...');

// 데이터 디렉토리 확인
const dbPath = path.join(process.cwd(), 'chroma_db');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
  console.log(`ChromaDB 데이터 디렉토리 생성됨: ${dbPath}`);
}

// 문제가 되는 환경 변수를 제거하고 로컬 모드 설정 추가
const env = { 
  ...process.env,
  
  // 기본 설정
  PORT: '3000',
  NODE_ENV: 'development',
  NODE_OPTIONS: '--max-old-space-size=8192',
  
  // ChromaDB 로컬 모드 사용 설정
  CHROMA_USE_LOCAL_MODE: 'true',     // 이 환경 변수를 서버 코드에서 확인하여 처리
  CHROMA_DB_PATH: dbPath,
  
  // 문제가 되는 환경 변수 제거
  CHROMA_SERVER_CORS_ALLOW_ORIGINS: undefined,
  chroma_server_cors_allow_origins: undefined,
  CHROMA_SERVER_HOST: undefined,
  CHROMA_SERVER_PORT: undefined,
  CHROMA_SERVER_URL: undefined,
  CHROMA_EXTERNAL_SERVER: undefined
};

// 웹 서버 패치 스크립트 생성
const patchScript = `
// ChromaDB 연결 모듈 패치 스크립트
const path = require('path');
const fs = require('fs');

// chromaServer.ts 파일 패치를 위한 코드
const chromaServerPath = path.join(__dirname, 'src/modules/chromaServer.ts');
if (fs.existsSync(chromaServerPath)) {
  console.log('ChromaServer 모듈 패치 중...');
  
  let content = fs.readFileSync(chromaServerPath, 'utf8');
  
  // getClient 메서드를 로컬 모드로 패치
  if (content.includes('async getClient()')) {
    content = content.replace(
      /async getClient\(\): Promise<ChromaClient>[^}]+}/s,
      \`async getClient(): Promise<ChromaClient> {
    // 로컬 모드 사용
    console.log('ChromaDB 로컬 모드 연결 사용');
    
    // 새 클라이언트 생성 (로컬 모드)
    const dbPath = process.env.CHROMA_DB_PATH || path.join(process.cwd(), 'chroma_db');
    this.client = new ChromaClient();
    
    try {
      // 연결 테스트
      await this.client.heartbeat();
      console.log('ChromaDB 로컬 클라이언트 초기화 완료');
      return this.client;
    } catch (error) {
      console.error(\\\`ChromaDB 클라이언트 연결 실패: \\\${error.message}\\\`);
      throw new Error(\\\`ChromaDB 클라이언트 연결 실패: \\\${error.message}\\\`);
    }
  }\`
    );
    
    // 변경 사항 저장
    fs.writeFileSync(chromaServerPath, content, 'utf8');
    console.log('ChromaServer 모듈 패치 완료');
  }
}

// 향후 추가 패치 코드...
`;

// 패치 스크립트 파일 생성
const patchScriptPath = path.join(__dirname, 'patch-chroma.js');
fs.writeFileSync(patchScriptPath, patchScript);

// 패치 스크립트 실행
console.log('ChromaDB 연결 모듈 패치 중...');
try {
  require('./patch-chroma');
  console.log('패치 적용 완료');
} catch (err) {
  console.error('패치 적용 실패:', err);
}

// 웹 서버 실행
console.log('웹 서버 시작 중...');
const serverProcess = spawn('node', ['dist/server.js'], {
  env,
  stdio: 'inherit'
});

// 종료 이벤트 처리
serverProcess.on('close', (code) => {
  console.log(`웹 서버가 종료되었습니다(코드: ${code})`);
  cleanup();
  process.exit(0);
});

// 임시 파일 정리 함수
function cleanup() {
  try {
    if (fs.existsSync(patchScriptPath)) {
      fs.unlinkSync(patchScriptPath);
    }
  } catch (err) {
    // 무시
  }
}

// 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('\n웹 서버 종료 중...');
  serverProcess.kill();
  cleanup();
  process.exit(0);
}); 