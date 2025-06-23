import { Router } from 'express';
import { documentProcessor } from '../modules/documentProcessor';
import { jobQueue } from '../modules/jobQueue';
import { vectorStoreManager } from '../modules/vectorStoreManager';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';

const router = Router();
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB 제한으로 증가
  }
});

// 업로드된 파일의 해시를 저장하여 중복 업로드 방지
const uploadedFileHashes = new Set<string>();

// 파일 해시 생성 함수
function generateFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// 새로고침 시 모든 업로드된 문서 삭제 API (완전 비활성화)
router.post('/clear-uploads', async (req, res) => {
  // 즉시 응답하여 추가 처리 방지
  res.status(200).json({ 
    success: true, 
    message: "clear-uploads API가 비활성화되었습니다. 문서가 안전하게 보존됩니다.",
    data: { 
      clearedHashCount: 0,
      deletedCollections: 0,
      disabled: true
    }
  });
  
  // 로깅 (응답 후)
  console.log(`🚨 [CLEAR-UPLOADS] API 호출됨 - 완전 비활성화 상태 (문서 보존)`);
});

// 기존 API 경로들을 router에 등록합니다.
router.get('/documents', async (req, res) => {
  try {
    // 벡터 스토어에서 문서 목록을 가져오기 시도
    let vectorDocuments: any[] = [];
    
    try {
      vectorDocuments = await vectorStoreManager.getDocumentsFromCollections();
    } catch (vectorError) {
      console.warn('⚠️ [API] 벡터 스토어에서 문서 가져오기 실패 - 메모리 모드로 전환:', vectorError);
    }
    
    // 메모리 문서 가져오기
    const memoryDocuments = documentProcessor.getAllDocuments();
    
    let allDocuments: any[] = [];
    
    if (vectorDocuments.length > 0) {
      // ChromaDB 모드: 벡터 스토어 문서 반환
      allDocuments = vectorDocuments;
      console.log(`✅ [API] ChromaDB 모드 - 벡터스토어: ${vectorDocuments.length}개 문서 반환`);
    } else if (memoryDocuments.length > 0) {
      // 메모리 모드: 메모리 문서를 그룹화해서 반환
      const docGroups = new Map<string, {
        fileName: string;
        docId: string;
        createdAt: string;
        chunkCount: number;
        firstChunk: string;
      }>();
      
      memoryDocuments.forEach(doc => {
        const docId = doc.metadata.docId || doc.metadata.id;
        const fileName = doc.metadata.displayName || 
                        doc.metadata.fileName || 
                        doc.metadata.title || 
                        doc.metadata.originalName || 
                        '알 수 없는 파일';
        
        if (docId && !docGroups.has(docId)) {
          docGroups.set(docId, {
            fileName: fileName,
            docId: docId,
            createdAt: doc.metadata.createdAt || doc.metadata.lastModified || new Date().toISOString(),
            chunkCount: 1,
            firstChunk: doc.pageContent
          });
        } else if (docId && docGroups.has(docId)) {
          docGroups.get(docId)!.chunkCount++;
        }
      });
      
      allDocuments = Array.from(docGroups.values()).map(group => ({
        pageContent: group.firstChunk.substring(0, 200) + '...',
        metadata: {
          id: group.docId,
          title: group.fileName,
          fileName: group.fileName,
          lastModified: group.createdAt,
          chunkCount: group.chunkCount,
          docId: group.docId,
          source: 'memory'
        }
      }));
      
      console.log(`⚠️ [API] 메모리 모드 - 메모리: ${memoryDocuments.length}개 청크, ${allDocuments.length}개 문서 반환`);
    } else {
      console.log(`ℹ️ [API] 문서 없음 - 빈 목록 반환`);
    }
    
    console.log(`[API] /documents 요청 - 메모리: ${memoryDocuments.length}개, 벡터스토어: ${vectorDocuments.length}개, 총: ${allDocuments.length}개 문서 반환`);
    res.json({ success: true, data: allDocuments });
  } catch (error: any) {
    console.error('❌ [API] /documents 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 다중 파일 업로드 지원 - 기존 단일 파일 업로드를 다중 파일로 변경
router.post('/upload', (req, res, next) => {
  console.log(`[업로드] 요청 받음: Content-Type=${req.headers['content-type']}`);
  console.log(`[업로드] 요청 헤더:`, req.headers);
  
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      console.error(`[업로드] Multer 오류:`, err);
      if (err.code === 'UNEXPECTED_FIELD') {
        return res.status(400).json({
          success: false,
          error: `잘못된 필드명입니다. 기대: 'files', 받음: '${err.field}'`
        });
      }
      return res.status(400).json({
        success: false,
        error: `파일 업로드 오류: ${err.message}`
      });
    }
    next();
  });
}, async (req, res) => {
  console.log(`[업로드] Multer 처리 완료. 파일 수: ${req.files ? req.files.length : 0}`);
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      error: '파일이 업로드되지 않았습니다.'
    });
  }
  
  try {
    const uploadResults = [];
    const files = req.files as Express.Multer.File[];

    for (const file of files) {
      const {
        path: filePath,
        originalname: rawOriginalName,
        size: fileSize
      } = file;
      
      // 한글 파일명 인코딩 처리
      let originalName: string;
      try {
        // multer는 파일명을 latin1로 인코딩하므로 UTF-8로 변환
        originalName = Buffer.from(rawOriginalName, 'latin1').toString('utf8');
      } catch (encodingError) {
        console.warn(`[업로드] 파일명 인코딩 처리 실패 (${rawOriginalName}), 원본 사용:`, encodingError);
        originalName = rawOriginalName;
      }
      
      console.log(`[업로드] 파일명 처리: ${rawOriginalName} -> ${originalName}`);
      
      // 1. 파일 해시 생성으로 중복 체크
      const fileHash = generateFileHash(filePath);
      
      if (uploadedFileHashes.has(fileHash)) {
        // 중복 파일 처리 - 임시 파일 삭제 후 스킵
        fs.unlinkSync(filePath);
        uploadResults.push({
          id: null,
          originalName: originalName,
          fileSize,
          status: 'error',
          error: '이미 업로드된 동일한 파일입니다.'
        });
        continue;
      }
      
      // 2. 새 파일이므로 해시를 저장하고 처리 진행
      uploadedFileHashes.add(fileHash);
      
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const metadata = {
        fileName: originalName,
        displayName: originalName,
        originalName: originalName,
        title: originalName,
        fileSize,
        fileHash: fileHash,
        docId: docId,
        job_id: docId,
        createdAt: new Date().toISOString()
      };

      // 각 파일을 개별적으로 처리
      try {
        console.log(`[업로드] 파일 처리 시작: ${originalName} (크기: ${fileSize}bytes, 해시: ${fileHash.substring(0, 8)}...)`);
        await documentProcessor.processDocument(filePath, metadata);
        console.log(`[업로드] 파일 처리 성공: ${originalName}`);
        uploadResults.push({
          id: docId,
          originalName: originalName,
          fileSize,
          status: 'success'
        });
      } catch (fileError) {
        console.error(`[업로드] 파일 처리 오류 (${originalName}):`, fileError);
        console.error(`[업로드] 에러 스택:`, fileError instanceof Error ? fileError.stack : 'No stack trace');
        
        // 오류 발생 시 해시에서 제거 (재시도 가능하도록)
        uploadedFileHashes.delete(fileHash);
        
        uploadResults.push({
          id: docId,
          originalName: originalName,
          fileSize,
          status: 'error',
          error: fileError instanceof Error ? fileError.message : '알 수 없는 오류'
        });
      }
    }

    const successCount = uploadResults.filter(r => r.status === 'success').length;
    const errorCount = uploadResults.filter(r => r.status === 'error').length;

    res.status(202).json({
      success: true,
      message: `${successCount}개 파일 업로드 성공${errorCount > 0 ? `, ${errorCount}개 파일 실패` : ''}. 문서 처리가 완료되었습니다.`,
      data: {
        totalFiles: files.length,
        successCount,
        errorCount,
        results: uploadResults
      }
    });
  } catch (error: any) {
    console.error('파일 처리 시작 오류:', error);
    res.status(500).json({
      success: false,
      error: '파일 처리 시작 중 오류가 발생했습니다.'
    });
  }
});

