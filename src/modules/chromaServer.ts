import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ChromaClient, Collection, OpenAIEmbeddingFunction } from 'chromadb';
import axios from 'axios';
import { createCompatClient, CompatClient } from './compat-wrapper';
import { VECTOR_STORE_CONFIG, API_CONFIG } from '../config';

/**
 * ChromaDB 서버 관리 클래스
 * - 서버 프로세스 시작 및 상태 확인
 * - 클라이언트 초기화
 */
class ChromaServer {
  private serverProcess: ChildProcess | null = null;
  private client: CompatClient | null = null;
  private static instance: ChromaServer;
  private initialized: boolean = false;
  private isStarted: boolean = false;
  private serverUrl: string;
  private dbPath: string = '';
  private isServerExternal: boolean = false;
  private corsOrigins: string = 'http://localhost:3000';
  private serverHost: string;
  private serverPort: number;
  private serverPath: string;
  private connectionRetries: number = 5;
  private maxRetries: number = 5;
  private retryDelay: number = 2000;
  
  private constructor() {
    const host = process.env.CHROMA_DB_HOST || 'localhost';
    const port = parseInt(process.env.CHROMA_DB_PORT || '8000', 10);
    this.serverUrl = process.env.CHROMA_SERVER_URL || `http://${host}:${port}/api/v1`;
    console.log(`ChromaServer initialized for URL: ${this.serverUrl}`);
    
    // 환경 변수에서 설정 가져오기
    this.serverHost = process.env.CHROMA_SERVER_HOST || 'localhost';
    this.serverPort = parseInt(process.env.CHROMA_SERVER_PORT || '8000', 10);
    this.serverUrl = process.env.CHROMA_SERVER_URL || `http://${this.serverHost}:${this.serverPort}/api/v1`;
    this.dbPath = process.env.CHROMA_DB_PATH || path.join(process.cwd(), 'chroma_db');
    this.isServerExternal = process.env.CHROMA_EXTERNAL_SERVER === 'true';
    
    // CORS 설정 변경 - 와일드카드(*) 대신 구체적인 URL 사용
    this.corsOrigins = process.env.CHROMA_SERVER_CORS_ALLOW_ORIGINS || 'http://localhost:3000';
    
    console.log(`ChromaDB 설정:`);
    console.log(`- 서버 URL: ${this.serverUrl}`);
    console.log(`- 데이터 경로: ${this.dbPath}`);
    console.log(`- 외부 서버: ${this.isServerExternal}`);
    console.log(`- CORS 허용 출처: ${this.corsOrigins}`);
    
    // 데이터 디렉토리 생성
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
  }

  public static getInstance(): ChromaServer {
    if (!ChromaServer.instance) {
      ChromaServer.instance = new ChromaServer();
    }
    return ChromaServer.instance;
  }

  /**
   * ChromaDB 서버가 실행 중인지 확인
   */
  async isServerRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serverUrl}/api/v1/heartbeat`, { 
        timeout: 3000
      });
      
      if (response.status === 200) {
        console.log('ChromaDB 서버가 응답함: 상태 양호');
        return true;
      }
      return false;
    } catch (error) {
      console.log('ChromaDB 서버가 응답하지 않음');
      return false;
    }
  }

  /**
   * ChromaDB 서버 시작
   */
  async startServer(): Promise<boolean> {
    // 이미 시작되었거나 외부 서버 사용 시
    if (this.isStarted || this.isServerExternal) {
      return true;
    }

    // 서버가 이미 실행 중인지 확인
    const isRunning = await this.isServerRunning();
    if (isRunning) {
      console.log('ChromaDB 서버가 이미 실행 중입니다.');
      this.isStarted = true;
      return true;
    }

    console.log('ChromaDB 서버를 직접 시작하는 대신 별도의 프로세스로 실행해 주세요.');
    console.log('\n### ChromaDB 서버 시작 방법 ###');
    console.log('새 터미널 창에서 다음 명령어를 실행하세요:');
    console.log('python chroma_server.py');
    console.log('##############################\n');
    
    return false;
  }

  /**
   * ChromaDB 클라이언트 가져오기
   * - 서버가 실행 중이 아니면 시작 시도
   * - 재연결 로직 강화
   */
  async getClient(): Promise<CompatClient> {
    if (this.client) {
      try {
        await this.client.testConnection();
        return this.client;
      } catch (error) {
        console.log("ChromaDB connection lost. Re-connecting...");
        this.client = null;
      }
    }
    
    console.log(`Connecting to ChromaDB at ${this.serverUrl}`);
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        const client = createCompatClient(this.serverUrl);
        await client.testConnection();
        this.client = client;
        console.log("Successfully connected to ChromaDB server.");
        return this.client;
      } catch (e) {
        console.error(`ChromaDB connection attempt ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
        if (i < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    throw new Error('Failed to connect to ChromaDB server after multiple retries.');
  }

  /**
   * 벡터 저장소 상태 확인
   */
  async checkStatus(): Promise<{ isRunning: boolean; collections: number }> {
    try {
      const isRunning = await this.isServerRunning();
      
      if (!isRunning) {
        return {
          isRunning: false,
          collections: 0
        };
      }
      
      const client = await this.getClient();
      const collections = await client.listCollections();
      
      return {
        isRunning: true,
        collections: collections.length
      };
    } catch (error) {
      console.error('ChromaDB 상태 확인 실패:', (error as Error).message);
      return {
        isRunning: false,
        collections: 0
      };
    }
  }

  /**
   * 서버 프로세스 종료
   */
  async shutdown(): Promise<void> {
    // 클라이언트만 정리
    this.client = null;
    console.log('ChromaDB 클라이언트 연결 종료됨');
  }
}

// 싱글톤 인스턴스 생성
export const chromaServer = ChromaServer.getInstance();
export default chromaServer; 