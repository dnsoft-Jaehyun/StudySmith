import { DocumentMetadata, DocumentResult } from '../types/index';
import PDFParser from './pdfParser';
import { vectorStoreManager } from './vectorStoreManager';
import metadataManager from './metadataManager';
import metadataExtractor from './metadataExtractor';
import { Document } from '@langchain/core/documents';
import { get_encoding } from '@dqbd/tiktoken';

class DocumentProcessor {
  private pdfParser: PDFParser;
  private documents: { [key: string]: Document } = {};

  constructor() {
    this.pdfParser = new PDFParser();
  }

  public getAllDocuments(): Document[] {
    return Object.values(this.documents);
  }

  public deleteDocument(id: string): { success: boolean; fileHash?: string } {
    const docsToDelete = Object.keys(this.documents).filter(docId => 
      this.documents[docId].metadata.docId === id || docId === id
    );
    
    if (docsToDelete.length === 0) {
      return { success: false };
    }
    
    let fileHash: string | undefined;
    
    docsToDelete.forEach(docId => {
      if (this.documents[docId].metadata.fileHash) {
        fileHash = this.documents[docId].metadata.fileHash;
      }
      delete this.documents[docId];
    });
    
    console.log(`[DocumentProcessor] 메모리에서 ${docsToDelete.length}개 문서 삭제됨 (ID: ${id})`);
    return { success: true, fileHash };
  }

  public clearAllDocuments(): number {
    const count = Object.keys(this.documents).length;
    this.documents = {};
    console.log(`[메모리 초기화] ${count}개 문서가 메모리에서 삭제되었습니다.`);
    return count;
  }

  public getDocument(id: string): Document | null {
    return this.documents[id] || null;
  }

  public async processFile(filePath: string, originalName: string, mimeType: string): Promise<Document> {
    const fileBuffer = require('fs').readFileSync(filePath);
    const { text } = await this.pdfParser.parse(fileBuffer);
    
    const docId = `doc_${new Date().getTime()}`;
    const doc = new Document({
        pageContent: text,
        metadata: {
            id: docId,
            title: originalName,
            mimeType: mimeType,
            lastModified: new Date().toISOString(),
        }
    });

    this.documents[docId] = doc;
    console.log(`문서가 처리되어 메모리에 저장되었습니다. ID: ${docId}`);
    return doc;
  }

