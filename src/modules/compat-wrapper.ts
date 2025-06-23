/**
 * ChromaDB API 버전 호환성 래퍼 (TypeScript 버전)
 * 최신 클라이언트(1.10.5)가 이전 서버(1.0.9/1.0.10)의 API와 통신할 수 있도록 함
 */
import { ChromaClient } from 'chromadb';
import axios from 'axios';

/**
 * 임시 임베딩 생성 함수 (자체 임베딩 생성)
 */
export function createDummyEmbedding(dimension = 384): number[] {
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

/**
 * 호환성 클라이언트 인터페이스
 */
export interface CompatClient {
  _api: any;
  _client: ChromaClient;
  testConnection(): Promise<boolean>;
  listCollections(): Promise<any[]>;
  createCollection(params: any): Promise<any>;
  getCollection(params: any): Promise<any>;
  getOrCreateCollection(params: any): Promise<any>;
  _createCollectionWrapper(id: string, name: string): any;
}

/**
 * ChromaDB 클라이언트 팩토리 함수
 * API 버전을 명시적으로 v1으로 설정
 * @param serverUrl 서버 URL (기본값: http://localhost:8000)
 * @param apiPath API 경로 (기본값: /api/v1)
 */
export function createCompatClient(serverUrl = 'http://localhost:8000', apiPath = '/api/v1'): CompatClient {
  console.log(`ChromaDB 서버에 연결 중... (URL: ${serverUrl}, API 경로: ${apiPath})`);
  
  // 사용자 정의 Axios 인스턴스 생성
  const v1Api = axios.create({
    baseURL: `${serverUrl}${apiPath}`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
  });
  
  // 기본 설정으로 클라이언트 생성
  const client = new ChromaClient({ 
    path: serverUrl,
    apiPath: apiPath // API 경로 명시적 지정
    // 타입 호환성 이슈로 인해 직접 타입 지정
    // @ts-ignore - ChromaClient 내부적으로 apiPath를 지원할 수 있지만 타입에는 없음
  } as any);

  // API 버전 별칭 추가
  const v1Client: CompatClient = {
    // 사용자 정의 API 저장
    _api: v1Api,
    
    // 원본 클라이언트 저장
    _client: client,
    
    // 연결 테스트 - 직접 v1 API로 접근
    async testConnection(): Promise<boolean> {
      try {
        console.log('v1 API로 서버 연결 테스트 중...');
        // 직접 v1 API 엔드포인트로 요청
        try {
          const response = await v1Api.get('/heartbeat');
          console.log('✅ v1 API 연결 성공!');
          return true;
        } catch (heartbeatError) {
          console.log('❌ v1 heartbeat API 접근 실패, 컬렉션 엔드포인트로 시도...');
          
          try {
            const response = await v1Api.get('/collections');
            console.log('✅ v1 API 컬렉션 엔드포인트 접근 성공!');
            return true;
          } catch (collectionsError) {
            console.error('❌ v1 API 접근 실패:', (collectionsError as Error).message);
            return false;
          }
        }
      } catch (error) {
        console.error('ChromaDB 연결 테스트 실패:', (error as Error).message);
        return false;
      }
    },
    
    // 컬렉션 목록
    async listCollections(): Promise<any[]> {
      try {
        const response = await v1Api.get('/collections');
        return response.data;
      } catch (error) {
        console.error('컬렉션 목록 조회 실패:', (error as Error).message);
        throw error;
      }
    },
    
    // 컬렉션 생성
    async createCollection(params: any): Promise<any> {
      try {
        let name, metadata;
        
        // v1 API 호환성 처리 - 문자열 또는 객체 형태 지원
        if (typeof params === 'string') {
          name = params;
          metadata = { description: `ChromaDB 컬렉션: ${name}` }; // 비어있지 않은 메타데이터 추가
        } else {
          name = params.name;
          // 메타데이터가 비어있는 경우 기본값 설정
          metadata = params.metadata && Object.keys(params.metadata).length > 0 
            ? params.metadata 
            : { description: `ChromaDB 컬렉션: ${name}` };
        }
        
        // API 직접 호출
        const payload = { name, metadata };
        const response = await v1Api.post('/collections', payload);
        const collectionId = response.data.id;
        
        // 래핑된 컬렉션 객체 생성
        return this._createCollectionWrapper(collectionId, name);
      } catch (error) {
        console.error(`컬렉션 생성 실패:`, (error as Error).message);
        throw error;
      }
    },
    
    // 컬렉션 조회
    async getCollection(params: any): Promise<any> {
      try {
        let name;
        
        // v1 API 호환성 처리
        if (typeof params === 'string') {
          name = params;
        } else {
          name = params.name;
        }
        
        // 먼저 컬렉션 목록 조회
        const collections = await this.listCollections();
        const collection = collections.find(c => c.name === name);
        
        if (!collection) {
          throw new Error(`컬렉션 "${name}"를 찾을 수 없습니다.`);
        }
        
        // 래핑된 컬렉션 객체 생성
        return this._createCollectionWrapper(collection.id, name);
      } catch (error) {
        console.error(`컬렉션 조회 실패:`, (error as Error).message);
        throw error;
      }
    },
    
    // 컬렉션 생성 또는 조회
    async getOrCreateCollection(params: any): Promise<any> {
      try {
        let name, metadata;
        
        // v1 API 호환성 처리
        if (typeof params === 'string') {
          name = params;
          metadata = { description: `ChromaDB 컬렉션: ${name}` }; // 비어있지 않은 메타데이터 추가
        } else {
          name = params.name;
          // 메타데이터가 비어있는 경우 기본값 설정
          metadata = params.metadata && Object.keys(params.metadata).length > 0 
            ? params.metadata 
            : { description: `ChromaDB 컬렉션: ${name}` };
        }
        
        // 먼저 컬렉션이 있는지 확인
        try {
          return await this.getCollection(name);
        } catch (error) {
          // 컬렉션이 없으면 생성
          console.log(`컬렉션 "${name}"이 없어 새로 생성합니다.`);
          return await this.createCollection({ name, metadata });
        }
      } catch (error) {
        console.error(`컬렉션 조회/생성 실패:`, (error as Error).message);
        throw error;
      }
    },
    
    // 래핑된 컬렉션 객체 생성
    _createCollectionWrapper(id: string, name: string): any {
      const api = this._api;
      
      return {
        id,
        name,
        
        // 문서 추가
        async add({ ids, documents, metadatas = null, embeddings = null }: any): Promise<any> {
          try {
            if (!Array.isArray(ids) || !Array.isArray(documents)) {
              throw new Error('ids와 documents는 배열이어야 합니다.');
            }
            
            if (ids.length !== documents.length) {
              throw new Error('ids와 documents의 길이가 일치해야 합니다.');
            }
            
            const payload: any = { ids, documents };
            
            if (metadatas) {
              if (Array.isArray(metadatas) && metadatas.length === ids.length) {
                payload.metadatas = metadatas;
              } else {
                throw new Error('metadatas는 ids와 길이가 같은 배열이어야 합니다.');
              }
            }
            
            if (embeddings) {
              if (Array.isArray(embeddings) && embeddings.length === ids.length) {
                payload.embeddings = embeddings;
              } else {
                throw new Error('embeddings는 ids와 길이가 같은 배열이어야 합니다.');
              }
            }
            
            const response = await api.post(`/collections/${id}/add`, payload);
            return response.data;
          } catch (error) {
            console.error('문서 추가 실패:', (error as Error).message);
            throw error;
          }
        },
        
        // 문서 검색
        async query({ queryTexts, queryEmbeddings = null, nResults = 10, where = null }: any): Promise<any> {
          try {
            const payload: any = {
              k: nResults // n_results 대신 k 사용
            };
            
            // 임시 임베딩 생성 - v1 API에서는 query_embeddings가 필요
            if (queryTexts && !queryEmbeddings) {
              const texts = Array.isArray(queryTexts) ? queryTexts : [queryTexts];
              payload.query_texts = texts;
              payload.query_embeddings = texts.map(() => createDummyEmbedding());
            } else if (queryEmbeddings) {
              payload.query_embeddings = Array.isArray(queryEmbeddings) 
                ? queryEmbeddings 
                : [queryEmbeddings];
            }
            
            if (where) {
              payload.where_document = where; // where 대신 where_document 사용
            }
            
            const response = await api.post(`/collections/${id}/query`, payload);
            return response.data;
          } catch (error) {
            console.error('문서 검색 실패:', (error as Error).message);
            throw error;
          }
        },
        
        // 문서 조회
        async get({ ids = null, where = null }: any): Promise<any> {
          try {
            const payload: any = {};
            
            if (ids) {
              payload.ids = Array.isArray(ids) ? ids : [ids];
            }
            
            if (where) {
              payload.where_document = where;
            }
            
            const response = await api.post(`/collections/${id}/get`, payload);
            return response.data;
          } catch (error) {
            console.error('문서 조회 실패:', (error as Error).message);
            throw error;
          }
        },
        
        // 문서 수 조회
        async count(): Promise<number> {
          try {
            const response = await api.get(`/collections/${id}/count`);
            return typeof response.data === 'number' 
              ? response.data 
              : (response.data.count || 0);
          } catch (error) {
            console.error('문서 수 조회 실패:', (error as Error).message);
            return 0;
          }
        },
        
        // 문서 수정
        async update({ ids, documents = null, metadatas = null, embeddings = null }: any): Promise<any> {
          try {
            if (!Array.isArray(ids)) {
              throw new Error('ids는 배열이어야 합니다.');
            }
            
            const payload: any = { ids };
            
            if (documents) {
              if (Array.isArray(documents) && documents.length === ids.length) {
                payload.documents = documents;
              } else {
                throw new Error('documents는 ids와 길이가 같은 배열이어야 합니다.');
              }
            }
            
            if (metadatas) {
              if (Array.isArray(metadatas) && metadatas.length === ids.length) {
                payload.metadatas = metadatas;
              } else {
                throw new Error('metadatas는 ids와 길이가 같은 배열이어야 합니다.');
              }
            }
            
            if (embeddings) {
              if (Array.isArray(embeddings) && embeddings.length === ids.length) {
                payload.embeddings = embeddings;
              } else {
                throw new Error('embeddings는 ids와 길이가 같은 배열이어야 합니다.');
              }
            }
            
            const response = await api.post(`/collections/${id}/update`, payload);
            return response.data;
          } catch (error) {
            console.error('문서 수정 실패:', (error as Error).message);
            throw error;
          }
        },
        
        // 문서 삭제
        async delete({ ids = null, where = null }: any): Promise<any> {
          try {
            const payload: any = {};
            
            if (ids) {
              payload.ids = Array.isArray(ids) ? ids : [ids];
            }
            
            if (where) {
              payload.where_document = where;
            }
            
            const response = await api.post(`/collections/${id}/delete`, payload);
            return response.data;
          } catch (error) {
            console.error('문서 삭제 실패:', (error as Error).message);
            throw error;
          }
        }
      };
    }
  };
  
  return v1Client;
} 