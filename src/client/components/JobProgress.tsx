import React, { useState, useEffect } from 'react';
import './JobProgress.css';

interface JobProgressProps {
  jobId: string;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}

const JobProgress: React.FC<JobProgressProps> = ({ jobId, onComplete, onError }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('작업을 시작하는 중입니다...');
  const [isCompleted, setIsCompleted] = useState(false);
  const [detailedStatus, setDetailedStatus] = useState('');
  const [timestamp, setTimestamp] = useState('');
  
  useEffect(() => {
    if (jobId && !isCompleted) {
      let pollInterval: NodeJS.Timeout | null = null;
      let maxAttempts = 60; // 최대 60번 시도 (2분)
      let attempts = 0;

      console.log(`Starting job monitoring for: ${jobId}`);
      
      // 기본 상태별 메시지 정의 (백엔드 메시지가 없을 때의 폴백)
      const getFallbackStatusMessage = (progressValue: number) => {
        if (progressValue <= 5) return '워크플로우 초기화 중...';
        if (progressValue <= 15) return '문서 검색 및 분석 중...';
        if (progressValue <= 25) return '문제 생성 준비 중...';
        if (progressValue <= 55) return '개별 문제 생성 중...';
        if (progressValue <= 65) return '힌트 및 해설 검증 중...';
        if (progressValue <= 78) return '중복 문제 제거 중...';
        if (progressValue <= 95) return '최종 검증 및 수량 조정 중...';
        if (progressValue < 100) return '생성된 문제 저장 중...';
        return '문제 생성 완료!';
      };
      
      // WebSocket 연결이 불안정하므로 직접 폴링으로 시작
      const startPolling = () => {
        if (pollInterval) return; // 이미 폴링 중이면 중복 실행 방지
        
        console.log(`Starting polling for job: ${jobId}`);
        setStatus('작업 상태를 확인하는 중...');
        
        pollInterval = setInterval(async () => {
          if (isCompleted || attempts >= maxAttempts) {
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            if (attempts >= maxAttempts) {
              setStatus('작업 시간이 초과되었습니다. 다시 시도해주세요.');
              setIsCompleted(true);
              if (onError) onError('작업 시간 초과');
            }
            return;
          }

          attempts++;
          
          try {
            const response = await fetch(`/api/job/${jobId}`);
            const jobData = await response.json();
            
            if (jobData.success) {
              const job = jobData.data;
              
              if (job.state === 'completed') {
                setProgress(100);
                setStatus('작업이 완료되었습니다!');
                setDetailedStatus('모든 문제가 성공적으로 생성되었습니다.');
                setIsCompleted(true);
                console.log('Job completed, returnvalue:', job.returnvalue);
                if (onComplete) onComplete(job.returnvalue);
                if (pollInterval) {
                  clearInterval(pollInterval);
                  pollInterval = null;
                }
              } else if (job.state === 'failed') {
                const errorMessage = job.failedReason || '알 수 없는 오류';
                setStatus(`작업 중 오류가 발생했습니다`);
                setDetailedStatus(errorMessage);
                setIsCompleted(true);
                if (onError) onError(errorMessage);
                if (pollInterval) {
                  clearInterval(pollInterval);
                  pollInterval = null;
                }
              } else {
                // 진행 중인 상태 - 백엔드에서 오는 세밀한 진행률 사용
                let progressValue = 0;
                let statusMessage = '';
                let detailedMessage = '';
                
                if (typeof job.progress === 'number') {
                  progressValue = Math.max(0, Math.min(100, job.progress));
                  statusMessage = getFallbackStatusMessage(progressValue);
                } else if (job.progress && typeof job.progress === 'object') {
                  // 백엔드에서 전송하는 상세 진행률 정보
                  progressValue = Math.max(0, Math.min(100, job.progress.progress || 0));
                  statusMessage = job.progress.status || getFallbackStatusMessage(progressValue);
                  detailedMessage = job.progress.message || '';
                  
                  // 타임스탬프 업데이트
                  if (job.progress.timestamp) {
                    const time = new Date(job.progress.timestamp).toLocaleTimeString();
                    setTimestamp(time);
                  }
                } else {
                  // 시간 기반 진행률 (최후의 폴백)
                  progressValue = Math.min((attempts / maxAttempts) * 90, 90);
                  statusMessage = getFallbackStatusMessage(progressValue);
                }
                
                setProgress(progressValue);
                setStatus(statusMessage);
                setDetailedStatus(detailedMessage);
                
                console.log(`📊 Progress Update: ${progressValue}% - ${statusMessage} ${detailedMessage ? '(' + detailedMessage + ')' : ''}`);
              }
            } else {
              console.error('Job status fetch failed:', jobData.error);
              // 연결 실패 시에도 시간 기반으로 진행률 표시
              const timeProgress = Math.min((attempts / maxAttempts) * 90, 90);
              setProgress(timeProgress);
              setStatus(getFallbackStatusMessage(timeProgress));
              setDetailedStatus('네트워크 연결을 확인하는 중...');
            }
          } catch (error) {
            console.error('Polling error:', error);
            const timeProgress = Math.min((attempts / maxAttempts) * 90, 90);
            setProgress(timeProgress);
            setStatus(getFallbackStatusMessage(timeProgress));
            setDetailedStatus('네트워크 연결 문제가 발생했습니다.');
          }
        }, 1500); // 1.5초마다 폴링 (더 빠른 응답을 위해)
      };

      // 즉시 폴링 시작
      startPolling();
    
      return () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };
    }
  }, [jobId, onComplete, onError, isCompleted]);
  
  // 진행률에 따른 색상 변경
  const getProgressColor = (progress: number) => {
    if (progress < 20) return 'bg-info';
    if (progress < 40) return 'bg-primary';
    if (progress < 70) return 'bg-warning';
    if (progress < 100) return 'bg-success';
    return 'bg-success';
  };

  // 진행률에 따른 아이콘
  const getProgressIcon = (progress: number) => {
    if (progress < 20) return 'bi-search';
    if (progress < 40) return 'bi-gear-fill';
    if (progress < 70) return 'bi-pencil-square';
    if (progress < 100) return 'bi-check2-square';
    return 'bi-check-circle-fill';
  };
  
  return (
    <div className="job-progress-container">
      <div className="progress-header mb-3">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 d-flex align-items-center">
            <i className={`bi ${getProgressIcon(progress)} me-2 text-primary`}></i>
            문제 생성 진행률
          </h6>
          <span className={`badge ${getProgressColor(progress)} bg-opacity-75`}>
            {Math.round(progress)}%
          </span>
        </div>
      </div>
      
      <div className="progress-bar-wrapper mb-3">
        <div className="progress" style={{ height: '14px', borderRadius: '7px' }}>
          <div 
            className={`progress-bar progress-bar-striped ${progress < 100 ? 'progress-bar-animated' : ''} ${getProgressColor(progress)}`}
            style={{ 
              width: `${progress}%`, 
              transition: 'width 0.8s ease-in-out',
              borderRadius: '7px'
            }}
          />
        </div>
      </div>
      
      <div className="status-section">
        <div className="main-status mb-2">
          <p className="status-text text-center mb-1 fw-semibold">{status}</p>
          {detailedStatus && (
            <p className="detailed-status text-center mb-1 text-muted small">
              {detailedStatus}
            </p>
          )}
        </div>
        
        {!isCompleted && (
          <div className="text-center">
            <small className="text-muted d-flex align-items-center justify-content-center">
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
              처리 중입니다... 
              {timestamp && (
                <span className="ms-2 text-info">
                  (마지막 업데이트: {timestamp})
                </span>
              )}
            </small>
          </div>
        )}
        
        {isCompleted && progress === 100 && (
          <div className="completion-indicator text-center">
            <div className="alert alert-success alert-sm py-2">
              <i className="bi bi-check-circle-fill me-1"></i>
              작업이 성공적으로 완료되었습니다!
            </div>
          </div>
        )}
        
        {isCompleted && progress < 100 && (
          <div className="error-indicator text-center">
            <div className="alert alert-danger alert-sm py-2">
              <i className="bi bi-exclamation-triangle-fill me-1"></i>
              작업 중 문제가 발생했습니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobProgress;