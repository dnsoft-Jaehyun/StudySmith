import {
  Job,
  Worker,
  Queue
} from 'bullmq';
import {
  v4 as uuidv4
} from 'uuid';
import IORedis from 'ioredis';
import questionGenerator, {
  saveQuestionsToVectorStore
} from './questionGenerator';
import {
  vectorStoreManager
} from './vectorStoreManager';
import {
  webSocketManager
} from '../api/websocket';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

class JobQueue {
  private queue: Queue;
  private worker: Worker | null = null;

  constructor(queueName: string) {
    this.queue = new Queue(queueName, {
      connection: REDIS_CONNECTION,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
  }

  public initializeWorker() {
    this.worker = new Worker(this.queue.name, this.processJob.bind(this), {
      connection: REDIS_CONNECTION,
      concurrency: 5,
    });

    this.worker.on('completed', (job: Job, result: any) => {
      if (!job.id) return;
      console.log(`Job ${job.id} completed successfully.`);
      console.log(`Job ${job.id} result:`, JSON.stringify(result, null, 2));
      webSocketManager.broadcast(job.id, {
        event: 'completed',
        data: result
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      const jobId = job?.id;
      if (jobId) {
        console.error(`Job ${jobId} failed with error: ${error.message}`);
        webSocketManager.broadcast(jobId, {
          event: 'failed',
          data: { message: error.message }
        });
      } else {
        console.error(`An unknown job failed with error: ${error.message}`);
      }
    });

    this.worker.on('progress', (job: Job, progress: any) => {
      if (!job.id) return;
      console.log(`Job ${job.id} progress:`, progress);
      webSocketManager.broadcast(job.id, {
        event: 'progress',
        data: { progress: progress, status: '문제 생성 중...' }
      });
    });
  }

  public async addJob(jobName: string, data: any): Promise < Job > {
    const jobId = `${jobName}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const job = await this.queue.add(jobName, data, {
      jobId
    });
    console.log(`Added job ${jobName} with ID ${job.id}`);
    return job;
  }

  public async getJob(jobId: string): Promise < Job | null > {
    return await this.queue.getJob(jobId);
  }

  private async processJob(job: Job): Promise < any > {
    try {
      const jobName = job.name || 'unknown_job';
      console.log(`[${job.id}] 작업 시작: ${jobName}`);

      if (jobName.startsWith('manual_qgen')) {
        const params = job.data.request_options;
        const documentId = job.data.documentId;
        
        console.log(`[${job.id}] 수동 문제 생성 작업 시작`);
        console.log(`[${job.id}] 입력 파라미터:`, JSON.stringify(params, null, 2));
        
        // 초기 진행률 설정
        await job.updateProgress(5);

        // 진행률 콜백 함수 정의
        const progressCallback = async (progress: number, status: string) => {
          console.log(`[${job.id}] 진행률 업데이트: ${progress}% - ${status}`);
          await job.updateProgress(progress);
          
          // WebSocket을 통해 실시간 상태 전송
          webSocketManager.broadcast(job.id as string, {
            event: 'progress',
            data: { 
              progress: progress, 
              status: status,
              timestamp: new Date().toISOString()
            }
          });
        };

        // 사용자 입력 정보를 제대로 매핑
        const questionOptions = {
          subject: params.subject || '과학',
          grade: params.grade || '6',
          chapter_id: params.chapter_id || params.chapter_title || '1',
          lesson_id: params.lesson_id || params.lesson_title || '1',
          chapter_title: params.chapter_title || `${params.subject || '과학'} ${params.grade || '6'}학년 단원`,
          lesson_title: params.lesson_title || `${params.subject || '과학'} 학습`,
          question_type: params.question_type || params.questionType || '객관식',
          difficulty: params.difficulty || '보통',
          num_questions: params.num_questions || params.numQuestions || 5,
          pdf_id: documentId,
          job_id: job.id,
          keywords: params.keywords || []
        };

        console.log(`[${job.id}] 매핑된 옵션:`, JSON.stringify(questionOptions, null, 2));

        // 세밀한 진행률 추적과 함께 문제 생성 실행
        const questions = await questionGenerator.generateQuestionSet(questionOptions, progressCallback);

        if (!questions || questions.length === 0) {
          throw new Error("문제 생성에 실패했거나 생성된 문제가 없습니다.");
        }

        // 벡터 스토어 저장 시 진행률 업데이트
        await progressCallback(98, "생성된 문제를 저장 중...");
        await saveQuestionsToVectorStore(questions);
        
        // 최종 완료
        await progressCallback(100, `문제 생성 완료! ${questions.length}개 문제가 생성되었습니다.`);
        console.log(`[${job.id}] 문제 생성 완료: ${questions.length}개`);
        return { questions };
      } 
      
      console.warn(`[${job.id}] 처리 로직이 정의되지 않은 작업 유형입니다: ${jobName}`);
      return {};

    } catch (error: any) {
      console.error(`[${job.id}] 작업 실패:`, error);
      
      // 오류 발생 시에도 WebSocket 업데이트
      webSocketManager.broadcast(job.id as string, {
        event: 'error',
        data: { 
          progress: 100, 
          status: `오류 발생: ${error.message}`,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
      
      throw error;
    }
  }

  public getQueue(): Queue {
    return this.queue;
  }
}

export const jobQueue = new JobQueue('document-processing-queue');

export const initializeJobs = () => {
  jobQueue.initializeWorker();
  console.log('작업 큐 및 워커가 초기화되었습니다.');
}; 