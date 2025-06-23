import { parentPort, workerData } from "worker_threads";
import questionWorkflow from "./questionWorkflow";
import { Question } from "../types";

type GraphWorkerOptions = {
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
};

type GraphWorkerResult = {
  questions: Question[];
  dialogues?: any[];
};

class GraphWorker {
  public async execute(options: GraphWorkerOptions): Promise<GraphWorkerResult> {
    try {
      console.log('GraphWorker 실행 시작');

      const result: GraphWorkerResult = {
        questions: [],
        dialogues: []
      };

      if (options.generateQuestions) {
        const questions = await this.generateQuestions(options);
        result.questions = questions;
      }

      if (options.generateDialogues) {
        // 대화 생성 로직 (미구현)
        result.dialogues = [];
      }

      return result;
    } catch (error) {
      console.error('GraphWorker 실행 오류:', error);
      return { questions: [], dialogues: [] };
    }
  }

  private async generateQuestions(options: GraphWorkerOptions): Promise<Question[]> {
    try {
      const input = {
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

      const resultState = await questionWorkflow.runWorkflow(input);
      const questions = resultState.final_questions || [];
      console.log(`GraphWorker: ${questions.length}개 문제 생성 완료`);
      return questions;

    } catch (error) {
      console.error('문제 생성 오류:', error);
      return [];
    }
  }
}

async function run() {
  if (parentPort && workerData) {
    const worker = new GraphWorker();
    const result = await worker.execute(workerData as GraphWorkerOptions);
    parentPort.postMessage(result);
  }
}

run(); 