router.delete('/documents/:id', async (req, res) => {
    try {
        const docId = req.params.id;
        console.log(`[API] 문서 삭제 요청 - ID: ${docId}`);
        
        // 1. 메모리에서 문서 삭제
        const memoryResult = documentProcessor.deleteDocument(docId);
        const memoryDeleted = memoryResult.success;
        let deletedFileHash = memoryResult.fileHash;
        
        // 2. 벡터 스토어에서 문서 삭제 시도
        let vectorDeleted = false;
        
        try {
            // 문서 ID로 컬렉션 찾기
            const collections = await vectorStoreManager.listCollections();
            for (const collection of collections) {
                if (collection.name.startsWith('collection_')) {
                    try {
                        const coll = await vectorStoreManager.getOrCreateCollection(collection.name);
                        // 해당 문서 ID를 가진 문서들 삭제
                        const results = await coll.get({
                            where: { docId: docId }
                        });
                        
                        if (results.ids && results.ids.length > 0) {
                            // 파일 해시 추출하여 중복 체크 목록에서 제거
                            if (results.metadatas && results.metadatas.length > 0) {
                                const metadata = results.metadatas[0];
                                if (metadata && typeof metadata.fileHash === 'string') {
                                    deletedFileHash = metadata.fileHash;
                                }
                            }
                            
                            await coll.delete({
                                ids: results.ids
                            });
                            vectorDeleted = true;
                            console.log(`[API] 벡터 스토어에서 문서 삭제 완료 - 컬렉션: ${collection.name}, 삭제된 문서 수: ${results.ids.length}`);
                        }
                    } catch (collError) {
                        console.warn(`[API] 컬렉션 ${collection.name}에서 문서 삭제 실패:`, collError);
                    }
                }
            }
        } catch (vectorError) {
            console.warn('[API] 벡터 스토어에서 문서 삭제 실패:', vectorError);
        }
        
        // 3. 파일 해시를 업로드 중복 체크 목록에서 제거
        if (deletedFileHash) {
            uploadedFileHashes.delete(deletedFileHash);
            console.log(`[API] 파일 해시 제거됨: ${deletedFileHash.substring(0, 8)}...`);
        }
        
        if (memoryDeleted || vectorDeleted) {
            console.log(`[API] 문서 삭제 완료 - ID: ${docId}, 메모리: ${memoryDeleted}, 벡터스토어: ${vectorDeleted}`);
            res.json({ success: true, message: '문서가 성공적으로 삭제되었습니다.' });
        } else {
            console.log(`[API] 문서를 찾을 수 없음 - ID: ${docId}`);
            res.status(404).json({ success: false, error: '삭제할 문서를 찾을 수 없습니다.' });
        }
    } catch (error: any) {
        console.error('[API] 문서 삭제 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/generate-questions-manual', async (req, res) => {
    try {
        // 연결 안정성을 위한 헤더 설정
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=300, max=1000');
        
        const { documentId, ...params } = req.body;
        if (!documentId) {
            return res.status(400).json({ success: false, error: '문서 ID가 필요합니다.' });
        }
        
        const job = await jobQueue.addJob('manual_qgen', { documentId, request_options: params });
        res.json({ success: true, data: { jobId: job.id } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/job/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    const state = await job.getState();
    const progress = job.progress;
    const returnvalue = job.returnvalue;
    const failedReason = job.failedReason;

    console.log(`[API] Job ${jobId} status check - state: ${state}, returnvalue:`, returnvalue);
    res.json({
      success: true,
      data: {
        id: job.id,
        state,
        progress,
        returnvalue,
        failedReason,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// **매우 중요**: 프론트엔드가 요청하는, 하지만 존재하지 않았던 `/subjects` 경로를 추가합니다.
// 지금은 임시로 document 목록을 반환하지만, 추후 실제 과목 데이터로 교체할 수 있습니다.
router.get('/subjects', async (req, res) => {
  try {
    const documents = await documentProcessor.getAllDocuments();
    // 데이터 구조를 원래대로 복원합니다.
    res.json({ success: true, data: { subjects: documents } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 메타데이터 디버깅용 엔드포인트 추가
router.get('/debug/metadata/:collectionName?', async (req, res) => {
  try {
    const collectionName = req.params.collectionName || 'collection_doc_1750226093157_qoaplos2f';
    const sampleSize = parseInt(req.query.sampleSize as string) || 10;
    
    console.log(`[디버깅] 메타데이터 확인 요청 - 컬렉션: ${collectionName}, 샘플 크기: ${sampleSize}`);
    
    const collection = await vectorStoreManager.getOrCreateCollection(collectionName);
    if (!collection) {
      return res.status(404).json({ 
        success: false, 
        error: `컬렉션 "${collectionName}"을 찾을 수 없습니다.` 
      });
    }
    
    const sampleResults = await (collection.get as any)({
      limit: sampleSize,
      include: ['metadatas', 'documents']
    });
    
    const metadatas = sampleResults.metadatas || [];
    const documents = sampleResults.documents || [];
    
    console.log(`[디버깅] 샘플 ${metadatas.length}개 문서의 메타데이터 확인 완료`);
    
    const debugInfo = {
      collectionName,
      totalSamples: metadatas.length,
      samples: metadatas.map((metadata: any, index: number) => ({
        index: index + 1,
        metadata: metadata,
        documentPreview: documents[index] ? documents[index].substring(0, 100) + '...' : null,
        hasSubject: !!metadata?.subject,
        hasGrade: !!metadata?.grade,
        subjectValue: metadata?.subject,
        gradeValue: metadata?.grade,
        keywordFields: Object.keys(metadata || {}).filter(key => 
          key.startsWith('kw_') || key === 'keyword_primary' || key === 'keywords'
        )
      })),
      filterAnalysis: {
        documentsWithSubject: metadatas.filter((m: any) => m?.subject).length,
        documentsWithGrade: metadatas.filter((m: any) => m?.grade).length,
        documentsWithBoth: metadatas.filter((m: any) => m?.subject && m?.grade).length,
        uniqueSubjects: [...new Set(metadatas.map((m: any) => m?.subject).filter(Boolean))],
        uniqueGrades: [...new Set(metadatas.map((m: any) => m?.grade).filter(Boolean))]
      }
    };
    
    res.json({ success: true, data: debugInfo });
  } catch (error: any) {
    console.error('[디버깅] 메타데이터 확인 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 메타데이터 추출 테스트용 엔드포인트 추가
router.get('/debug/extract-test/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    console.log(`[메타데이터 테스트] 파일명 추출 테스트: ${filename}`);
    
    // 메타데이터 추출기 import
    const metadataExtractor = require('../modules/metadataExtractor').default;
    
    // 파일명에서 메타데이터 추출
    const result = metadataExtractor.extractFromFilename(filename);
    
    console.log(`[메타데이터 테스트] 추출 결과:`, result);
    
    res.json({
      success: true,
      data: {
        filename: filename,
        extractedMetadata: result,
        hasSubject: !!result.subject,
        hasGrade: !!result.grade,
        subjectValue: result.subject,
        gradeValue: result.grade
      }
    });
  } catch (error: any) {
    console.error('[메타데이터 테스트] 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router; 