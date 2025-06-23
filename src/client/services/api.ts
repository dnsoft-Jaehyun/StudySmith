// src/services/api.ts

import axios from 'axios';
import { Job } from '../../types';
import {
  Document
} from '@langchain/core/documents';

// process.env 사용 시 브라우저 호환성 문제 해결
const getApiBaseUrl = (): string => {
  // 개발 환경에서는 하드코딩된 URL 사용
  if (typeof window !== 'undefined') {
    // 브라우저 환경에서는 현재 호스트의 포트 8080 사용 (백엔드 포트)
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:8080`;
  }
  
  // 서버 사이드 또는 Node.js 환경에서는 환경변수 사용
  try {
    return process?.env?.REACT_APP_API_URL || 'http://localhost:8080';
  } catch {
    return 'http://localhost:8080';
  }
};

const API_BASE_URL = '/api';

// API 응답 타입 정의
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface QuestionSearchResponse {
  success: boolean;
  data: Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
  }>;
  total?: number;
  query?: string;
  filters?: Record<string, any>;
  error?: string;
}

interface VectorSearchResponse {
  success: boolean;
  count: number;
  results: Array<{
    id: string;
    collectionName: string;
    text: string;
    distance: number;
    metadata: Record<string, any>;
  }>;
  query?: string;
  error?: string;
}

// 기본 fetch 래퍼 (긴 요청 지원)
const fetchWithErrorHandling = async (url: string, options: RequestInit = {}): Promise<any> => {
  try {
    // Keep-Alive 헤더 추가로 연결 안정성 향상
    const response = await fetch(`${API_BASE_URL}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // AbortError는 사용자가 의도적으로 취소한 경우
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('요청이 타임아웃되었습니다. 다시 시도해주세요.');
    }
    console.error(`API 요청 오류 (${url}):`, error);
    throw error;
  }
};

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error(`API 요청 오류 (${url}):`, error);
    return {
      success: false,
      error: error.message || '알 수 없는 오류가 발생했습니다.'
    };
  }
}

interface UploadResult {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  results: Array<{
    id: string;
    originalName: string;
    fileSize: number;
    status: 'success' | 'error';
    error?: string;
  }>;
}

export const uploadFile = async (formData: FormData): Promise<ApiResponse<UploadResult>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('파일 업로드 API 오류:', error);
    return {
      success: false,
      error: error.message || '파일 업로드 중 오류가 발생했습니다.'
    };
  }
};

export const searchDocuments = (collectionName: string, query: string, n_results: number = 10) => {
  return request<Document[]>(`/documents/${collectionName}/search`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      n_results
    }),
  });
};

export const startQuestionGeneration = (documentId: string, metadata: any) => {
  return request<{ jobId: string }>('/jobs/generate-questions', {
    method: 'POST',
    body: JSON.stringify({
      documentId,
      metadata
    }),
  });
};

export const getJobStatus = async (jobId: string): Promise<ApiResponse<Job>> => {
    return request<Job>(`/job/${jobId}`);
};

export const getUploadedDocuments = async (): Promise<ApiResponse<any[]>> => {
    return request<any[]>(`/documents`);
};

export const getSubjects = async (): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/subjects`);
};

export const getGrades = async (subject: string): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/grades?subject=${encodeURIComponent(subject)}`);
};

export const getChapters = async (subject: string, grade: string): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/chapters?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}`);
};

export const getLessons = async (subject: string, grade: string, chapterId: number): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/lessons?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}&chapter_id=${chapterId}`);
};

