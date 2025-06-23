// 설정 파일
import dotenv from 'dotenv';
import path from 'path';
import { ChromaClient } from 'chromadb';

// 환경 변수 로드
dotenv.config();

// 기본 경로 설정
const BASE_DIR = path.resolve(__dirname);
const DATA_DIR = path.join(BASE_DIR, 'data');
const TEMPLATE_DIR = path.join(BASE_DIR, 'templates');
// ChromaDB 데이터 저장 위치 - 루트 디렉토리에 생성하도록 명확하게 지정
const VECTOR_STORE_DIR = process.env.VECTOR_STORE_DIR || path.join(process.cwd(), 'chroma_data');

// API 설정
const API_CONFIG = {
  port: process.env.PORT || 3000,
  host: '0.0.0.0',
  corsOrigin: process.env.NODE_ENV === 'production' ? false : '*',
  openaiApiKey: process.env.OPENAI_API_KEY,
};

// LLM 설정
const LLM_CONFIG = {
  queryRewrite: {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 256
  },
  questionGeneration: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048  // 더 많은 문제 생성을 위해 증가
  },
  hintExplanation: {
    model: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 512
  },
  answer: {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 1000
  }
};

// 임베딩 설정
const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  fallbackModel: 'text-embedding-ada-002'
};

// 벡터 스토어 설정
const VECTOR_STORE_CONFIG = {
  persistDirectory: VECTOR_STORE_DIR,
  collectionName: 'chroma_docs', // ChromaDB 컬렉션 이름을 Python 코드와 일치시킴
  chromaSettings: {
    allowReset: true,
    anonymizedTelemetry: false,
    hnsw: {
      space: 'cosine',
      maxConnections: 32
    }
  },
  // ChromaDB 서버 URL 및 포트 설정 추가
  serverUrl: process.env.CHROMA_SERVER_URL || 'http://localhost:8000'
};

// 대상 교과 및 문항 유형
const SUBJECTS = ['국어', '사회', '과학'];
const GRADES = ['3', '4', '5', '6'];
const QUESTION_TYPES = ['객관식', 'OX', '빈칸', '서술형'];

// 로깅 설정
const LOGGING_CONFIG = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: 'combined'
};

// 개발 상태 표시
const DEVELOPMENT_MODE = process.env.NODE_ENV !== 'production';

// 벡터 검색 설정에서 거리 임계값 낮추기
const SEARCH_CONFIG = {
  minSimilarityScore: 0.2,  // 기본값이 너무 높을 수 있음 (0.8 → 0.2)
  maxDistance: 0.9          // 거리 상한도 늘림
};

/* 
// 임시 디버깅 코드: 직접 Chroma 클라이언트로 쿼리
const testDirectChromaQuery = async () => {
  const client = new ChromaClient();
  const vectorStoreManagerInstance = (await import('./modules/vectorStoreManager')).default;
  const collection = await client.getCollection({ 
    name: "chroma_docs",
    embeddingFunction: vectorStoreManagerInstance.loadEmbeddingFunction() 
  });
  
  // 메타데이터 없이 가장 기본적인 쿼리
  const rawResults = await collection.query({
    queryTexts: ["사회"],
    nResults: 10,
  });
  
  console.log("직접 쿼리 결과:", rawResults.ids.length > 0);
  console.log("첫 번째 문서:", rawResults.documents[0]?.slice(0, 100));
};

// 가장 기본적인 테스트는 하나의 키워드로 시작
const testResults = async () => {
  const client = new ChromaClient();
  const vectorStoreManagerInstance = (await import('./modules/vectorStoreManager')).default;
  const collection = await client.getCollection({ 
    name: "chroma_docs", 
    embeddingFunction: vectorStoreManagerInstance.loadEmbeddingFunction()
  });
  
  // 메타데이터 없이 가장 기본적인 쿼리
  const rawResults = await collection.query({
    queryTexts: ["사회"],
    nResults: 10,
  });
  
  console.log("직접 쿼리 결과:", rawResults.ids.length > 0);
  console.log("첫 번째 문서:", rawResults.documents[0]?.slice(0, 100));
};
*/

export {
  BASE_DIR,
  DATA_DIR,
  TEMPLATE_DIR,
  VECTOR_STORE_DIR,
  API_CONFIG,
  LLM_CONFIG,
  EMBEDDING_CONFIG,
  VECTOR_STORE_CONFIG,
  SUBJECTS,
  GRADES,
  QUESTION_TYPES,
  LOGGING_CONFIG,
  DEVELOPMENT_MODE,
  SEARCH_CONFIG
};
