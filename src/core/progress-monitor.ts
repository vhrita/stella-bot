import { logger } from './logger.js';
import WebSocket from 'ws';
import { TaskProgress, ProgressCallback } from './types.js';
import { resolveTask, rejectTask } from './local-ai.js';

// OTIMIZAÇÃO FASE 3: Enhanced Progress Tracking
interface ProgressMetrics {
  startTime: number;
  lastUpdate: number;
  stepsPerSecond: number;
  estimatedTimeRemaining: number;
  progressHistory: Array<{ timestamp: number; progress: number; step: number }>;
}

export class TaskProgressMonitor {
  private ws: WebSocket | null = null;
  private readonly taskId: string;
  private readonly callback: ProgressCallback;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly baseUrl: string;
  private isCompleted = false;
  
  // OTIMIZAÇÃO FASE 3: Métricas de progresso melhoradas
  private readonly progressMetrics: ProgressMetrics = {
    startTime: Date.now(),
    lastUpdate: Date.now(),
    stepsPerSecond: 0,
    estimatedTimeRemaining: 0,
    progressHistory: []
  };

  constructor(baseUrl: string, taskId: string, callback: ProgressCallback) {
    this.baseUrl = baseUrl;
    this.taskId = taskId;
    this.callback = callback;
  }

  /**
   * OTIMIZAÇÃO FASE 3: Calcula métricas de progresso avançadas
   */
  private updateProgressMetrics(data: TaskProgress): void {
    const now = Date.now();
    
    // Adicionar ao histórico
    this.progressMetrics.progressHistory.push({
      timestamp: now,
      progress: data.progress,
      step: data.current_step || 0
    });
    
    // Manter apenas últimos 10 registros para cálculo de velocidade
    if (this.progressMetrics.progressHistory.length > 10) {
      this.progressMetrics.progressHistory.shift();
    }
    
    // Calcular steps por segundo baseado no histórico
    if (this.progressMetrics.progressHistory.length >= 2) {
      const recent = this.progressMetrics.progressHistory.slice(-3); // Últimos 3 registros
      const timeDiff = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;
      const stepDiff = recent[recent.length - 1].step - recent[0].step;
      
      if (timeDiff > 0 && stepDiff > 0) {
        this.progressMetrics.stepsPerSecond = stepDiff / timeDiff;
      }
    }
    
    // Estimar tempo restante baseado na velocidade atual
    if (data.total_steps && data.current_step && this.progressMetrics.stepsPerSecond > 0) {
      const remainingSteps = data.total_steps - data.current_step;
      this.progressMetrics.estimatedTimeRemaining = remainingSteps / this.progressMetrics.stepsPerSecond;
    }
    
    this.progressMetrics.lastUpdate = now;
  }

  /**
   * OTIMIZAÇÃO FASE 3: Formatar métricas para display
   */
  private formatProgressInfo(data: TaskProgress): string {
    let info = `Progresso: ${data.progress}%`;
    
    if (data.current_step && data.total_steps) {
      info += ` - Step ${data.current_step}/${data.total_steps}`;
    }
    
    if (data.model_used) {
      info += ` - ${data.model_used}`;
    }
    
    // Adicionar informações de performance se disponível
    if (data.performance_stats) {
      info += ` (Mem: ${data.performance_stats.memory_percent.toFixed(1)}%)`;
    }
    
    // Adicionar velocidade e tempo estimado
    if (this.progressMetrics.stepsPerSecond > 0) {
      info += ` [${this.progressMetrics.stepsPerSecond.toFixed(1)} steps/s`;
      
      if (this.progressMetrics.estimatedTimeRemaining > 0 && this.progressMetrics.estimatedTimeRemaining < 300) {
        info += `, ETA: ${Math.round(this.progressMetrics.estimatedTimeRemaining)}s`;
      }
      
      info += `]`;
    }
    
    return info;
  }

  /**
   * OTIMIZAÇÃO FASE 3: Extrair dados da mensagem WebSocket
   */
  private extractMessageData(event: any): string | null {
    if (typeof event.data === 'string') {
      return event.data;
    } else if (event.data instanceof Buffer) {
      return event.data.toString('utf8');
    } else {
      logger.error('Formato de dados WebSocket não suportado:', typeof event.data);
      return null;
    }
  }

  /**
   * OTIMIZAÇÃO FASE 3: Log melhorado de progresso
   */
  private logProgressUpdate(data: TaskProgress): void {
    if (data.status === 'processing') {
      logger.progress(this.formatProgressInfo(data));
    } else if (data.status === 'completed') {
      const timeInfo = data.generation_time ? ` em ${data.generation_time.toFixed(1)}s` : '';
      const imageInfo = data.image_stats ? 
        ` (${data.image_stats.width}x${data.image_stats.height})` : '';
      logger.success(`Geração concluída${timeInfo}${imageInfo} - ${data.output_paths.length} imagem(ns)`);
    } else if (data.status === 'failed') {
      const errorDetail = data.message.includes('CUDA out of memory') ? ' - Memória GPU insuficiente' : '';
      logger.log(`❌ Falha na geração: ${data.message}${errorDetail} (Step ${data.current_step}/${data.total_steps})`);
    } else {
      logger.log(`📊 Status: ${data.status} - ${data.message}`);
    }
  }

