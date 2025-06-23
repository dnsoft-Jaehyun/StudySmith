import { WebSocketServer, WebSocket } from 'ws';
import {
  Server
} from 'http';

/**
 * WebSocket 서버 관리 클래스
 */
class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map < string, Set < WebSocket >> = new Map();

  /**
   * WebSocket 서버 초기화
   */
  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      // @ts-ignore
      const url = new URL(req.url!, `http://${req.headers.host}`);
      if (url.pathname !== '/api/ws') {
        return;
      }
      const jobId = url.searchParams.get('jobId');

      if (!jobId) {
        ws.close(1008, 'Job ID is required');
        return;
      }

      if (!this.clients.has(jobId)) {
        this.clients.set(jobId, new Set());
      }
      this.clients.get(jobId) !.add(ws);

      console.log(`WebSocket client connected for job ${jobId}`);

      ws.on('close', () => {
        const clientSet = this.clients.get(jobId);
        if (clientSet) {
          clientSet.delete(ws);
          if (clientSet.size === 0) {
            this.clients.delete(jobId);
          }
        }
        console.log(`WebSocket client disconnected for job ${jobId}`);
      });
    });
  }

  public broadcast(jobId: string, data: any) {
    const clientSet = this.clients.get(jobId);
    if (clientSet) {
      const message = JSON.stringify(data);
      clientSet.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }
}

export const webSocketManager = new WebSocketManager();

export const setupWebSocket = (server: Server) => {
  webSocketManager.initialize(server);
}; 