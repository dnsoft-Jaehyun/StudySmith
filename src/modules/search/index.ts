import { vectorStoreManager } from '../vectorStoreManager';
import { Document } from '@langchain/core/documents';

class EnhancedSearchManager {
  public async search(options: {
    query: string;
    subject: string;
    grade: string;
    pdfId: string | null;
    limit: number;
  }): Promise<Document[]> {
    console.log('[Enhanced Search] 검색 시작:', options);

    const { query, subject, grade, pdfId, limit } = options;
    const collectionName = pdfId ? `pdf_collection_${pdfId}` : 'document_collection';

    try {
      const collection = await vectorStoreManager.getOrCreateCollection(collectionName);
      if (!collection) {
        console.warn(`[Enhanced Search] 컬렉션을 찾을 수 없습니다: ${collectionName}`);
        return [];
      }

      const where: Record<string, any> = {
        subject: subject,
        grade: grade,
      };

      if (pdfId) {
        where.pdf_id = pdfId;
      }
      
      console.log(`[Enhanced Search] 검색 조건: query='${query}', limit=${limit}, where=${JSON.stringify(where)}`);

      const results = await vectorStoreManager.search(
        collection,
        query,
        limit,
        where
      );
      
      console.log(`[Enhanced Search] 검색 결과: ${results.length}개 문서`);
      return results;
    } catch (error) {
      console.error('[Enhanced Search] 검색 중 오류 발생:', error);
      return [];
    }
  }
}

export const enhancedSearchManager = new EnhancedSearchManager(); 