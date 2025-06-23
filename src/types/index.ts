// 공통 타입 정의

// 메타데이터 관련 타입
export interface Lesson {
  lesson_id: number | null;
  title?: string;
  objective?: string;
  keywords?: string[];
}

export interface Chapter {
  chapter_id: number;
  title: string;
  lessons: Lesson[];
}

export interface GradeData {
  chapters: Chapter[];
  updated_at: string | null;
}

export interface SubjectData {
  [grade: string]: GradeData;
}

export interface CurriculumData {
  [subject: string]: SubjectData;
}

export interface MetadataFilter {
  subject?: string;
  grade?: string;
  chapter_id?: number | string;
  lesson_id?: number | string;
}

export interface PdfMetadata {
  subject: string;
  grade: string;
  chapterId: number;
  lessonId: number;
  fileName: string;
  title?: string;
  keywords?: string[];
}

/**
 * API 응답 인터페이스
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 문서 검색 결과 인터페이스
 */
export interface DocumentResult {
  id: string;
  job_id?: string;
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}

export interface QuestionMetadata {
  subject: string;
  grade: string;
  chapter_id?: string | number;
  chapter_title?: string;
  lesson_id?: string | number;
  lesson_title?: string;
  question_type: string; // 필수 속성으로 변경
  difficulty?: string;
  keywords?: string[];
  is_fallback?: boolean;
  is_emergency?: boolean;
  generated_at?: string;
  created_from_pdf?: boolean;
  is_auto_generated?: boolean;
  is_default_template?: boolean;
  validation?: {
    score: number;
    issues: string[];
    timestamp: string;
  };
  fileName: string;
  fileSize?: number;
  pages?: number;
  sourceType?: string;
  createdAt?: string;
  modifiedAt?: string;
  job_id?: string;
  updatedAt?: string;
  timestamp?: string;
  chunkIndex?: number;
  [key: string]: any;
}

/**
 * 문제 타입 정의
 */
export interface Question {
  id: string;
  number?: number;
  question: string;
  type?: string;
  options: string[];
  answer: string;
  hint?: string;
  explanation?: string;
  difficulty?: string;
  keywords?: string[];
  metadata?: DocumentMetadata;
}

/**
 * 문제 세트 인터페이스
 */
export interface QuestionSet {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  metadata: {
    subject: string;
    grade: string;
    chapter_title?: string;
    lesson_title?: string;
    created_at: string;
    total_questions: number;
  };
}

/**
 * 작업 큐 Job 타입
 */
export interface Job {
  id: string;
  name: string;
  data: any;
  progress: number;
  returnvalue: any;
  failedReason: string;
  timestamp: number;
  getState: () => Promise < string > ;
}

/**
 * 문서 메타데이터 타입
 */
export type DocumentMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  grade?: string;
  chapter_id?: number | string;
  lesson_id?: number | string;
  chapter?: string;
  lesson?: string;
  chapter_title?: string;
  lesson_title?: string;
  question_type?: string;
  difficulty?: string;
  keywords?: string[];
  fileName?: string;
  displayName?: string;
  originalName?: string;
  fileSize?: number;
  pages?: number;
  sourceType?: string;
  createdAt?: string;
  modifiedAt?: string;
  job_id?: string;
  updatedAt?: string;
  timestamp?: string;
  chunkIndex?: number;
  totalChunks?: number;
  docId?: string;
  fileHash?: string;
  collectionName?: string;
  generated_at?: string;
  is_fallback?: boolean;
  [key: string]: any;
};

export type Message = {
  id: string;
  type: 'human' | 'ai' | 'system';
  content: string;
  metadata?: Record < string, unknown > ;
}; 