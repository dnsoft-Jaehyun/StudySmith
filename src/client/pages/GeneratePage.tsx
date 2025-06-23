import React, { useState, useEffect, useCallback, useRef } from 'react';
import './GeneratePage.css';
import * as api from '../services/api';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { NativeTypes } from 'react-dnd-html5-backend';
import JobProgress from '../components/JobProgress';

// ────────────────────────────────────────────────────────────
// #region 상수 및 타입 정의
// ────────────────────────────────────────────────────────────
const SUBJECT_OPTIONS = ['국어', '사회', '과학'];
const GRADE_OPTIONS = ['3', '4', '5', '6'];
const QUESTION_TYPE_OPTIONS = ['객관식', '주관식', '진위형', '빈칸추론', '서술형'];
const MAX_QUESTIONS = 10;
const MAX_FILE_SIZE_MB = 500;

// #endregion

// ────────────────────────────────────────────────────────────
// #region 메인 컴포넌트
// ────────────────────────────────────────────────────────────
const GeneratePage: React.FC = () => {
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocumentName, setSelectedDocumentName] = useState<string | null>(null);

  const handleJobComplete = (result: any) => {
    console.log('작업 완료 결과:', result);
    // jobQueue에서 { questions: [...] } 형태로 반환하므로 직접 사용
    setGeneratedResult(result);
    setIsLoading(false);
    setJobId(null);
  };

  const handleJobError = (errorMessage: string) => {
    setError(errorMessage);
    setIsLoading(false);
    setJobId(null);
  };

  const handleGenerate = async (params: any) => {
    setError(null);
    setGeneratedResult(null);
    setIsLoading(true);
    
    // 문서가 선택되지 않은 경우 에러 처리
    if (!selectedDocumentId) {
      setError('문서를 먼저 선택해주세요.');
      setIsLoading(false);
      return;
    }
    
    try {
      const finalParams = { ...params, documentId: selectedDocumentId };
      console.log('문제 생성 요청:', finalParams);
      const { success, data, error: apiError } = await api.generateQuestionsManual(finalParams);
      if (success && data.jobId) {
        setJobId(data.jobId);
      } else {
        throw new Error(apiError || '생성 요청에 실패했습니다.');
      }
    } catch (e: any) {
      setError('생성 요청 중 오류 발생: ' + e.message);
      setIsLoading(false);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container-fluid p-4 generate-page">
        <div className="split-layout-container">
          <div className="left-section">
            {/* 문제 생성 설정 패널 - 상단 1/2 */}
            <div className="settings-panel-cute">
              <div className="panel-header-cute">
                <h2 className="panel-title-cute">
                  <i className="bi bi-gear-fill me-2"></i>
                  문제 생성 설정
                </h2>
                <div className="panel-subtitle-cute">PDF를 업로드하거나 기존 문서를 선택하세요 📚</div>
              </div>
              <div className="panel-body-cute">
                <DocumentUploader 
                  onDocumentSelect={(id, name) => {
                    setSelectedDocumentId(id);
                    setSelectedDocumentName(name);
                  }} 
                />
              </div>
            </div>
            
            {/* 생성 정보 입력 패널 - 하단 1/2 */}
            <div className="input-panel-cute">
              <div className="panel-header-cute">
                <h2 className="panel-title-cute">
                  <i className="bi bi-file-text me-2"></i>
                  생성 정보 입력
                </h2>
                <div className="panel-subtitle-cute">문제 생성에 필요한 정보를 입력하세요 ✨</div>
              </div>
              <div className="panel-body-cute">
                {selectedDocumentId && (
                  <div className="selection-alert-cute">
                    <div className="alert-icon">✅</div>
                    <div className="alert-content">
                      <span className="alert-title">선택된 문서</span>
                      <small className="alert-id">
                        {selectedDocumentName || `ID: ${selectedDocumentId}`}
                      </small>
                    </div>
                  </div>
                )}
                <ManualModePanel onGenerate={handleGenerate} isLoading={isLoading} />
              </div>
            </div>
          </div>
          <div className="right-section">
            <ResultPanel 
              result={generatedResult} 
              jobId={jobId}
              onJobComplete={handleJobComplete}
              onJobError={handleJobError}
            />
          </div>
        </div>
      </div>
    </DndProvider>
  );
};
// #endregion



