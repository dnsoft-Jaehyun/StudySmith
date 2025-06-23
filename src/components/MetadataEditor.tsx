import React, { useState, useEffect } from 'react';

interface ExtractedMetadata {
  subject?: string;
  grade?: string;
  chapter?: string;
  lesson?: string;
  keywords?: string[];
  difficulty?: string;
  documentType?: string;
}

interface MetadataValidation {
  isValid: boolean;
  missingFields: string[];
  confidence: number;
}

interface MetadataEditorProps {
  jobId: string;
  filename: string;
  onMetadataUpdate: (metadata: ExtractedMetadata) => void;
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({ jobId, filename, onMetadataUpdate }) => {
  // 자동 추출된 메타데이터
  const [autoMetadata, setAutoMetadata] = useState<ExtractedMetadata>({});
  const [validation, setValidation] = useState<MetadataValidation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // 수정 가능한 메타데이터
  const [editedMetadata, setEditedMetadata] = useState<ExtractedMetadata>({});
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 교과목과 학년 옵션
  const SUBJECT_OPTIONS = ['국어', '수학', '영어', '과학', '사회', '도덕', '체육', '음악', '미술', '실과', '정보'];
  const GRADE_OPTIONS = ['1', '2', '3', '4', '5', '6'];

  // 컴포넌트 마운트 시 메타데이터 자동 추출
  useEffect(() => {
    extractMetadata();
  }, [jobId, filename]);

  // 메타데이터 자동 추출
  const extractMetadata = async () => {
    try {
      setIsLoading(true);
      
      // 서버에서 첫 페이지 텍스트 가져오기 (실제 구현 필요)
      const firstPageText = await getFirstPageText(jobId);
      
      // 메타데이터 추출 API 호출
      const response = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, firstPageText })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setAutoMetadata(result.metadata);
        setEditedMetadata(result.metadata);
        setValidation(result.validation);
        
        // 부모 컴포넌트에 전달
        onMetadataUpdate(result.metadata);
      }
    } catch (error) {
      console.error('메타데이터 자동 추출 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 첫 페이지 텍스트 가져오기 (임시 구현)
  const getFirstPageText = async (jobId: string): Promise<string> => {
    // 실제로는 서버에서 PDF 첫 페이지 텍스트를 가져와야 함
    return '';
  };

  // 메타데이터 수정 처리
  const handleMetadataChange = (field: keyof ExtractedMetadata, value: any) => {
    const updated = { ...editedMetadata, [field]: value };
    setEditedMetadata(updated);
    setHasChanges(JSON.stringify(updated) !== JSON.stringify(autoMetadata));
  };

  // 메타데이터 저장
  const saveMetadata = () => {
    onMetadataUpdate(editedMetadata);
    setAutoMetadata(editedMetadata);
    setHasChanges(false);
    setIsEditing(false);
  };

  // 자동 추출값으로 리셋
  const resetToAuto = () => {
    setEditedMetadata(autoMetadata);
    setHasChanges(false);
  };

  // 신뢰도에 따른 색상
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#4CAF50';
    if (confidence >= 0.6) return '#FF9800';
    return '#F44336';
  };

  if (isLoading) {
    return (
      <div className="metadata-editor loading">
        <div className="spinner"></div>
        <p>메타데이터 분석 중...</p>
      </div>
    );
  }

  return (
    <div className="metadata-editor">
      <div className="metadata-header">
        <h3>📋 문서 메타데이터</h3>
        {validation && (
          <div 
            className="confidence-badge"
            style={{ backgroundColor: getConfidenceColor(validation.confidence) }}
          >
            신뢰도: {Math.round(validation.confidence * 100)}%
          </div>
        )}
      </div>

      {validation && !validation.isValid && (
        <div className="validation-warning">
          <p>⚠️ 다음 필수 정보가 누락되었습니다:</p>
          <ul>
            {validation.missingFields.map(field => (
              <li key={field}>{field === 'subject' ? '교과' : '학년'}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="metadata-content">
        {/* 교과 */}
        <div className="metadata-field">
          <label>교과</label>
          {isEditing ? (
            <select
              value={editedMetadata.subject || ''}
              onChange={(e) => handleMetadataChange('subject', e.target.value)}
            >
              <option value="">선택하세요</option>
              {SUBJECT_OPTIONS.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          ) : (
            <span className={`value ${!editedMetadata.subject ? 'empty' : ''}`}>
              {editedMetadata.subject || '미지정'}
            </span>
          )}
          {autoMetadata.subject && autoMetadata.subject !== editedMetadata.subject && (
            <span className="auto-value">(자동: {autoMetadata.subject})</span>
          )}
        </div>

        {/* 학년 */}
        <div className="metadata-field">
          <label>학년</label>
          {isEditing ? (
            <select
              value={editedMetadata.grade || ''}
              onChange={(e) => handleMetadataChange('grade', e.target.value)}
            >
              <option value="">선택하세요</option>
              {GRADE_OPTIONS.map(grade => (
                <option key={grade} value={grade}>{grade}학년</option>
              ))}
            </select>
          ) : (
            <span className={`value ${!editedMetadata.grade ? 'empty' : ''}`}>
              {editedMetadata.grade ? `${editedMetadata.grade}학년` : '미지정'}
            </span>
          )}
          {autoMetadata.grade && autoMetadata.grade !== editedMetadata.grade && (
            <span className="auto-value">(자동: {autoMetadata.grade}학년)</span>
          )}
        </div>

        {/* 단원 */}
        <div className="metadata-field">
          <label>단원</label>
          {isEditing ? (
            <input
              type="text"
              value={editedMetadata.chapter || ''}
              onChange={(e) => handleMetadataChange('chapter', e.target.value)}
              placeholder="예: 1. 우리나라의 정치 발전"
            />
          ) : (
            <span className={`value ${!editedMetadata.chapter ? 'empty' : ''}`}>
              {editedMetadata.chapter || '미지정'}
            </span>
          )}
        </div>

        {/* 차시 */}
        <div className="metadata-field">
          <label>차시</label>
          {isEditing ? (
            <input
              type="text"
              value={editedMetadata.lesson || ''}
              onChange={(e) => handleMetadataChange('lesson', e.target.value)}
              placeholder="예: 경제주체의 역할과 우리나라 경제체제"
            />
          ) : (
            <span className={`value ${!editedMetadata.lesson ? 'empty' : ''}`}>
              {editedMetadata.lesson || '미지정'}
            </span>
          )}
        </div>

        {/* 키워드 */}
        <div className="metadata-field">
          <label>키워드</label>
          {isEditing ? (
            <input
              type="text"
              value={editedMetadata.keywords?.join(', ') || ''}
              onChange={(e) => handleMetadataChange('keywords', 
                e.target.value.split(',').map(k => k.trim()).filter(k => k)
              )}
              placeholder="쉼표로 구분하여 입력"
            />
          ) : (
            <div className="keywords">
              {editedMetadata.keywords?.map((keyword, idx) => (
                <span key={idx} className="keyword-tag">{keyword}</span>
              )) || <span className="empty">없음</span>}
            </div>
          )}
        </div>

        {/* 문서 유형 */}
        {editedMetadata.documentType && (
          <div className="metadata-field">
            <label>문서 유형</label>
            <span className="value">{editedMetadata.documentType}</span>
          </div>
        )}
      </div>

      <div className="metadata-actions">
        {isEditing ? (
          <>
            <button className="btn btn-primary" onClick={saveMetadata}>
              저장
            </button>
            <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
              취소
            </button>
            {hasChanges && (
              <button className="btn btn-link" onClick={resetToAuto}>
                자동 추출값으로 복원
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-edit" onClick={() => setIsEditing(true)}>
            수정
          </button>
        )}
      </div>
    </div>
  );
};

export default MetadataEditor;