  /**
   * OTIMIZAÇÃO FASE 3: Processar conclusão da tarefa
   */
  private handleTaskCompletion(data: TaskProgress): void {
    // Se completou, falhou ou foi cancelado, marcar como completado e fechar conexão
    if (['completed', 'failed', 'cancelled'].includes(data.status)) {
      this.isCompleted = true;
      if (data.status === 'cancelled') {
        logger.log(`🚫 Tarefa ${this.taskId} foi cancelada: ${data.message}`);
      }
      
      // OTIMIZAÇÃO: Resolver a Promise aguardando
      if (data.status === 'completed') {
        resolveTask(this.taskId, {
          task_id: this.taskId,
          status: 'completed',
          progress: 100,
          message: data.message,
          output_paths: data.output_paths || [],
          generation_time: data.generation_time || undefined
        });
      } else {
        rejectTask(this.taskId, new Error(data.message || `Tarefa ${data.status}`));
      }
      
      // Fechar WebSocket após processar
      setTimeout(() => this.stop(), 100);
    }
  }

  public start(): void {
    this.connect();
  }

  public stop(): void {
    this.isCompleted = true;
    if (this.ws) {
      this.ws.close(1000, 'Normal closure'); // Código 1000 = fechamento normal
      this.ws = null;
    }
  }

  public forceStop(): void {
    this.isCompleted = true;
    if (this.ws) {
      this.ws.close(1001, 'Task cancelled'); // Código 1001 = going away
      this.ws = null;
    }
  }

  private connect(): void {
    try {
      // Converter https para wss
      const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      const fullUrl = `${wsUrl}/ws/task/${this.taskId}`;
      
      logger.websocket(`Conectando WebSocket: ${fullUrl}`);
      
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        logger.websocket(`WebSocket conectado para tarefa ${this.taskId}`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const dataString = this.extractMessageData(event);
          if (!dataString) return;
          
          const data: TaskProgress = JSON.parse(dataString);
          
          // OTIMIZAÇÃO FASE 3: Atualizar métricas de progresso
          this.updateProgressMetrics(data);
          
          // Log melhorado baseado no status
          this.logProgressUpdate(data);
          
          // Chamar callback apenas se não completou ainda
          if (!this.isCompleted) {
            this.callback(data);
          }

          // Processar conclusão da tarefa
          this.handleTaskCompletion(data);
          
        } catch (error) {
          logger.error('Erro ao parsear mensagem WebSocket:', error);
        }
      };

      this.ws.onclose = (event: any) => {
        logger.log(`🔌 WebSocket fechado para tarefa ${this.taskId} (código: ${event.code})`);
        
        // Tentar reconectar apenas se não foi fechamento intencional e a tarefa não terminou
        if (event.code !== 1000 && !this.isCompleted && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          logger.log(`🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
          setTimeout(() => {
            if (!this.isCompleted) {
              this.connect();
            }
          }, 2000 * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (error: any) => {
        logger.error('Erro no WebSocket:', error);
      };

    } catch (error) {
      logger.error('Erro ao criar WebSocket:', error);
    }
  }
}

/**
 * Cancela uma tarefa em execução
 */
export async function cancelTask(baseUrl: string, taskId: string): Promise<boolean> {
  try {
    // Primeiro tentar DELETE (novo endpoint)
    const deleteResponse = await fetch(`${baseUrl}/task/${taskId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });

    if (deleteResponse.ok) {
      try {
        const data = await deleteResponse.json();
        if (data.message?.includes('sucesso')) {
          logger.log(`✅ Tarefa ${taskId} cancelada: ${data.message}`);
          return true;
        }
      } catch (jsonError) {
        // Se não conseguir parsear JSON, mas status é OK, considerar sucesso
        logger.log(`✅ Tarefa ${taskId} cancelada com sucesso (DELETE)`);
        logger.log(`JSON parse error (não crítico): ${jsonError}`);
        return true;
      }
    } else {
      // Tentar parsear erro do DELETE
      try {
        const errorData = await deleteResponse.json();
        if (errorData.detail) {
          logger.log(`⚠️ DELETE falhou para tarefa ${taskId}: ${errorData.detail}`);
        }
      } catch (jsonError) {
        logger.log(`⚠️ DELETE falhou para tarefa ${taskId}: status ${deleteResponse.status}`);
        logger.log(`JSON parse error: ${jsonError}`);
      }
    }

    // Se DELETE falhar, tentar o endpoint de cancel antigo como fallback
    const cancelResponse = await fetch(`${baseUrl}/task/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });

    if (cancelResponse.ok) {
      logger.log(`✅ Tarefa ${taskId} cancelada com sucesso via POST /cancel (fallback)`);
      return true;
    } else {
      logger.error(`❌ Falha ao cancelar tarefa ${taskId}: DELETE ${deleteResponse.status}, POST ${cancelResponse.status}`);
      return false;
    }
  } catch (error) {
    logger.error('Erro ao cancelar tarefa:', error);
    return false;
  }
}
