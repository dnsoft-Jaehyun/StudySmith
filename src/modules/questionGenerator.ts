// file: src/services/questionGenerator.ts
// ------------------------------------------------------------------
//  QuestionGenerator  –  워크플로우 결과 저장 + Fallback 전담
// ------------------------------------------------------------------

import questionWorkflow from "../workflows/questionWorkflow";
import {
    vectorStoreManager
} from "./vectorStoreManager";
import { Question } from "../types";
import path from "path";
import * as fs from "fs";
import {
    Document
} from "@langchain/core/documents";

// ===== 1. 문제를 벡터 스토어에 저장 =====
export async function saveQuestionsToVectorStore(
  questions: Question[],
  collectionName = "generated_questions"
): Promise<void> {
  if (!questions || !questions.length) return;

  const collection = await vectorStoreManager.getOrCreateCollection(collectionName);
  const documents = questions.map(q => new Document({
    pageContent: q.question,
    metadata: {
      ...q.metadata,
      id: q.id,
      question_type: q.metadata?.question_type || '객관식',
      answer: q.answer,
    }
  }));

  try {
    await vectorStoreManager.addDocuments(collection, documents);
    console.log(
      `${questions.length}개 문제가 컬렉션 '${collectionName}'에 저장되었습니다.`
    );
  } catch (e) {
    console.error("벡터 스토어 저장 오류:", e);
  }
}

// ===== 2. 헬퍼 타입 & createQuestion =====
type QuestionMetaLocal = {
  subject: string;
  grade: string;
  question_type: string;
  fileName: string;
  chapter_id?: number; // number로 통일
  lesson_id?: number; // number로 통일
  chapter_title?: string;
  lesson_title?: string;
  difficulty?: string;
  is_fallback?: boolean;
  generated_at?: string;
  [k: string]: any;
};

function createQuestion(
  data: Partial<Question>,
  meta: QuestionMetaLocal
): Question {
  return {
    id:
      data.id ??
      `q_${Date.now()}_${Math.floor(Math.random() * 10_000).toString().padStart(4, "0")}`,
    question: data.question ?? "",
    answer: data.answer ?? "",
    options: data.options ?? [],
    hint: data.hint,
    explanation: data.explanation,
    metadata: {
      ...meta,
      ...data.metadata,
      subject: meta.subject,
      grade: meta.grade,
      question_type: meta.question_type,
      fileName: meta.fileName,
      generated_at: meta.generated_at ?? new Date().toISOString(),
      // chapter_id와 lesson_id를 명시적으로 number로 변환
      chapter_id: meta.chapter_id,
      lesson_id: meta.lesson_id,
    },
  };
}

// ===== 3. QuestionGenerator 클래스 =====
export class QuestionGenerator {
  /* 3-1. 워크플로우 호출 */
  public async generateQuestionSet(opts: {
    subject: string;
    grade: string;
    chapter_id: string | number;
    lesson_id: string | number;
    chapter_title?: string;
    lesson_title?: string;
    question_type?: string;
    difficulty?: string;
    num_questions: number;
    pdf_id?: string;
    job_id?: string; // 둘 다 지원
    keywords?: string[];
  }, progressCallback?: (progress: number, status: string) => void): Promise<Question[]> {
    try {
      console.log(`문제 생성 시작: job_id=${opts.job_id || opts.pdf_id}, num_questions=${opts.num_questions}, difficulty=${opts.difficulty}`);
      
      const resultState = await questionWorkflow.runWorkflow({
        subject: opts.subject,
        grade: opts.grade,
        chapter_title:
          opts.chapter_title ??
          `${opts.subject} ${opts.grade}학년 ${opts.chapter_id}단원`,
        lesson_title: opts.lesson_title ?? `${opts.lesson_id}차시`,
        difficulty: opts.difficulty,
        metadata: {
          subject: opts.subject,
          grade: opts.grade,
          chapter_title:
            opts.chapter_title ??
            `${opts.subject} ${opts.grade}학년 ${opts.chapter_id}단원`,
          lesson_title: opts.lesson_title ?? `${opts.lesson_id}차시`,
          keywords: opts.keywords || [],
          difficulty: opts.difficulty
        },
        question_type: opts.question_type ?? "객관식",
        num_questions: opts.num_questions,
        pdf_id: opts.job_id || opts.pdf_id,
      }, progressCallback);

      const questions = resultState.final_questions || [];
      console.log(`워크플로우에서 ${questions.length}개 문제 생성 완료`);
      
      // 벡터 스토어 저장은 jobQueue에서 처리하도록 제거
      // if (questions.length > 0) {
      //   if (progressCallback) {
      //     progressCallback(97, "생성된 문제를 벡터 스토어에 저장 중...");
      //   }
      //   await saveQuestionsToVectorStore(questions);
      // }
      return questions;
    } catch (err) {
      console.error("워크플로우 실패:", err);
      if (progressCallback) {
        progressCallback(95, "워크플로우 실패, 기본 문제 생성 중...");
      }
      return this.generateFallbackQuestions(opts);
    }
  }

