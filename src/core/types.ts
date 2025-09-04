/**
 * Tipos centralizados para o sistema Stella Bot
 * 
 * Convenção:
 * - interface: Para objetos que podem ser estendidos/implementados
 * - type: Para unions, intersections e utilitários
 */

/**
 * Estatísticas de performance do sistema de geração
 */
export interface PerformanceStats {
  device: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  model_loaded: boolean;
}

/**
 * Estatísticas da imagem gerada
 */
export interface ImageStats {
  width: number;
  height: number;
  channels: number;
  avg_brightness: number;
  contrast_std: number;
  color_channels: {
    red: number;
    green: number;
    blue: number;
  };
}

/**
 * Status e progresso de uma tarefa de geração
 */
export interface TaskProgress {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  message: string;
  progress: number;
  current_step: number;
  total_steps: number;
  output_paths: string[];
  generation_time: number | null;
  model_used: string;
  image_stats: ImageStats | null;
  performance_stats: PerformanceStats | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

/**
 * Callback para atualizações de progresso
 */
export type ProgressCallback = (progress: TaskProgress) => void;

/**
 * Interface unificada para metadados de imagem (local-ai + n8n)
 */
export interface ImageMetadata {
  model: string;
  provider: string;
  executionTime: number | null;
  parameters: {
    size: string;
    steps: number;
    cfg: number;
    seed: number | null;
  };
  prompt: string;
  requestId: string;
}

/**
 * Interface unificada para dados de imagem processada
 */
export interface ProcessedImageData {
  imageBuffer?: Buffer | null;
  imageUrl?: string;
  type: 'url' | 'base64' | 'buffer';
  metadata: ImageMetadata;
  error?: {
    type: 'content_policy_violation' | 'api_error' | 'timeout' | 'processing_failed' | 'cancelled';
    reason: string;
  };
}

/**
 * Interface para resposta de health check de serviços
 */
export interface ServiceHealthStatus {
  online: boolean;
  latency?: number;
  lastCheck: Date;
  errors?: string[];
}

/**
 * Interface para configuração de qualidade unificada
 */
export interface QualitySettings {
  steps: number;
  guidance: number;
  size: string;
  scheduler?: string;
}

export interface LocalAIResponse {
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

// Re-export TaskProgressMonitor para evitar import circular
export type { TaskProgressMonitor } from './progress-monitor.js';