  public async processDocument(
    filePath: string,
    initialMetadata: Partial<DocumentMetadata>,
    job?: any
  ): Promise<DocumentResult> {
    const startTime = Date.now();
    console.log(`문서 처리 시작: ${filePath} (파일명: ${initialMetadata.fileName})`);

    const fileBuffer = require('fs').readFileSync(filePath);
    const parsingResult = await this.pdfParser.parse(fileBuffer, job);

    const docId = initialMetadata.docId || 'unknown';
    const collectionName = `collection_${docId}`;

    // 🔍 메타데이터 추출 로직 추가
    const fileName = initialMetadata.fileName || initialMetadata.displayName || '';
    console.log(`[메타데이터 추출] 파일명에서 추출 시작: ${fileName}`);
    
    // 1. 파일명에서 메타데이터 추출
    const filenameMetadata = metadataExtractor.extractFromFilename(fileName);
    console.log(`[메타데이터 추출] 파일명 추출 결과:`, filenameMetadata);
    
    // 2. 텍스트 내용에서 메타데이터 추출 (첫 번째 청크 사용)
    let textMetadata = {};
    if (parsingResult.chunks && parsingResult.chunks.length > 0) {
      const firstChunkText = parsingResult.chunks[0].content || '';
      console.log(`[메타데이터 추출] 텍스트에서 추출 시작 (${firstChunkText.length}자)`);
      textMetadata = metadataExtractor.extractFromText(firstChunkText);
      console.log(`[메타데이터 추출] 텍스트 추출 결과:`, textMetadata);
    }
    
    // 3. 메타데이터 병합 (파일명 우선, 텍스트 보완)
    const extractedMetadata = metadataExtractor.mergeMetadata(textMetadata, filenameMetadata);
    console.log(`[메타데이터 추출] 최종 병합 결과:`, extractedMetadata);

    // 메타데이터에 원본 파일명과 문서 ID, 추출된 메타데이터 추가
    const enhancedMetadata = {
      ...initialMetadata,
      ...extractedMetadata, // 추출된 subject, grade 등 추가
      docId: docId,
      fileName: initialMetadata.fileName || initialMetadata.displayName,
      displayName: initialMetadata.displayName || initialMetadata.fileName,
      originalName: initialMetadata.originalName || initialMetadata.fileName,
      title: initialMetadata.displayName || initialMetadata.fileName || initialMetadata.title,
      collectionName: collectionName
    };

    console.log(`[메타데이터 추출] 최종 enhancedMetadata:`, {
      subject: enhancedMetadata.subject,
      grade: enhancedMetadata.grade,
      chapter: enhancedMetadata.chapter,
      lesson: enhancedMetadata.lesson,
      keywords: enhancedMetadata.keywords
    });

    const chunksWithMetadata = this.createChunks(parsingResult.chunks, enhancedMetadata);

    const documents = chunksWithMetadata.map(chunk => new Document({
      pageContent: chunk.content,
      metadata: {
        ...chunk.metadata,
        ...extractedMetadata, // 추출된 메타데이터 다시 추가
        docId: docId, // 모든 청크에 동일한 문서 ID 부여
        fileName: enhancedMetadata.fileName,
        displayName: enhancedMetadata.displayName,
        originalName: enhancedMetadata.originalName,
        title: enhancedMetadata.title,
        // 필수 메타데이터 필드 명시적 추가
        subject: enhancedMetadata.subject,
        grade: enhancedMetadata.grade,
        chapter: enhancedMetadata.chapter,
        lesson: enhancedMetadata.lesson,
        keywords: enhancedMetadata.keywords
      },
    }));

    try {
      console.log(`[문서처리] 컬렉션 생성/가져오기 시작: ${collectionName}`);
      const collection = await vectorStoreManager.getOrCreateCollection(collectionName);
      
      if (collection) {
        console.log(`[문서처리] ChromaDB 모드 - 컬렉션 생성/가져오기 완료: ${collectionName}`);
        console.log(`[문서처리] 문서 추가 시작: ${documents.length}개 문서`);
        await vectorStoreManager.addDocuments(collection, documents);
        console.log(`[문서처리] ChromaDB에 문서 추가 완료: ${documents.length}개 문서`);
      } else {
        console.warn(`[문서처리] 메모리 모드 - ChromaDB 연결 없음, 메모리에만 저장`);
        // 메모리에 문서 저장 (검색 가능하도록)
        documents.forEach((doc, index) => {
          const memoryDocId = `${docId}_chunk_${index}`;
          this.documents[memoryDocId] = doc;
        });
        console.log(`[문서처리] 메모리에 ${documents.length}개 문서 저장 완료`);
      }

      console.log(`✅ 파일 처리 완료: ${initialMetadata.fileName} - ${parsingResult.numChunks}개 청크 생성, ${((Date.now() - startTime) / 1000).toFixed(2)}초 소요`);

    } catch (e: any) {
      console.error(`❌ [문서처리] 문서 처리 중 오류 (${initialMetadata.fileName}):`, e.message);
      console.error(`[문서처리] 에러 스택:`, e.stack);
      throw e; // 오류를 상위로 전파
    }

    const finalResult: DocumentResult = {
      id: docId,
      job_id: docId,
      content: `문서 처리 완료 (${parsingResult.numChunks}개 청크 생성됨)`,
      metadata: enhancedMetadata
    };

    return finalResult;
  }

  private createChunks(chunks: any[], metadata: Partial<DocumentMetadata>): any[] {
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        ...metadata,
        collectionName: `collection_${metadata.job_id || 'default'}`,
      },
    }));
  }
}

export const documentProcessor = new DocumentProcessor();