  /* 3-2. 워크플로우 실패 시 기본 문제 */
  private async generateFallbackQuestions(opts: {
    subject: string;
    grade: string;
    chapter_id: string | number;
    lesson_id: string | number;
    chapter_title?: string;
    lesson_title?: string;
    question_type?: string;
    difficulty?: string;
    num_questions: number;
    fileName?: string;
  }): Promise<Question[]> {
    console.log("Fallback 문제 생성 시작");
    const qs: Question[] = [];

    for (let i = 0; i < opts.num_questions; i++) {
      qs.push(
        createQuestion(
          {
            question: `${opts.subject} ${opts.grade}학년 기본 문제 ${i + 1}`,
            answer: "4. 정답",
            options: ["1. 오답1", "2. 오답2", "3. 오답3", "4. 정답"],
            hint: "문제를 잘 읽어보세요.",
            explanation: "워크플로우 오류로 생성된 기본 문제입니다.",
          },
          {
            subject: opts.subject,
            grade: opts.grade,
            question_type: opts.question_type ?? "객관식",
            fileName: opts.fileName ?? 'fallback.pdf',
            chapter_id: typeof opts.chapter_id === 'string' ? parseInt(opts.chapter_id) : opts.chapter_id,
            lesson_id: typeof opts.lesson_id === 'string' ? parseInt(opts.lesson_id) : opts.lesson_id,
            chapter_title: opts.chapter_title,
            lesson_title: opts.lesson_title,
            difficulty: opts.difficulty ?? "중",
            is_fallback: true,
            generated_at: new Date().toISOString(),
          }
        )
      );
    }

    // Fallback 문제도 저장
    await saveQuestionsToVectorStore(qs, "generated_questions");
    return qs;
  }

  /* 3-3. GraphWorker를 통한 문제 생성 */
  public async generateWithGraph(options: {
    useMetadata: boolean;
    metadata: {
      subject: string;
      grade: string;
      chapter_id: string | number;
      lesson_id: string | number;
      chapter_title?: string;
      lesson_title?: string;
      keywords?: string[];
    };
    generateQuestions: boolean;
    generateDialogues: boolean;
    questionParams: {
    num_questions: number;
    question_type: string;
    include_hints: boolean;
    include_explanations: boolean;
    };
      pdf_id?: string;
      job_id?: string;
  }): Promise<{ questions: Question[]; dialogues?: any[] }> {
    try {
      console.log('GraphWorker를 통한 문제 생성 시작');

      // 워크플로우 입력 구성
      const input = {
        subject: options.metadata.subject,
        grade: options.metadata.grade,
        chapter_title: options.metadata.chapter_title || 
          `${options.metadata.subject} ${options.metadata.grade}학년 ${options.metadata.chapter_id}단원`,
        lesson_title: options.metadata.lesson_title || 
          `${options.metadata.lesson_id}차시`,
        metadata: {
          subject: options.metadata.subject,
          grade: options.metadata.grade,
          chapter_title: options.metadata.chapter_title || 
            `${options.metadata.subject} ${options.metadata.grade}학년 ${options.metadata.chapter_id}단원`,
          lesson_title: options.metadata.lesson_title || 
            `${options.metadata.lesson_id}차시`,
          keywords: options.metadata.keywords || []
        },
        question_type: options.questionParams.question_type,
        num_questions: options.questionParams.num_questions,
        pdf_id: options.pdf_id || options.job_id
      };

      // 워크플로우 실행
      const resultState = await questionWorkflow.runWorkflow(input);
      const questions = resultState.final_questions || [];
      console.log(`GraphWorker: ${questions.length}개 문제 생성 완료`);

      // 벡터 스토어에 저장
      if (questions.length > 0) {
        await saveQuestionsToVectorStore(questions);
      }

      return {
        questions,
        dialogues: [] // 대화 생성 기능은 아직 구현되지 않음
      };
    } catch (error) {
      console.error('GraphWorker 문제 생성 오류:', error);
      
      // 오류 시 기본 문제로 대체
      const fallbackQuestions = await this.generateFallbackQuestions({
        subject: options.metadata.subject,
        grade: options.metadata.grade,
        chapter_id: options.metadata.chapter_id,
        lesson_id: options.metadata.lesson_id,
        chapter_title: options.metadata.chapter_title,
        lesson_title: options.metadata.lesson_title,
        question_type: options.questionParams.question_type,
        num_questions: options.questionParams.num_questions,
        fileName: 'fallback.pdf'
      });
      
      return {
        questions: fallbackQuestions,
        dialogues: []
      };
    }
  }
}

const questionGenerator = new QuestionGenerator();
export default questionGenerator;