// ────────────────────────────────────────────────────────────
// #region 문서 업로더 컴포넌트
// ────────────────────────────────────────────────────────────
interface DocumentUploaderProps {
  onDocumentSelect: (id: string | null, name?: string | null) => void;
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({ onDocumentSelect }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // 파일명 표시를 위한 헬퍼 함수
  const getDisplayName = (doc: any) => {
    return doc.metadata.displayName || 
           doc.metadata.fileName || 
           doc.metadata.title || 
           doc.metadata.originalName || 
           doc.metadata.id || 
           '알 수 없는 파일';
  };

  const [{ canDrop, isOver }, drop] = useDrop(() => ({
    accept: [NativeTypes.FILE],
    drop(item: { files: File[] }) {
      handleFileChange(item.files);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  drop(dropRef);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const { success, data, error: apiError } = await api.getDocuments();
      if (success) setDocuments(data);
      else throw new Error(apiError);
    } catch (e: any) {
      if (!isInitialMount.current) {
        setError('문서 목록 로딩 실패: ' + e.message);
      }
    } finally {
      setIsLoading(false);
      isInitialMount.current = false;
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileChange = (files: File[] | FileList | null) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    let errorMessage = '';

    for (const file of fileArray) {
      if (file.type !== 'application/pdf') {
        errorMessage = `${file.name}: PDF 파일만 업로드할 수 있습니다.`;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errorMessage = `${file.name}: 파일 크기는 ${MAX_FILE_SIZE_MB}MB를 초과할 수 없습니다.`;
        continue;
      }
      validFiles.push(file);
    }

    if (errorMessage) {
      setError(errorMessage);
    } else {
      setError(null);
    }
    
    setSelectedFiles(validFiles);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploadStatus(`${selectedFiles.length}개 파일 업로드 및 처리 중...`);
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      
      const uploadRes = await api.uploadFile(formData);
      if (!uploadRes.success) throw new Error(uploadRes.error);
      
      const { successCount, errorCount, results } = uploadRes.data;
      
      if (successCount > 0) {
        setUploadStatus(`${successCount}개 파일 업로드 완료!`);
        setSelectedFiles([]);
        await fetchDocuments();

        // 첫 번째 성공한 문서를 선택
        const firstSuccess = results.find((r: any) => r.status === 'success');
        if (firstSuccess) {
          setActiveDocId(firstSuccess.id);
          onDocumentSelect(firstSuccess.id);
        }
      }
      
      if (errorCount > 0) {
        const failedFiles = results.filter((r: any) => r.status === 'error').map((r: any) => r.originalName);
        setError(`일부 파일 업로드 실패: ${failedFiles.join(', ')}`);
      }
      
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (e: any) {
      setError('업로드 처리 실패: ' + e.message);
      setUploadStatus('');
    }
  };
  
  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (!window.confirm(`'${docName}' 문서를 정말 삭제하시겠습니까?\n관련된 모든 데이터가 영구적으로 제거됩니다.`)) {
      return;
    }
    
    setError(null);
    setIsLoading(true);
    
    try {
      const res = await api.deleteDocument(docId);
      if (!res.success) {
        throw new Error(res.error || '서버에서 삭제를 실패했습니다.');
      }
      
      // 선택된 문서가 삭제된 경우 선택 해제
      if (activeDocId === docId) {
        setActiveDocId(null);
        onDocumentSelect(null);
      }
      
      // 성공 메시지 표시
      setUploadStatus(`'${docName}' 문서가 삭제되었습니다.`);
      setTimeout(() => setUploadStatus(''), 3000);
      
      // 목록 새로고침
      await fetchDocuments();
    } catch (e: any) {
      setError(`문서 삭제 실패: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDocument = (doc: any) => {
    if (activeDocId === doc.metadata.id) {
      setActiveDocId(null);
      onDocumentSelect(null, null);
    } else {
      setActiveDocId(doc.metadata.id);
      onDocumentSelect(doc.metadata.id, getDisplayName(doc));
    }
  };

  return (
    <div className="document-uploader-cute">
      <div className="upload-section-cute">
        <h4 className="upload-title-cute">
          <span className="title-icon">📄</span>
          <span className="title-text">PDF 파일 업로드</span>
        </h4>
        
        <div 
          ref={dropRef} 
          className={`drop-zone-cute ${isOver && canDrop ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <div className="drop-content">
            <div className="drop-icon">📁</div>
            <p className="drop-text">PDF 파일을 여기에 드래그하거나 이 영역을 클릭하세요</p>
            <div className="drop-hint">📊 최대 {MAX_FILE_SIZE_MB}MB • 여러 파일 동시 선택 가능</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => handleFileChange(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="selected-files-cute">
            <h6 className="files-title">
              <span className="title-icon">📋</span>
              <span className="title-text">선택된 파일</span>
              <span className="documents-count">{selectedFiles.length}개</span>
            </h6>
            <div className="files-list">
              {selectedFiles.map((file, index) => (
                <div key={index} className="file-item-cute">
                  <div className="file-info">
                    <div className="file-icon">📄</div>
                    <div className="file-details">
                      <p className="file-name" title={file.name}>{file.name}</p>
                      <small className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                    </div>
                  </div>
                  <button 
                    className="btn-file-remove" 
                    onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))} 
                    disabled={!!uploadStatus}
                    title="파일 제거"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="files-actions">
              <button 
                className="btn-upload-cute" 
                onClick={handleUpload} 
                disabled={!!uploadStatus}
              >
                <span className="btn-icon">{uploadStatus ? '⏳' : '☁️'}</span>
                <span className="btn-text">
                  {uploadStatus || `${selectedFiles.length}개 파일 업로드`}
                </span>
              </button>
              <button 
                className="btn-cancel-cute" 
                onClick={() => setSelectedFiles([])} 
                disabled={!!uploadStatus}
              >
                <span className="btn-icon">🗑️</span>
                <span className="btn-text">전체 취소</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="error-alert-cute">
            <div className="alert-icon">⚠️</div>
            <div className="alert-text">{error}</div>
          </div>
        )}
        
        {uploadStatus && (
          <div className="status-alert-cute">
            <div className="alert-icon">ℹ️</div>
            <div className="alert-text">{uploadStatus}</div>
          </div>
        )}
      </div>
      
      <div className="documents-section-cute">
        <h5 className="documents-title-cute">
          <span className="title-icon">📚</span>
          <span className="title-text">업로드된 문서 목록</span>
          {documents.length > 0 && (
            <span className="documents-count">{documents.length}개</span>
          )}
        </h5>
        
        {isLoading && (
          <div className="loading-cute">
            <div className="loading-spinner">⏳</div>
            <span className="loading-text">목록을 불러오는 중...</span>
          </div>
        )}
        
        <div className="document-list-cute">
          {documents.length === 0 && !isLoading ? (
            <div className="empty-state-cute">
              <div className="empty-icon">📂</div>
              <p className="empty-text">업로드된 문서가 없습니다</p>
              <small className="empty-hint">위에서 PDF 파일을 업로드해보세요!</small>
            </div>
          ) : (
            documents.map((doc) => (
              <div 
                key={doc.metadata.id} 
                className={`document-item-cute ${activeDocId === doc.metadata.id ? 'selected' : ''}`}
              >
                <div 
                  className="document-content" 
                  onClick={() => handleSelectDocument(doc)}
                >
                  <div className="document-icon">📄</div>
                  <div className="document-info">
                    <p className="document-name" title={getDisplayName(doc)}>
                      {getDisplayName(doc)}
                    </p>
                    <small className="document-date">
                      {new Date(doc.metadata.lastModified).toLocaleString()}
                    </small>
                  </div>
                  {activeDocId === doc.metadata.id && (
                    <div className="selected-badge">✓</div>
                  )}
                </div>
                <button 
                  className="btn-document-delete" 
                  onClick={() => handleDeleteDocument(doc.metadata.id, getDisplayName(doc))}
                  disabled={isLoading}
                  title="문서 삭제"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// #endregion

// ────────────────────────────────────────────────────────────
// #region 수동 생성 패널
// ────────────────────────────────────────────────────────────
interface ManualModePanelProps {
  onGenerate: (params: any) => void;
  isLoading: boolean;
}

const ManualModePanel: React.FC<ManualModePanelProps> = ({ onGenerate, isLoading }) => {
  const [formData, setFormData] = useState({
    subject: SUBJECT_OPTIONS[0], grade: GRADE_OPTIONS[0], chapter_title: '',
    lesson_title: '', question_type: '객관식', num_questions: 5,
    difficulty: '보통', keywords: [] as string[],
  });
  const [keywordInput, setKeywordInput] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'num_questions' ? parseInt(value) : value }));
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !formData.keywords.includes(kw)) {
      setFormData(prev => ({ ...prev, keywords: [...prev.keywords, kw] }));
    }
    setKeywordInput('');
  };
  
  const handleRemoveKeyword = (kw: string) => {
    setFormData(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="manual-form-cute">

      <div className="form-grid-cute">
        {/* 교과 선택 */}
        <div className="form-group-cute">
          <label className="form-label-cute">
            <span className="label-icon">📚</span>
            <span className="label-text">교과목</span>
          </label>
          <div className="input-wrapper-cute">
            <select 
              name="subject" 
              value={formData.subject} 
              onChange={handleChange} 
              className="form-select-cute"
            >
              {SUBJECT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 학년 선택 */}
        <div className="form-group-cute">
          <label className="form-label-cute">
            <span className="label-icon">🎓</span>
            <span className="label-text">학년</span>
          </label>
          <div className="input-wrapper-cute">
            <select 
              name="grade" 
              value={formData.grade} 
              onChange={handleChange} 
              className="form-select-cute"
            >
              {GRADE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}학년</option>
              ))}
            </select>
          </div>
        </div>

        {/* 단원명 입력 */}
        <div className="form-group-cute full-width">
          <label className="form-label-cute">
            <span className="label-icon">📖</span>
            <span className="label-text">단원명</span>
          </label>
          <div className="input-wrapper-cute">
            <input 
              name="chapter_title" 
              type="text" 
              value={formData.chapter_title} 
              onChange={handleChange} 
              className="form-control-cute" 
              placeholder="예: 지구와 달의 운동" 
            />
          </div>
        </div>

        {/* 차시명 입력 */}
        <div className="form-group-cute full-width">
          <label className="form-label-cute">
            <span className="label-icon">📝</span>
            <span className="label-text">차시명</span>
          </label>
          <div className="input-wrapper-cute">
            <input 
              name="lesson_title" 
              type="text" 
              value={formData.lesson_title} 
              onChange={handleChange} 
              className="form-control-cute" 
              placeholder="예: 계절별 별자리" 
            />
          </div>
        </div>

        {/* 문제 유형과 난이도 - 문제 수와 같은 디자인 */}
        <div className="form-group-cute">
          <label className="form-label-cute">
            <span className="label-icon">❓</span>
            <span className="label-text">문제 유형</span>
          </label>
          <div className="input-wrapper-cute">
            <select 
              name="question_type" 
              value={formData.question_type} 
              onChange={handleChange} 
              className="form-select-cute"
            >
              {QUESTION_TYPE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group-cute">
          <label className="form-label-cute">
            <span className="label-icon">⭐</span>
            <span className="label-text">난이도</span>
          </label>
          <div className="input-wrapper-cute">
            <select 
              name="difficulty" 
              value={formData.difficulty} 
              onChange={handleChange} 
              className="form-select-cute"
            >
              <option value="쉬움">😊 쉬움 (기초 수준)</option>
              <option value="보통">😐 보통 (표준 수준)</option>
              <option value="어려움">😤 어려움 (심화 수준)</option>
            </select>
          </div>
        </div>

        {/* 문제 수 입력 */}
        <div className="form-group-cute">
          <label className="form-label-cute">
            <span className="label-icon">🔢</span>
            <span className="label-text">문제 수</span>
          </label>
          <div className="input-wrapper-cute">
            <input 
              name="num_questions" 
              type="number" 
              value={formData.num_questions} 
              onChange={handleChange} 
              className="form-control-cute" 
              min="1" 
              max={MAX_QUESTIONS}
              placeholder="예: 5개"
            />
          </div>
        </div>

        {/* 키워드 입력 */}
        <div className="form-group-cute full-width">
          <label className="form-label-cute">
            <span className="label-icon">🏷️</span>
            <span className="label-text">키워드</span>
          </label>
          <div className="input-wrapper-cute">
            <div className="keyword-input-group">
              <input 
                type="text" 
                value={keywordInput} 
                onChange={e => setKeywordInput(e.target.value)} 
                onKeyDown={e => { 
                  if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    handleAddKeyword(); 
                  } 
                }} 
                className="form-control-cute keyword-input" 
                placeholder="예: 중력, 관성, 마찰력 (Enter로 추가)" 
              />
              <button 
                className="btn-add-keyword" 
                type="button" 
                onClick={handleAddKeyword}
                disabled={!keywordInput.trim()}
              >
                <span>추가</span>
                
                <span className="add-sparkle">✨</span>
              </button>
            </div>
            {formData.keywords.length > 0 && (
              <div className="keyword-tags-cute">
                {formData.keywords.map(kw => (
                  <span key={kw} className="keyword-tag-cute">
                    <span className="keyword-text">{kw}</span>
                    <button 
                      type="button" 
                      className="keyword-remove" 
                      onClick={() => handleRemoveKeyword(kw)}
                      title={`${kw} 키워드 제거`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 생성 버튼 */}
      <div className="form-submit-cute">
        <button 
          type="submit" 
          className="btn-generate-cute" 
          disabled={isLoading}
        >
          <span className="btn-icon">
            {isLoading ? '⏳' : '🎯'}
          </span>
          <span className="btn-text">
            {isLoading ? '생성 중...' : '문제 생성하기'}
          </span>
        </button>
      </div>
    </form>
  );
};
// #endregion

// ────────────────────────────────────────────────────────────
// #region 결과 패널 컴포넌트
// ────────────────────────────────────────────────────────────
interface ResultPanelProps {
  result: any;
  jobId: string | null;
  onJobComplete: (result: any) => void;
  onJobError: (error: string) => void;
}

const ResultPanel: React.FC<ResultPanelProps> = ({ result, jobId, onJobComplete, onJobError }) => {
  const [exportFormat, setExportFormat] = useState<'json' | 'txt'>('json');

  const downloadAsJson = () => {
    if (!result?.questions) return;
    
    const exportData = {
      metadata: {
        export_timestamp: new Date().toISOString(),
        export_format: "StudySmith Question Set v1.0",
        total_questions: result.questions.length,
        subject: result.questions[0]?.metadata?.subject || '미지정',
        grade: result.questions[0]?.metadata?.grade || '미지정',
        // 한글 표시명 (UI용)
        display_names: {
          export_timestamp: "생성일시",
          export_format: "내보내기형식", 
          total_questions: "총문제수",
          subject: "교과목",
          grade: "학년",
          question_id: "문제번호",
          sequence: "순서",
          question_text: "문제",
          question_type: "문제유형", 
          options: "선택지",
          correct_answer: "정답",
          hint: "힌트",
          explanation: "해설",
          difficulty: "난이도",
          keywords: "키워드"
        }
      },
      questions: result.questions.map((q: any, index: number) => ({
        question_id: q.id || `question_${index + 1}`,
        sequence: index + 1,
        question_text: q.question,
        question_type: q.metadata?.question_type || '객관식',
        options: q.options || [],
        correct_answer: q.answer,
        hint: q.hint || '',
        explanation: q.explanation || '',
        difficulty: q.metadata?.difficulty || '보통',
        keywords: q.metadata?.keywords || [],
        // 메타데이터
        metadata: {
          created_at: new Date().toISOString(),
          source: "StudySmith",
          version: "1.0"
        }
      }))
    };
    
    // 날짜와 시간을 포함한 파일명 생성
    const now = new Date();
    const dateTimeString = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, ''); // 2025-01-17_14-30-45 형태
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `StudySmith_${dateTimeString}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAsText = () => {
    if (!result?.questions) return;
    
    let textContent = `스터디스미스 문제집\n`;
    textContent += `생성일시: ${new Date().toLocaleString()}\n`;
    textContent += `총 문제 수: ${result.questions.length}개\n`;
    textContent += `${'='.repeat(50)}\n\n`;
    
    result.questions.forEach((q: any, index: number) => {
      textContent += `${index + 1}. ${q.question}\n`;
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt: string, i: number) => {
          textContent += `   ${i + 1}) ${opt}\n`;
        });
      }
      textContent += `\n정답: ${q.answer}\n`;
      if (q.hint) textContent += `힌트: ${q.hint}\n`;
      if (q.explanation) textContent += `해설: ${q.explanation}\n`;
      textContent += `${'-'.repeat(30)}\n\n`;
    });
    
    // 날짜와 시간을 포함한 파일명 생성
    const now = new Date();
    const dateTimeString = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, ''); // 2025-01-17_14-30-45 형태
    
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `스터디스미스_문제집_${dateTimeString}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (exportFormat === 'json') {
      downloadAsJson();
    } else {
      downloadAsText();
    }
  };

  if (jobId) {
    return (
      <div className="result-panel-cute">
        <div className="panel-header-cute">
          <h2 className="panel-title-cute">
            <i className="bi bi-gear-fill me-2"></i>
            생성 진행률
          </h2>
          <div className="panel-subtitle-cute">문제를 생성하고 있어요 ⏳</div>
        </div>
        <div className="result-panel-content">
          <JobProgress 
            jobId={jobId} 
            onComplete={onJobComplete}
            onError={onJobError}
          />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="result-panel-cute">
        <div className="panel-header-cute">
          <h2 className="panel-title-cute">
            <i className="bi bi-file-text me-2"></i>
            생성 결과
          </h2>
          <div className="panel-subtitle-cute">여기에 생성된 문제가 표시됩니다 ✨</div>
        </div>
              <div className="result-panel-content">
        <div className="empty-state-result-cute">
          <div className="empty-icon-large">💡</div>
          <p className="empty-title">문제 생성을 시작하면 결과가 여기에 표시됩니다</p>
          <small className="empty-description">PDF 문서를 업로드하거나 수동으로 정보를 입력하여 시작하세요</small>
        </div>
      </div>
      </div>
    );
  }
  
  console.log('ResultPanel에 전달된 result:', result);
  const questions = result.questions || [];
  console.log('추출된 questions:', questions);
  const hasQuestions = questions.length > 0;
  
  return (
    <div className="result-panel-cute">
      <div className="panel-header-cute">
        <div className="header-content">
          <h2 className="panel-title-cute">
            <i className="bi bi-check-circle-fill me-2"></i>
            생성 결과
          </h2>
          <div className="result-badge-cute">{questions.length}개 문제</div>
        </div>
        {hasQuestions && (
          <div className="download-section-cute">
            {/* 형식 선택 버튼들 */}
            <div className="format-selector-cute">
              <div className="cute-format-buttons">
                <button 
                  className={`format-btn ${exportFormat === 'json' ? 'active' : ''}`}
                  onClick={() => setExportFormat('json')}
                  title="JSON 형식으로 다운로드"
                >
                  <i className="format-icon">📋</i>
                  <span className="format-label">JSON</span>
                </button>
                <button 
                  className={`format-btn ${exportFormat === 'txt' ? 'active' : ''}`}
                  onClick={() => setExportFormat('txt')}
                  title="텍스트 형식으로 다운로드"
                >
                  <i className="format-icon">📝</i>
                  <span className="format-label">텍스트</span>
                </button>
              </div>
            </div>
            
            {/* 다운로드 버튼 */}
            <button 
              className="btn btn-success download-btn-cute"
              onClick={handleDownload}
              title={`${exportFormat === 'json' ? 'JSON' : '텍스트'} 형식으로 문제집 다운로드`}
            >
              <i className="bi bi-download me-2"></i>
              <span>다운로드</span>
              <div className="download-sparkle">✨</div>
            </button>
          </div>
        )}
      </div>
      <div className="result-panel-content">
        {hasQuestions ? (
          <>
            {/* 요약 정보 */}
            <div className="summary-info-cute">
              <div className="info-grid">
                <div className="info-item">
                  <div className="info-icon">📚</div>
                  <div className="info-content">
                    <small className="info-label">교과목</small>
                    <strong className="info-value">{questions[0]?.metadata?.subject || '미지정'}</strong>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-icon">🎓</div>
                  <div className="info-content">
                    <small className="info-label">학년</small>
                    <strong className="info-value">{questions[0]?.metadata?.grade || '미지정'}</strong>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-icon">❓</div>
                  <div className="info-content">
                    <small className="info-label">문제 유형</small>
                    <strong className="info-value">{questions[0]?.metadata?.question_type || '객관식'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* 문제 목록 */}
            <div className="questions-container-cute">
              {questions.map((q: any, index: number) => (
                <div key={q.id || index} className="question-card-cute">
                  {/* 문제 헤더 */}
                  <div className="question-header-cute">
                    <h5 className="question-number">
                      <span className="number-icon">📝</span>
                      문제 {index + 1}
                    </h5>
                  </div>

                  {/* 문제 본문 */}
                  <div className="question-body-cute">
                    {/* 1. 문제 */}
                    <div className="question-section-cute">
                      <div className="problem-box-cute">
                        <h6 className="section-title">
                          <span className="section-icon">💭</span>
                          문제
                        </h6>
                        <p className="problem-text">{q.question}</p>
                      </div>
                    </div>

                    {/* 2. 선택지 (객관식인 경우) */}
                    {q.options && q.options.length > 0 && (
                      <div className="options-section-cute">
                        <h6 className="section-title">
                          <span className="section-icon">📋</span>
                          선택지
                        </h6>
                        <div className="options-list">
                          {q.options.map((opt: string, i: number) => (
                            <div 
                              key={i} 
                              className={`option-item-cute ${opt === q.answer ? 'correct' : ''}`}
                            >
                              <span className="option-number">{i + 1})</span>
                              <span className="option-text">{opt}</span>
                              {opt === q.answer && <span className="correct-mark">✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. 정답 */}
                    <div className="answer-section-cute">
                      <div className="answer-box-cute">
                        <h6 className="section-title">
                          <span className="section-icon">✅</span>
                          정답
                        </h6>
                        <p className="answer-text">{q.answer}</p>
                      </div>
                    </div>

                    {/* 4. 힌트 */}
                    {q.hint && (
                      <div className="hint-section-cute">
                        <div className="hint-box-cute">
                          <h6 className="section-title">
                            <span className="section-icon">💡</span>
                            힌트
                          </h6>
                          <p className="hint-text">{q.hint}</p>
                        </div>
                      </div>
                    )}

                    {/* 5. 해설 */}
                    {q.explanation && (
                      <div className="explanation-section-cute">
                        <div className="explanation-box-cute">
                          <h6 className="section-title">
                            <span className="section-icon">📚</span>
                            해설
                          </h6>
                          <p className="explanation-text">{q.explanation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state-result-cute">
            <div className="empty-icon-large">⚠️</div>
            <p className="empty-title">생성된 문제가 없습니다</p>
            <small className="empty-description">다시 시도해보세요</small>
          </div>
        )}
      </div>
    </div>
  );
};
// #endregion

export default GeneratePage; 