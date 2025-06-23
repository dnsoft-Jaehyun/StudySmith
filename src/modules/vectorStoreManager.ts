import { ChromaClient, Collection, OpenAIEmbeddingFunction } from 'chromadb';
import { Document } from '@langchain/core/documents';

const OpenAI = require('openai');

export class VectorStoreManager {
  private client: ChromaClient;
  private embeddingFunction: OpenAIEmbeddingFunction;
  private openaiClient: any;

  constructor() {
    const chromaUrl = process.env.CHROMA_SERVER_URL || 'http://chroma_server:8000';
    console.log(`ChromaDB 서버에 연결 중... (URL: ${chromaUrl})`);
    
    // ChromaDB 0.6.1 버전 방식으로 클라이언트 초기화
    this.client = new ChromaClient({
      path: chromaUrl
    });
    
    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY!,
    });
    
    // 새로운 OpenAI 클라이언트 초기화
    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  private async checkConnection(): Promise<boolean> {
    try {
      // ChromaDB 연결 확인을 HTTP 요청으로 직접 수행
      const chromaUrl = process.env.CHROMA_SERVER_URL || 'http://chroma_server:8000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
      
      const response = await fetch(`${chromaUrl}/api/v1/heartbeat`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('✅ ChromaDB 연결 성공');
        return true;
      } else {
        console.warn(`⚠️ ChromaDB 연결 실패: HTTP ${response.status} - 메모리 모드로 전환`);
        return false;
      }
    } catch (error) {
      console.warn('⚠️ ChromaDB 연결 확인 실패 - 메모리 모드로 전환:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.log(`[임베딩 생성] ${texts.length}개 텍스트 처리 시작`);
      
      // OpenAI API 토큰 제한을 고려한 최적화된 배치 처리
      // 256-512개가 대부분 워크로드에서 최적, 토큰 한도 내에서 안전한 크기
      const batchSize = 256; // 최적화된 배치 크기 (기존 100 → 256)
      const allEmbeddings: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        console.log(`[임베딩 생성] 배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}: ${batch.length}개 처리 중...`);
        
        try {
          const response = await this.openaiClient.embeddings.create({
            model: 'text-embedding-ada-002',
            input: batch,
          });
          
          const batchEmbeddings = response.data.map(item => item.embedding);
          allEmbeddings.push(...batchEmbeddings);
          
          console.log(`[임베딩 생성] 배치 완료: ${batchEmbeddings.length}개 임베딩 생성 (누적: ${allEmbeddings.length}/${texts.length})`);
          
          // API 요청 간격 조절 (Rate Limiting 방지) - 배치 크기 증가로 대기 시간 단축
          if (i + batchSize < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 250)); // 0.25초 대기 (기존 0.5초 → 0.25초)
          }
        } catch (batchError: any) {
          console.error(`[임베딩 생성] 배치 ${Math.floor(i/batchSize) + 1} 실패:`, batchError.message);
          throw batchError;
        }
      }
      
      console.log(`[임베딩 생성] 전체 완료: ${allEmbeddings.length}개 임베딩 생성 완료`);
      return allEmbeddings;
    } catch (error) {
      console.error('[임베딩 생성] 오류 발생:', error);
      throw error;
    }
  }

  public async getOrCreateCollection(collectionName: string): Promise<Collection | null> {
    if (!await this.checkConnection()) {
      console.warn(`⚠️ ChromaDB 연결 없음 - 컬렉션 "${collectionName}" 메모리 모드로 처리`);
      return null; // 메모리 모드에서는 null 반환
    }
    try {
      // OpenAI 임베딩 함수를 명시적으로 추가하여 호환성 문제 해결
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: this.embeddingFunction,
      });
      console.log(`✅ 컬렉션 "${collectionName}"을(를) 성공적으로 가져오거나 생성했습니다.`);
      return collection;
    } catch (error) {
      console.error(`❌ 컬렉션 "${collectionName}" 처리 중 오류 발생:`, error);
      return null; // 오류 시에도 null 반환하여 메모리 모드로 전환
    }
  }
    
  public async deleteCollection(name: string): Promise<void> {
    if (!await this.checkConnection()) return;
    try {
      await this.client.deleteCollection({ name });
      console.log(`컬렉션 "${name}"이(가) 삭제되었습니다.`);
    } catch (error) {
      console.error(`컬렉션 "${name}" 삭제 중 오류 발생:`, error);
    }
  }

  /**
   * ChromaDB v1 스펙에 맞게 메타데이터 필터를 $and 연산자로 감싸는 헬퍼 함수
   */
  private normalizeMetadataFilter(filter?: Record<string, any>): Record<string, any> | undefined {
    if (!filter || Object.keys(filter).length === 0) {
      return undefined;
    }
    
    // v1 호환을 위한 타입 일관성 강화
    const normalized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && value !== null && value !== '') {
        // ChromaDB v1 타입 일관성 강화
        if (typeof value === 'object' && value.$in && Array.isArray(value.$in)) {
          // $in 연산자: 배열 요소들을 문자열로 통일
          const cleanedArray = value.$in
            .map((item: any) => typeof item === 'string' ? item.trim().toLowerCase() : String(item).trim().toLowerCase())
            .filter((item: string) => item.length > 0);
          
          if (cleanedArray.length > 0) {
            normalized[key] = { $in: cleanedArray };
          }
        } else if (typeof value === 'number') {
          // 숫자는 문자열로 변환 (grade: 6 → "6")
          normalized[key] = String(value);
        } else if (typeof value === 'string') {
          // 문자열은 트림 후 저장
          const trimmed = value.trim();
          if (trimmed.length > 0) {
            normalized[key] = trimmed;
          }
        } else {
          // 기타 타입은 그대로 저장
          normalized[key] = value;
        }
      }
    }
    
    // 정규화 결과가 비어있으면 undefined 반환
    const normalizedKeys = Object.keys(normalized);
    if (normalizedKeys.length === 0) {
      return undefined;
    }
    
    // 이미 $and로 감싸져 있는 경우 그대로 반환
    if (normalized.$and) {
      return normalized;
    }
    
    // 단일 필터 조건인 경우 그대로 반환
    if (normalizedKeys.length === 1) {
      return normalized;
    }
    
    // 다중 필터 조건을 $and로 감싸기
    const conditions = normalizedKeys.map(key => ({ [key]: normalized[key] }));
    console.log(`[v1 필터 정규화] 원본:`, JSON.stringify(filter), `→ 정규화:`, JSON.stringify({ $and: conditions }));
    return { $and: conditions };
  }

  /**
   * 점진적 완화를 위한 필터 생성 (후보군 확보용)
   */
  private createRelaxedFilter(originalFilter: any, allowedKeys: string[]): any | undefined {
    if (!originalFilter) return undefined;
    
    // $and 조건이 있는 경우 해당 조건들을 필터링
    if (originalFilter.$and && Array.isArray(originalFilter.$and)) {
      const relaxedConditions = originalFilter.$and.filter((condition: any) => {
        const conditionKeys = Object.keys(condition);
        return conditionKeys.some(key => allowedKeys.includes(key));
      });
      
      if (relaxedConditions.length === 0) return undefined;
      if (relaxedConditions.length === 1) return relaxedConditions[0];
      return { $and: relaxedConditions };
    }
    
    // 일반 객체인 경우
    const relaxedFilter: any = {};
    for (const key of allowedKeys) {
      if (originalFilter[key] !== undefined) {
        relaxedFilter[key] = originalFilter[key];
      }
    }
    
    return Object.keys(relaxedFilter).length > 0 ? relaxedFilter : undefined;
  }

  /**
   * 컬렉션의 실제 메타데이터 샘플을 출력하여 디버깅
   */
  private async debugCollectionMetadata(collection: any, sampleSize: number = 5): Promise<void> {
    try {
      console.log(`[디버깅] 컬렉션 "${collection.name}" 메타데이터 샘플 확인 중...`);
      
      const sampleResults = await (collection.get as any)({
        limit: sampleSize,
        include: ['metadatas']
      });
      
      const metadatas = sampleResults.metadatas || [];
      console.log(`[디버깅] 샘플 ${metadatas.length}개 문서의 메타데이터:`);
      
      metadatas.forEach((metadata: any, index: number) => {
        console.log(`[디버깅] 문서 ${index + 1}:`, JSON.stringify(metadata, null, 2));
        
        // 키워드 관련 필드만 별도 출력
        const keywordFields = Object.keys(metadata).filter(key => 
          key.startsWith('kw_') || key === 'keyword_primary' || key === 'keywords'
        );
        if (keywordFields.length > 0) {
          console.log(`[디버깅] 문서 ${index + 1} 키워드 필드:`, 
            Object.fromEntries(keywordFields.map(key => [key, metadata[key]]))
          );
        }
      });
    } catch (error) {
      console.log(`[디버깅] 메타데이터 샘플 확인 실패:`, error);
    }
  }

  public async addDocuments(collection: Collection | null, documents: Document[]): Promise<void> {
    if (documents.length === 0) return;
    
    if (!collection) {
      console.warn(`⚠️ ChromaDB 컬렉션 없음 - ${documents.length}개 문서를 메모리에만 저장`);
      return; // 메모리 모드에서는 documentProcessor가 메모리에 저장
    }
    
    const ids = documents.map((doc, i) => doc.metadata.id || `${collection.name}_${Date.now()}_${i}`);
    const contents = documents.map(doc => doc.pageContent);
    
    // ChromaDB v1 호환을 위한 메타데이터 변환 ("스칼라 + 플래그" 하이브리드)
    const metadatas = documents.map(doc => {
      const metadata = { ...doc.metadata };
      
      // v1 타입 일관성 강화: 모든 필드를 문자열로 변환
      Object.keys(metadata).forEach(key => {
        if (typeof metadata[key] === 'number') {
          metadata[key] = String(metadata[key]); // grade: 6 → "6"
        } else if (typeof metadata[key] === 'string') {
          metadata[key] = metadata[key].trim(); // 공백 제거
        }
      });
      
      // keywords 배열을 v1 호환 형식으로 변환
      if (metadata.keywords && Array.isArray(metadata.keywords) && metadata.keywords.length > 0) {
        const keywords = metadata.keywords
          .map(k => String(k).trim().toLowerCase()) // 타입 안전성 강화
          .filter(k => k.length > 0); // 빈 키워드 제거
        
        if (keywords.length > 0) {
          // 1. 대표 키워드 스칼라 저장 (OR 검색용)
          metadata.keyword_primary = keywords[0];
          
          // 2. 개별 키워드 플래그 저장 (AND 검색용)
          keywords.forEach(keyword => {
            // 키워드 정규화: 공백, 특수문자 제거
            const cleanKeyword = keyword.replace(/[^\w가-힣]/g, '');
            if (cleanKeyword.length > 0) {
              metadata[`kw_${cleanKeyword}`] = true;
            }
          });
          
          // 3. 기존 keywords 필드 제거 (v1 호환을 위해)
          delete metadata.keywords;
        }
      }
      
      return metadata;
    });

    try {
      // 직접 임베딩 생성하여 OpenAI API 호환성 문제 해결
      console.log(`[문서 추가] ${contents.length}개 문서에 대한 임베딩 생성 시작`);
      const embeddings = await this.generateEmbeddings(contents);
      console.log(`[문서 추가] 임베딩 생성 완료: ${embeddings.length}개`);
      
      // ChromaDB도 배치로 추가 (대용량 데이터 처리)
      const addBatchSize = 500; // ChromaDB 추가 배치 크기
      for (let i = 0; i < documents.length; i += addBatchSize) {
        const batchIds = ids.slice(i, i + addBatchSize);
        const batchContents = contents.slice(i, i + addBatchSize);
        const batchMetadatas = metadatas.slice(i, i + addBatchSize);
        const batchEmbeddings = embeddings.slice(i, i + addBatchSize);
        
        console.log(`[문서 추가] ChromaDB 배치 ${Math.floor(i/addBatchSize) + 1}/${Math.ceil(documents.length/addBatchSize)}: ${batchContents.length}개 추가 중...`);
        
        await collection.add({
          ids: batchIds,
          documents: batchContents,
          metadatas: batchMetadatas,
          embeddings: batchEmbeddings,
        });
        
        console.log(`[문서 추가] ChromaDB 배치 완료: ${batchContents.length}개 추가됨`);
      }
      
      console.log(`${documents.length}개의 문서를 컬렉션 "${collection.name}"에 추가했습니다.`);
    } catch(error) {
      console.error(`문서 추가 중 오류 발생:`, error);
      throw error; // 오류를 상위로 전파하여 문제를 명확히 함
    }
  }

  public async search(collection: Collection, query: string, numResults: number, filter?: Record<string, any>): Promise<Document[]> {
    if (!await this.checkConnection()) return [];
    
    if (!query) {
        console.warn("검색어가 비어 있어 문서 검색을 건너니다.");
        return [];
    }

    try {
      console.log(`[VectorStore] Executing search with:`);
      console.log(`  - Query: "${query}" (Type: ${typeof query})`);
      console.log(`  - Num Results: ${numResults}`);
      console.log(`  - Filter: ${JSON.stringify(filter)}`);

      const normalizedFilter = this.normalizeMetadataFilter(filter);
      console.log(`[문서 검색] 정규화된 필터:`, normalizedFilter);
      
      const results = await (collection.query as any)({
        queryTexts: [query],
        nResults: numResults,
        where: normalizedFilter,
      });
      
      if (!results.documents || results.documents.length === 0) {
        return [];
      }
  
      const documents = (results.documents[0] || []) as (string | null)[];
      const metadatas = (results.metadatas?.[0] || []) as (any | null)[];

      return documents.map((doc, i) => new Document({
        pageContent: doc || '',
        metadata: metadatas[i] || {},
      })).filter(doc => doc.pageContent);
    } catch (error) {
      console.error('문서 검색 오류:', error);
      return [];
    }
  }

  /**
   * 최적화된 하이브리드 검색 - 단일 API 호출 + 클라이언트 사이드 결합
   */
  public async hybridSearch(
    collectionName: string, 
    queryTexts: string[], 
    filter?: Record<string, any>, 
    numResults: number = 10,
    alpha: number = 0.6 // 키워드 검색 가중치 (0.4-0.7 권장)
  ): Promise<{ documents: (string | null)[], metadatas: (any | null)[] }> {
    if (!await this.checkConnection()) {
      return { documents: [], metadatas: [] };
    }
    
    // 입력 검증
    if (!queryTexts || queryTexts.length === 0 || !queryTexts[0] || queryTexts[0].trim() === '') {
      console.log(`[하이브리드 검색] 유효하지 않은 쿼리: ${JSON.stringify(queryTexts)}`);
      return await this.fallbackDocumentRetrieval(collectionName, numResults);
    }
    
    const query = queryTexts[0].trim();
    console.log(`[하이브리드 검색] 최적화된 시작: 쿼리="${query}", 컬렉션="${collectionName}", α=${alpha}`);
    console.log(`[하이브리드 검색] 필터 상세:`, JSON.stringify(filter, null, 2));
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // 1단계: 메타데이터 필터링 확인 및 정규화
      const normalizedFilter = this.normalizeMetadataFilter(filter);
      if (normalizedFilter && Object.keys(normalizedFilter).length > 0) {
        console.log(`[하이브리드 검색] 메타데이터 필터 적용 →`, normalizedFilter);
      } else {
        console.log(`[하이브리드 검색] 메타데이터 필터 없음 - 전체 검색`);
      }
      
      // 2단계: 임베딩 생성 (병렬로 처리)
      console.log(`[하이브리드 검색] 임베딩 생성 시작...`);
      const embeddings = await this.generateEmbeddings([query]);
      console.log(`[하이브리드 검색] 임베딩 생성 완료: 차원=${embeddings[0]?.length || 0}`);
      
      // 3단계: 단일 벡터 검색으로 후보군 확보 (큰 범위)
      const candidateSize = Math.max(numResults * 3, 30); // 충분한 후보군 확보
      console.log(`[하이브리드 검색] 후보군 검색 시작: ${candidateSize}개`);
      
      let vectorResults;
      try {
        // 임베딩 검색 우선 시도
        vectorResults = await (collection.query as any)({
          queryEmbeddings: embeddings,
          nResults: candidateSize,
          where: normalizedFilter,
          include: ['documents', 'metadatas', 'distances']
        });
        console.log(`[하이브리드 검색] 벡터 후보군 획득: ${vectorResults.documents?.[0]?.length || 0}개`);
      } catch (embeddingError) {
        console.log(`[하이브리드 검색] 임베딩 검색 실패, 텍스트 검색으로 폴백:`, embeddingError);
        vectorResults = await (collection.query as any)({
          queryTexts: [query],
          nResults: candidateSize,
          where: normalizedFilter,
          include: ['documents', 'metadatas', 'distances']
        });
        console.log(`[하이브리드 검색] 텍스트 후보군 획득: ${vectorResults.documents?.[0]?.length || 0}개`);
      }
      
      if (!vectorResults.documents?.[0] || vectorResults.documents[0].length === 0) {
        console.log(`[하이브리드 검색] 후보군 없음. 폴백 검색 시도...`);
        return await this.fallbackDocumentRetrieval(collectionName, numResults);
      }
      
      // 4단계: 후보군에 대해 키워드 + 벡터 하이브리드 스코어링
      console.log(`[하이브리드 검색] 하이브리드 스코어링 시작...`);
      const documents = vectorResults.documents[0];
      const metadatas = vectorResults.metadatas?.[0] || [];
      const distances = vectorResults.distances?.[0] || [];
      
      // 키워드 스코어링을 위한 쿼리 토큰화
      const queryTerms = query.toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 1)
        .map(term => term.replace(/[^\w가-힣]/g, '')); // 한글도 포함
      
      const hybridResults: { document: string, metadata: any, score: number, vectorScore: number, keywordScore: number }[] = [];
      
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc) continue;
        
        // 벡터 스코어 (거리를 유사도로 변환)
        const vectorScore = Math.max(0, 1 - (distances[i] || 0));
        
        // 키워드 스코어 계산
        const docLower = doc.toLowerCase();
        const docTerms = docLower.split(/\s+/).filter(term => term.length > 1);
        
        let keywordScore = 0;
        const docLength = docTerms.length;
        const avgDocLength = 100;
        
        for (const queryTerm of queryTerms) {
          // 정확한 매칭
          const exactMatches = (docLower.match(new RegExp(queryTerm, 'g')) || []).length;
          if (exactMatches > 0) {
            const tf = exactMatches / docLength;
            const normalizedTf = tf / (tf + 0.5 + 1.5 * (docLength / avgDocLength));
            keywordScore += normalizedTf * 2.0;
          }
          
          // 부분 매칭
          const partialMatches = docTerms.filter(docTerm => 
            docTerm.includes(queryTerm) || queryTerm.includes(docTerm)
          ).length;
          
          if (partialMatches > 0) {
            keywordScore += (partialMatches / docLength) * 0.5;
          }
        }
        
        // 하이브리드 점수 계산 (α: 키워드 가중치, 1-α: 벡터 가중치)
        const hybridScore = alpha * keywordScore + (1 - alpha) * vectorScore;
        
        if (hybridScore > 0 || vectorScore > 0.1) { // 최소 임계값
          hybridResults.push({
            document: doc,
            metadata: metadatas[i] || null,
            score: hybridScore,
            vectorScore,
            keywordScore
          });
        }
      }
      
      // 5단계: 최종 정렬 및 결과 반환
      const finalResults = hybridResults
        .sort((a, b) => b.score - a.score)
        .slice(0, numResults);
      
      console.log(`[하이브리드 검색] 완료: ${finalResults.length}개 결과`);
      console.log(`[하이브리드 검색] 최고 점수 - 하이브리드:${finalResults[0]?.score.toFixed(3) || 0}, 벡터:${finalResults[0]?.vectorScore.toFixed(3) || 0}, 키워드:${finalResults[0]?.keywordScore.toFixed(3) || 0}`);
      
      return {
        documents: finalResults.map(r => r.document),
        metadatas: finalResults.map(r => r.metadata)
      };
      
    } catch (error) {
      console.error(`[하이브리드 검색] 오류 발생:`, error);
      return await this.fallbackDocumentRetrieval(collectionName, numResults);
    }
  }

  /**
   * v1 호환 2단계 키워드 검색 ("스칼라 + 플래그" 하이브리드)
   */
  public async hybridSearchV1Compatible(
    collectionName: string,
    queryTexts: string[],
    filter?: Record<string, any>,
    numResults: number = 10,
    alpha: number = 0.6,
    keywordMode: 'OR' | 'AND' = 'OR' // 키워드 조합 방식
  ): Promise<{ documents: (string | null)[], metadatas: (any | null)[] }> {
    try {
      console.log(`[v1 하이브리드 검색] 시작: ${queryTexts[0]}, 모드=${keywordMode}`);
      
      const collection = await this.getOrCreateCollection(collectionName);
      if (!collection) {
        throw new Error(`컬렉션 ${collectionName}을 찾을 수 없습니다.`);
      }

      const query = queryTexts[0];
      const normalizedFilter = this.normalizeMetadataFilter(filter);
      
      // 디버깅: 컬렉션의 실제 메타데이터 샘플 확인
      await this.debugCollectionMetadata(collection, 5);
      
      // 임베딩 생성
      const embeddings = await this.generateEmbeddings([query]);
      
      // 1단계: 점진적 완화 전략으로 벡터 후보군 확보
      const candidateSize = Math.max(numResults * 3, 30);
      console.log(`[v1 하이브리드] 1단계: keyword_primary 후보군 검색 (${candidateSize}개)`);
      
      let vectorResults: any;
      let documents: string[] = [];
      let metadatas: any[] = [];
      let distances: number[] = [];
      
      // 점진적 완화 전략: 필터를 단계별로 완화하여 후보군 확보
      const filterStrategies = [
        normalizedFilter, // 1) 전체 필터 (가장 엄격)
        this.createRelaxedFilter(normalizedFilter, ['keyword_primary', 'subject', 'grade']), // 2) 핵심 조건만
        this.createRelaxedFilter(normalizedFilter, ['subject', 'grade']), // 3) 기본 조건만
        this.createRelaxedFilter(normalizedFilter, ['subject']), // 4) 과목만
        undefined // 5) 필터 없음 (전체 검색)
      ];
      
      for (let i = 0; i < filterStrategies.length; i++) {
        const currentFilter = filterStrategies[i];
        const strategyName = ['전체필터', '핵심조건', '기본조건', '과목만', '전체검색'][i];
        
        console.log(`[v1 하이브리드] 검색 전략 ${i+1}/5: ${strategyName}`, currentFilter ? JSON.stringify(currentFilter) : 'null');
        
        try {
          vectorResults = await (collection.query as any)({
            queryEmbeddings: embeddings,
            nResults: candidateSize,
            where: currentFilter,
            include: ['documents', 'metadatas', 'distances']
          });
          
          documents = vectorResults.documents?.[0] || [];
          metadatas = vectorResults.metadatas?.[0] || [];
          distances = vectorResults.distances?.[0] || [];
          
          console.log(`[v1 하이브리드] 전략 ${i+1} 결과: ${documents.length}개 후보군`);
          
          // 충분한 후보군이 확보되면 중단
          if (documents.length >= Math.min(candidateSize, 10)) {
            console.log(`[v1 하이브리드] ✅ 충분한 후보군 확보됨 (${documents.length}개)`);
            break;
          }
        } catch (error) {
          console.log(`[v1 하이브리드] 전략 ${i+1} 실패:`, error);
          continue;
        }
      }
      
      console.log(`[v1 하이브리드] 1단계 완료: ${documents.length}개 후보군 확보`);
      
      if (documents.length === 0) {
        console.log(`[v1 하이브리드] 모든 전략 실패, 폴백 검색`);
        return await this.fallbackDocumentRetrieval(collectionName, numResults);
      }
      
      // 2단계: 키워드 플래그로 정밀 필터링 (v1 호환 확실 적용)
      let filteredResults: { document: string, metadata: any, distance: number, index: number }[] = [];
      
      // 검색 키워드 추출 및 정규화 (메타데이터 저장 시와 동일한 로직)
      const searchKeywords = filter?.keyword_primary?.$in ? 
        filter.keyword_primary.$in.map((k: string) => {
          // 메타데이터 저장 시와 동일한 정규화 적용
          const normalized = String(k).trim().toLowerCase();
          return normalized.replace(/[^\w가-힣]/g, ''); // 특수문자 제거
        }).filter(k => k.length > 0) : [];
      
      console.log(`[v1 하이브리드] 2단계: 키워드 플래그 정밀 필터링`);
      console.log(`[v1 하이브리드] 정규화된 검색 키워드: [${searchKeywords.join(', ')}]`);
      console.log(`[v1 하이브리드] 필터링 모드: ${keywordMode}`);
      
      if (searchKeywords.length > 0 && keywordMode === 'AND') {
        // AND 모드: 모든 키워드 플래그가 true인 문서만 선택
        let andFilteredCount = 0;
        
        for (let i = 0; i < documents.length; i++) {
          const metadata = metadatas[i];
          if (!metadata) continue;
          
          // 모든 검색 키워드에 대해 kw_<키워드> 플래그가 true인지 확인
          const hasAllKeywords = searchKeywords.every(keyword => {
            const flagKey = `kw_${keyword}`;
            return metadata[flagKey] === true;
          });
          
          if (hasAllKeywords) {
            filteredResults.push({
              document: documents[i],
              metadata,
              distance: distances[i] || 0,
              index: i
            });
            andFilteredCount++;
          }
        }
        
        console.log(`[v1 하이브리드] AND 필터 결과: ${andFilteredCount}개 (전체 후보군: ${documents.length}개)`);
        
        // AND 필터 결과가 너무 적으면 OR 모드로 폴백
        if (filteredResults.length === 0) {
          console.log(`[v1 하이브리드] AND 필터 결과 0개 → OR 모드로 폴백`);
          filteredResults = documents.map((doc, i) => ({
            document: doc,
            metadata: metadatas[i],
            distance: distances[i] || 0,
            index: i
          }));
        }
        
      } else if (searchKeywords.length > 0 && keywordMode === 'OR') {
        // OR 모드: 하나라도 키워드 플래그가 true인 문서 우선, 없으면 전체 후보군 사용
        const orMatched: typeof filteredResults = [];
        const orNotMatched: typeof filteredResults = [];
        
        for (let i = 0; i < documents.length; i++) {
          const metadata = metadatas[i];
          if (!metadata) continue;
          
          // 하나라도 검색 키워드에 대해 kw_<키워드> 플래그가 true인지 확인
          const hasAnyKeyword = searchKeywords.some(keyword => 
            metadata[`kw_${keyword}`] === true
          );
          
          const resultItem = {
            document: documents[i],
            metadata,
            distance: distances[i] || 0,
            index: i
          };
          
          if (hasAnyKeyword) {
            orMatched.push(resultItem);
          } else {
            orNotMatched.push(resultItem);
          }
        }
        
        // 키워드 매칭된 문서를 먼저, 그 다음 나머지 (OR 우선순위)
        filteredResults = [...orMatched, ...orNotMatched];
        
        console.log(`[v1 하이브리드] OR 필터 결과: ${orMatched.length}개 매칭, ${orNotMatched.length}개 비매칭`);
        
      } else {
        // 키워드가 없거나 기타 모드: 모든 후보군 사용
        filteredResults = documents.map((doc, i) => ({
          document: doc,
          metadata: metadatas[i],
          distance: distances[i] || 0,
          index: i
        }));
        
        console.log(`[v1 하이브리드] 기본 모드: ${filteredResults.length}개 후보군 전체 사용`);
      }
      
      // 3단계: 하이브리드 스코어링
      console.log(`[v1 하이브리드] 3단계: 하이브리드 스코어링`);
      
      const queryTerms = query.toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 1)
        .map(term => term.replace(/[^\w가-힣]/g, ''));
      
      const hybridResults: { document: string, metadata: any, score: number }[] = [];
      
      for (const result of filteredResults) {
        // 벡터 스코어
        const vectorScore = Math.max(0, 1 - result.distance);
        
        // 키워드 스코어
        let keywordScore = 0;
        const docLower = result.document.toLowerCase();
        const docTerms = docLower.split(/\s+/).filter(term => term.length > 1);
        const docLength = docTerms.length;
        
        for (const queryTerm of queryTerms) {
          const exactMatches = (docLower.match(new RegExp(queryTerm, 'g')) || []).length;
          if (exactMatches > 0) {
            const tf = exactMatches / docLength;
            const normalizedTf = tf / (tf + 0.5 + 1.5 * (docLength / 100));
            keywordScore += normalizedTf * 2.0;
          }
        }
        
        // 하이브리드 점수
        const hybridScore = alpha * keywordScore + (1 - alpha) * vectorScore;
        
        hybridResults.push({
          document: result.document,
          metadata: result.metadata,
          score: hybridScore
        });
      }
      
      // 4단계: 최종 정렬 및 반환
      const finalResults = hybridResults
        .sort((a, b) => b.score - a.score)
        .slice(0, numResults);
      
      console.log(`[v1 하이브리드] 완료: ${finalResults.length}개 최종 결과`);
      
      return {
        documents: finalResults.map(r => r.document),
        metadatas: finalResults.map(r => r.metadata)
      };
      
    } catch (error) {
      console.error(`[v1 하이브리드 검색] 오류:`, error);
      return await this.fallbackDocumentRetrieval(collectionName, numResults);
    }
  }

  /**
   * 폴백 문서 검색 (검색 실패 시)
   */
  private async fallbackDocumentRetrieval(
    collectionName: string, 
    numResults: number
  ): Promise<{ documents: (string | null)[], metadatas: (any | null)[] }> {
    try {
      console.log(`[폴백 검색] 컬렉션에서 무작위로 문서 가져오기 시도...`);
      
      const collection = await this.getOrCreateCollection(collectionName);
      const allResults = await (collection.get as any)({
        limit: numResults,
        include: ['documents', 'metadatas']
      });
      
      if (allResults.documents && allResults.documents.length > 0) {
        console.log(`[폴백 검색] 무작위로 ${allResults.documents.length}개 문서 반환`);
        return {
          documents: allResults.documents,
          metadatas: allResults.metadatas || []
        };
      }
    } catch (fallbackError) {
      console.error(`[폴백 검색] 실패:`, fallbackError);
    }
    
    return { documents: [], metadatas: [] };
  }

  /**
   * 그리드 서치로 최적 α 값 찾기 (실험적 기능)
   */
  public async optimizeAlpha(
    collectionName: string,
    testQueries: string[],
    groundTruth: string[][],
    alphaRange: number[] = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  ): Promise<{ optimalAlpha: number, bestScore: number }> {
    console.log(`[α 최적화] 그리드 서치 시작: ${alphaRange.length}개 값 테스트`);
    
    let bestAlpha = 0.6;
    let bestScore = 0;
    
    for (const alpha of alphaRange) {
      let totalScore = 0;
      
      for (let i = 0; i < testQueries.length; i++) {
        const result = await this.hybridSearch(collectionName, [testQueries[i]], undefined, 10, alpha);
        
        // 간단한 정확도 계산 (실제로는 더 정교한 평가 지표 필요)
        const retrievedDocs = result.documents.filter(doc => doc !== null);
        const relevantDocs = groundTruth[i] || [];
        
        const intersection = retrievedDocs.filter(doc => 
          relevantDocs.some(truth => doc && doc.includes(truth))
        );
        
        const precision = retrievedDocs.length > 0 ? intersection.length / retrievedDocs.length : 0;
        const recall = relevantDocs.length > 0 ? intersection.length / relevantDocs.length : 0;
        const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
        
        totalScore += f1;
      }
      
      const avgScore = testQueries.length > 0 ? totalScore / testQueries.length : 0;
      console.log(`[α 최적화] α=${alpha}, 평균 F1 점수=${avgScore.toFixed(3)}`);
      
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestAlpha = alpha;
      }
    }
    
    console.log(`[α 최적화] 최적 α=${bestAlpha}, 최고 점수=${bestScore.toFixed(3)}`);
    return { optimalAlpha: bestAlpha, bestScore };
  }

  public async listCollections(): Promise<Collection[]> {
    if (!await this.checkConnection()) {
      console.warn('⚠️ ChromaDB 연결 없음 - 빈 컬렉션 목록 반환');
      return [];
    }
    try {
      const collectionNames = await this.client.listCollections();
      
      const collections = await Promise.all(
        (collectionNames as any[]).map(nameOrCollection => {
          const name = typeof nameOrCollection === 'string' ? nameOrCollection : nameOrCollection.name;
          return this.client.getCollection({ 
            name,
            embeddingFunction: this.embeddingFunction
          }).catch(err => {
            console.error(`❌ 컬렉션 '${name}'을 가져오는 중 오류 발생:`, err);
            return null;
          });
        })
      );
      
      const validCollections = collections.filter((c): c is Collection => c !== null);
      console.log(`✅ [컬렉션 목록] ${validCollections.length}개 컬렉션을 찾았습니다.`);
      return validCollections;
    } catch (error) {
      console.warn('⚠️ [컬렉션 목록] ChromaDB 연결 실패 - 메모리 모드로 전환:', error);
      return [];
    }
  }

  public async clearAllCollections(): Promise<number> {
    if (!await this.checkConnection()) {
      return 0;
    }
    
    try {
      console.log('[문서 초기화] 모든 컬렉션 삭제 시작...');
      
      const collectionNames = await this.client.listCollections();
      let deletedCount = 0;
      
      for (const nameOrCollection of (collectionNames as any[])) {
        try {
          const name = typeof nameOrCollection === 'string' ? nameOrCollection : nameOrCollection.name;
          await this.client.deleteCollection({ name });
          deletedCount++;
          console.log(`[문서 초기화] 컬렉션 "${name}" 삭제 완료`);
        } catch (deleteError) {
          console.error(`[문서 초기화] 컬렉션 삭제 실패:`, deleteError);
        }
      }
      
      console.log(`[문서 초기화] 총 ${deletedCount}개 컬렉션이 삭제되었습니다.`);
      return deletedCount;
    } catch (error) {
      console.error('[문서 초기화] 컬렉션 삭제 중 오류:', error);
      return 0;
    }
  }

  public async getDocumentsFromCollections(): Promise<Document[]> {
    if (!await this.checkConnection()) {
      return [];
    }
    try {
      const collections = await this.listCollections();
      const documents: Document[] = [];
      
      for (const collection of collections) {
        if (collection.name.startsWith('collection_')) {
          try {
            // 컬렉션에서 모든 청크를 가져오되, 문서별로 그룹화
            const results = await collection.get({});
            
            if (results.documents && results.metadatas) {
              // 문서 ID별로 그룹화 (같은 PDF의 청크들을 하나로 묶음)
              const docGroups = new Map<string, {
                fileName: string;
                docId: string;
                createdAt: string;
                chunkCount: number;
                firstChunk: string;
                collectionName: string;
              }>();
              
              for (let i = 0; i < results.documents.length; i++) {
                const metadata = results.metadatas[i] as any;
                const documentId = metadata?.docId || metadata?.job_id;
                const fileName = metadata?.fileName;
                
                if (documentId && fileName) {
                  if (!docGroups.has(documentId)) {
                    docGroups.set(documentId, {
                      fileName: fileName, // 원본 파일명 유지
                      docId: documentId,
                      createdAt: metadata?.createdAt || new Date().toISOString(),
                      chunkCount: 0,
                      firstChunk: results.documents[i] || '',
                      collectionName: collection.name
                    });
                  }
                  
                  const group = docGroups.get(documentId)!;
                  group.chunkCount++;
                }
              }
              
              // 그룹화된 문서들을 Document로 변환
              for (const [docId, group] of docGroups) {
                documents.push(new Document({
                  pageContent: group.firstChunk.substring(0, 200) + '...', // 미리보기용
                  metadata: {
                    id: docId,
                    title: group.fileName, // 원본 파일명 그대로 표시
                    fileName: group.fileName,
                    lastModified: group.createdAt,
                    collectionName: group.collectionName,
                    chunkCount: group.chunkCount,
                    docId: docId
                  }
                }));
              }
            }
          } catch (collError) {
            console.error(`컬렉션 "${collection.name}" 처리 중 오류:`, collError);
          }
        }
      }
      
      console.log(`[문서 목록] ${documents.length}개 문서를 찾았습니다.`);
      return documents;
    } catch (error) {
      console.error('[문서 목록] 오류 발생:', error);
      return [];
    }
  }

  /**
   * 레거시 키워드 검색 (하위 호환성을 위해 유지)
   */
  private async keywordSearch(
    collection: Collection, 
    query: string, 
    filter?: Record<string, any>, 
    limit: number = 15
  ): Promise<{ document: string, metadata: any, score: number, id: string }[]> {
    console.log(`[레거시 키워드 검색] 하이브리드 검색으로 리다이렉트: α=1.0`);
    const result = await this.hybridSearch(collection.name, [query], filter, limit, 1.0); // α=1.0으로 키워드만
    return result.documents.map((doc, i) => ({
      document: doc || '',
      metadata: result.metadatas[i],
      score: 1.0, // 단순화된 점수
      id: `keyword_${i}`
    }));
  }

  /**
   * 레거시 벡터 검색 (하위 호환성을 위해 유지)
   */
  private async vectorSearch(
    collection: Collection, 
    query: string, 
    filter?: Record<string, any>, 
    limit: number = 15
  ): Promise<{ document: string, metadata: any, score: number, id: string }[]> {
    console.log(`[레거시 벡터 검색] 하이브리드 검색으로 리다이렉트: α=0.0`);
    const result = await this.hybridSearch(collection.name, [query], filter, limit, 0.0); // α=0.0으로 벡터만
    return result.documents.map((doc, i) => ({
      document: doc || '',
      metadata: result.metadatas[i],
      score: 1.0, // 단순화된 점수
      id: `vector_${i}`
    }));
  }

  /**
   * MMR(Maximal Marginal Relevance) 기반 다양성 검색
   * 관련성과 다양성을 모두 고려하여 문서를 선택
   */
  public async diversitySearch(
    collectionName: string,
    query: string,
    numResults: number = 10,
    lambda: number = 0.7, // 관련성 vs 다양성 비율 (0.5-0.8 권장)
    excludeIds: string[] = [], // 이미 사용된 문서 ID 제외
    filter?: Record<string, any>
  ): Promise<Document[]> {
    if (!await this.checkConnection()) return [];
    
    console.log(`[다양성 검색] 시작: λ=${lambda}, 제외=${excludeIds.length}개`);
    
    try {
      const collection = await this.getOrCreateCollection(collectionName);
      
      // 1단계: 관련성 기반으로 충분한 후보군 확보 (요청 수량의 3-5배)
      const candidateSize = Math.max(numResults * 4, 50);
      let normalizedFilter = this.normalizeMetadataFilter(filter);
      
      // 제외할 문서 ID들을 필터에 추가
      if (excludeIds.length > 0) {
        if (!normalizedFilter) {
          normalizedFilter = {};
        }
        // ChromaDB의 $nin 연산자로 제외 처리
        normalizedFilter['$and'] = [
          ...(normalizedFilter['$and'] || []),
          { 'id': { '$nin': excludeIds } }
        ];
      }
      
      const candidateResults = await (collection.query as any)({
        queryTexts: [query],
        nResults: candidateSize,
        where: normalizedFilter,
        include: ['documents', 'metadatas', 'distances']
      });
      
      if (!candidateResults.documents?.[0] || candidateResults.documents[0].length === 0) {
        console.log(`[다양성 검색] 후보군 없음`);
        return [];
      }
      
      const candidates = candidateResults.documents[0];
      const metadatas = candidateResults.metadatas?.[0] || [];
      const distances = candidateResults.distances?.[0] || [];
      
      console.log(`[다양성 검색] 후보군 확보: ${candidates.length}개`);
      
      // 2단계: MMR 알고리즘으로 다양성 선택
      const selectedDocs: Document[] = [];
      const selectedIndices: number[] = [];
      
      // 첫 번째 문서는 가장 관련성 높은 것 선택
      if (candidates.length > 0) {
        selectedDocs.push(new Document({
          pageContent: candidates[0],
          metadata: { ...metadatas[0], id: metadatas[0]?.id }
        }));
        selectedIndices.push(0);
      }
      
      // 나머지 문서들을 MMR로 선택
      while (selectedDocs.length < numResults && selectedIndices.length < candidates.length) {
        let bestScore = -1;
        let bestIndex = -1;
        
        for (let i = 0; i < candidates.length; i++) {
          if (selectedIndices.includes(i)) continue;
          
          const candidate = candidates[i];
          if (!candidate) continue;
          
          // 관련성 점수 (거리를 유사도로 변환)
          const relevanceScore = Math.max(0, 1 - (distances[i] || 0));
          
          // 기존 선택된 문서들과의 최대 유사도 계산
          let maxSimilarity = 0;
          for (const selectedDoc of selectedDocs) {
            const similarity = this.calculateTextSimilarity(candidate, selectedDoc.pageContent);
            maxSimilarity = Math.max(maxSimilarity, similarity);
          }
          
          // MMR 점수: λ * 관련성 - (1-λ) * 최대유사도
          const mmrScore = lambda * relevanceScore - (1 - lambda) * maxSimilarity;
          
          if (mmrScore > bestScore) {
            bestScore = mmrScore;
            bestIndex = i;
          }
        }
        
        if (bestIndex !== -1) {
          selectedDocs.push(new Document({
            pageContent: candidates[bestIndex],
            metadata: { ...metadatas[bestIndex], id: metadatas[bestIndex]?.id }
          }));
          selectedIndices.push(bestIndex);
        } else {
          break; // 더 이상 선택할 문서가 없음
        }
      }
      
      console.log(`[다양성 검색] 완료: ${selectedDocs.length}개 선택`);
      return selectedDocs;
      
    } catch (error) {
      console.error('[다양성 검색] 오류:', error);
      return [];
    }
  }

  /**
   * 텍스트 간 유사도 계산 (간단한 코사인 유사도 근사)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    // 텍스트를 단어 벡터로 변환
    const words1 = this.tokenizeText(text1);
    const words2 = this.tokenizeText(text2);
    
    // 공통 단어 집합
    const allWords = new Set([...words1, ...words2]);
    
    if (allWords.size === 0) return 0;
    
    // 벡터 생성
    const vector1: number[] = [];
    const vector2: number[] = [];
    
    allWords.forEach(word => {
      vector1.push(words1.filter(w => w === word).length);
      vector2.push(words2.filter(w => w === word).length);
    });
    
    // 코사인 유사도 계산
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * 텍스트 토큰화 (한글 포함)
   */
  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w가-힣\s]/g, ' ') // 한글과 영문만 유지
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  /**
   * 카테고리별 다양성 검색 (주제별로 균등하게 분배)
   */
  public async categoryDiversitySearch(
    collectionName: string,
    queries: Array<{ query: string, category: string, weight?: number }>,
    numResults: number = 10,
    excludeIds: string[] = [],
    filter?: Record<string, any>
  ): Promise<Document[]> {
    if (!await this.checkConnection()) return [];
    
    console.log(`[카테고리 다양성 검색] 시작: ${queries.length}개 카테고리`);
    
    try {
      const results: Document[] = [];
      const usedIds = new Set(excludeIds);
      
      // 각 카테고리별로 할당할 문서 수 계산
      const totalWeight = queries.reduce((sum, q) => sum + (q.weight || 1), 0);
      
      for (const queryInfo of queries) {
        const categoryWeight = queryInfo.weight || 1;
        const categoryQuota = Math.ceil((numResults * categoryWeight) / totalWeight);
        
        console.log(`[카테고리 검색] ${queryInfo.category}: ${categoryQuota}개 할당`);
        
        // 해당 카테고리에서 다양성 검색
        const categoryResults = await this.diversitySearch(
          collectionName,
          queryInfo.query,
          categoryQuota,
          0.6, // 카테고리 내에서는 다양성 우선
          Array.from(usedIds),
          filter
        );
        
        // 선택된 문서들을 결과에 추가하고 사용된 ID 추가
        for (const doc of categoryResults) {
          if (results.length >= numResults) break;
          results.push(doc);
          if (doc.metadata.id) {
            usedIds.add(doc.metadata.id);
          }
        }
      }
      
      console.log(`[카테고리 다양성 검색] 완료: ${results.length}개`);
      return results.slice(0, numResults);
      
    } catch (error) {
      console.error('[카테고리 다양성 검색] 오류:', error);
      return [];
    }
  }
}

export const vectorStoreManager = new VectorStoreManager(); 