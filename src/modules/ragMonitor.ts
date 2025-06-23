// RAG 시스템 모니터링 및 디버깅 도구

import fs from 'fs';
import path from 'path';

interface RAGMetrics {
  timestamp: Date;
  jobId: string;
  stage: 'retrieval' | 'augment' | 'generate';
  success: boolean;
  details: {
    query?: string;
    collectionName?: string;
    documentsRetrieved?: number;
    searchStrategy?: string;
    topScore?: number;
    error?: string;
  };
}

export class RAGMonitor {
  private static instance: RAGMonitor;
  private metrics: RAGMetrics[] = [];
  private logPath: string;

  private constructor() {
    this.logPath = path.join(process.cwd(), 'logs', 'rag-metrics.json');
    this.ensureLogDirectory();
    this.loadMetrics();
  }

  static getInstance(): RAGMonitor {
    if (!RAGMonitor.instance) {
      RAGMonitor.instance = new RAGMonitor();
    }
    return RAGMonitor.instance;
  }

  private ensureLogDirectory() {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private loadMetrics() {
    try {
      if (fs.existsSync(this.logPath)) {
        const data = fs.readFileSync(this.logPath, 'utf-8');
        this.metrics = JSON.parse(data);
      }
    } catch (error) {
      console.error('메트릭 로드 오류:', error);
      this.metrics = [];
    }
  }

  private saveMetrics() {
    try {
      fs.writeFileSync(this.logPath, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('메트릭 저장 오류:', error);
    }
  }

  logRetrieval(
    jobId: string,
    query: string,
    collectionName: string,
    documentsRetrieved: number,
    searchStrategy: string,
    topScore?: number
  ) {
    const metric: RAGMetrics = {
      timestamp: new Date(),
      jobId,
      stage: 'retrieval',
      success: documentsRetrieved > 0,
      details: {
        query,
        collectionName,
        documentsRetrieved,
        searchStrategy,
        topScore
      }
    };

    this.metrics.push(metric);
    this.saveMetrics();

    // 실패한 경우 경고
    if (!metric.success) {
      console.warn(`[RAG Monitor] Retrieval 실패: ${jobId}`);
      console.warn(`  - 쿼리: ${query}`);
      console.warn(`  - 컬렉션: ${collectionName}`);
      console.warn(`  - 전략: ${searchStrategy}`);
    }
  }

  logGeneration(jobId: string, success: boolean, error?: string) {
    const metric: RAGMetrics = {
      timestamp: new Date(),
      jobId,
      stage: 'generate',
      success,
      details: { error }
    };

    this.metrics.push(metric);
    this.saveMetrics();
  }

  getMetricsSummary(hours = 24): {
    totalRequests: number;
    successRate: number;
    avgDocumentsRetrieved: number;
    failedRetrievals: number;
    topSearchStrategies: Record<string, number>;
  } {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    const retrievalMetrics = recentMetrics.filter(m => m.stage === 'retrieval');

    const totalRequests = retrievalMetrics.length;
    const successfulRetrievals = retrievalMetrics.filter(m => m.success).length;
    const successRate = totalRequests > 0 ? successfulRetrievals / totalRequests : 0;

    const totalDocs = retrievalMetrics.reduce((sum, m) => 
      sum + (m.details.documentsRetrieved || 0), 0
    );
    const avgDocumentsRetrieved = totalRequests > 0 ? totalDocs / totalRequests : 0;

    const failedRetrievals = totalRequests - successfulRetrievals;

    // 검색 전략별 통계
    const topSearchStrategies: Record<string, number> = {};
    retrievalMetrics.forEach(m => {
      if (m.details.searchStrategy) {
        topSearchStrategies[m.details.searchStrategy] = 
          (topSearchStrategies[m.details.searchStrategy] || 0) + 1;
      }
    });

    return {
      totalRequests,
      successRate,
      avgDocumentsRetrieved,
      failedRetrievals,
      topSearchStrategies
    };
  }

  // 실시간 알림을 위한 웹훅 (Slack, Discord 등)
  async sendAlert(message: string, level: 'info' | 'warning' | 'error' = 'warning') {
    const webhookUrl = process.env.MONITORING_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[RAG Monitor - ${level.toUpperCase()}] ${message}`,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('알림 전송 실패:', error);
    }
  }
}

// 싱글톤 인스턴스 export
export const ragMonitor = RAGMonitor.getInstance();