export const searchMetadata = async (query: string, filters: Record<string, any> = {}): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/search-metadata`, {
    method: 'POST',
    body: JSON.stringify({ query: query.trim(), filters }),
  });
};

export const searchQuestions = async (query: string, filters: Record<string, any> = {}, limit: number = 20): Promise<QuestionSearchResponse> => {
    try {
      console.log('문제 검색 API 호출:', { query, filters, limit });
      
    const response = await fetchWithErrorHandling(`/search-questions`, {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim(),
          filters,
          limit
        }),
      });

      console.log('문제 검색 응답:', response);
      return response;
    } catch (error) {
      console.error('문제 검색 API 오류:', error);
      // 에러 발생 시에도 일관된 형식으로 반환
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : '문제 검색 중 오류가 발생했습니다.'
      };
    }
};

export const searchVectorStore = async (query: string, collectionName: string = 'questions', limit: number = 20): Promise<VectorSearchResponse> => {
    try {
      console.log('벡터 스토어 검색 API 호출:', { query, collectionName, limit });
      
    const response = await fetchWithErrorHandling(`/vector/search`, {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim(),
          collectionName,
          limit
        }),
      });

      console.log('벡터 스토어 검색 응답:', response);
      return response;
    } catch (error) {
      console.error('벡터 스토어 검색 API 오류:', error);
      // 에러 발생 시에도 일관된 형식으로 반환
      return {
        success: false,
        count: 0,
        results: [],
        error: error instanceof Error ? error.message : '벡터 스토어 검색 중 오류가 발생했습니다.'
      };
    }
};

export const searchAll = async (query: string, filters: Record<string, any> = {}, limit: number = 20): Promise<ApiResponse> => {
    try {
    const response = await fetchWithErrorHandling(`/search-all`, {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim(),
          filters,
          limit
        }),
      });

      console.log('통합 검색 응답:', response);
      return response;
    } catch (error) {
      console.error('통합 검색 API 오류:', error);
      throw error;
    }
};

export const generateQuestions = async (data: any): Promise<ApiResponse> => {
  return await fetchWithErrorHandling(`/generate-questions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
};

export const generateQuestionsManual = (params: any): Promise<ApiResponse> => {
  // 문제 생성은 시간이 오래 걸리므로 10분 타임아웃 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분
  
  return fetchWithErrorHandling(`/generate-questions-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
};

export const generateDialoguesManual = async (data: any): Promise<ApiResponse> => {
  // 대화 생성도 시간이 오래 걸리므로 10분 타임아웃 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분
  
  return await fetchWithErrorHandling(`/generate-dialogues-manual`, {
      method: 'POST',
      body: JSON.stringify(data),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });
};

export const generateContentManual = async (data: any): Promise<ApiResponse> => {
    try {
      console.log('통합 콘텐츠 생성 API 호출:', data);
      
      // 통합 콘텐츠 생성도 시간이 오래 걸리므로 10분 타임아웃 설정
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10분
      
    const response = await fetchWithErrorHandling(`/generate-content-manual`, {
        method: 'POST',
        body: JSON.stringify(data),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });

      console.log('통합 콘텐츠 생성 응답:', response);
      return response;
    } catch (error) {
      console.error('통합 콘텐츠 생성 API 오류:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '통합 콘텐츠 생성 중 오류가 발생했습니다.'
      };
    }
};

export const getDocuments = async (): Promise<ApiResponse<any[]>> => {
    try {
    const response = await fetchWithErrorHandling(`/documents`);
      return response;
    } catch (error: any) {
      return { success: false, data: [], error: error.message };
    }
};

export const processFile = async (docId: string, stage: 'splitting' | 'embedding' | 'storing'): Promise<ApiResponse> => {
    try {
    const response = await fetchWithErrorHandling(`/documents/${docId}/process`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      return response;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
};

export const submitFeedback = async (data: {
    question_id: string;
    feedback: string;
    approved: boolean;
    corrections?: Record<string, any>;
  }): Promise<ApiResponse> => {
    try {
      console.log('피드백 제출 API 호출:', data);
      
    const response = await fetchWithErrorHandling(`/feedback`, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      console.log('피드백 제출 응답:', response);
      return response;
    } catch (error) {
      console.error('피드백 제출 API 오류:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '피드백 제출 중 오류가 발생했습니다.'
      };
    }
};

export const uploadDocument = async (formData: FormData): Promise<ApiResponse> => {
    try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData, // FormData는 Content-Type을 자동 설정
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('문서 업로드 API 오류:', error);
      throw error;
    }
};

export const deleteDocument = async (docId: string): Promise<ApiResponse> => {
    try {
    const response = await fetchWithErrorHandling(`/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      return { success: true, data: response };
    } catch (error: any) {
      console.error(`문서 삭제 API 오류 (docId: ${docId}):`, error);
      return { success: false, error: error.message || '문서 삭제 중 오류가 발생했습니다.' };
    }
};

// 새로고침 시 모든 업로드된 문서 삭제 (비활성화됨)
export const clearUploads = async (): Promise<ApiResponse> => {
  // API 호출하지 않고 즉시 성공 응답 반환
  console.log('[clearUploads] API 호출이 클라이언트에서 차단됨 - 문서 보존');
  return Promise.resolve({
    success: true,
    message: 'clear-uploads 기능이 비활성화되었습니다. 문서가 보존됩니다.',
    data: { disabled: true }
  });
};
