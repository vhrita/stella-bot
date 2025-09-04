import { logger } from './logger.js';
import { TaskProgressMonitor, cancelTask } from './progress-monitor.js';
import { ProgressCallback } from './types.js';
import { config, TIMEOUTS } from './config.js';
import { errorHandler } from './error-handler.js';

// Cache de controllers para reutilização
const controllerCache = new Map<string, AbortController>();

/**
 * OTIMIZAÇÃO: Reutiliza controllers para reduzir overhead
 */
function getOrCreateController(key: string): AbortController {
  let controller = controllerCache.get(key);
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    controllerCache.set(key, controller);
    
    // Limpar controllers expirados periodicamente
    if (controllerCache.size > 10) {
      cleanupControllers();
    }
  }
  return controller;
}

/**
 * OTIMIZAÇÃO: Limpa controllers expirados
 */
function cleanupControllers(): void {
  for (const [key, controller] of controllerCache.entries()) {
    if (controller.signal.aborted) {
      controllerCache.delete(key);
    }
  }
}

// Configuração do serviço local
const LOCAL_AI_URL = config.LOCAL_AI_URL;

// Timeout configurável via variável de ambiente (padrão: 20 minutos)
const BASE_TIMEOUT = config.AI_TIMEOUT_BASE * 1000; // Em segundos, convertido para ms

// Incrementos de timeout por parâmetros (configuráveis via env)
const TIMEOUT_PER_STEP = config.AI_TIMEOUT_PER_STEP * 1000; // 15s por step padrão
const TIMEOUT_PER_MEGAPIXEL = config.AI_TIMEOUT_PER_MP * 1000; // 1min por megapixel extra
const TIMEOUT_HIGH_CFG_PENALTY = config.AI_TIMEOUT_HIGH_CFG * 1000; // 30s para CFG alto
const MAX_TIMEOUT = config.AI_TIMEOUT_MAX * 1000; // Máximo 60min padrão

/**
 * Calcula timeout dinâmico baseado nos parâmetros de geração
 * Sistema incremental: timeout base + incrementos por parâmetros
 */
/**
 * Calcula timeout dinâmico baseado nos parâmetros de geração
 * @param steps - Número de steps da geração
 * @param width - Largura da imagem em pixels
 * @param height - Altura da imagem em pixels  
 * @param cfgScale - Valor do CFG Scale
 * @returns Objeto com timeout calculado e informações adicionais
 */
function calculateTimeout(
  steps: number,
  width: number,
  height: number,
  cfgScale: number
): { 
  timeout: number; 
  breakdown: string; 
  wasLimited: boolean 
} {
  // Começar com timeout base
  let calculatedTimeout = BASE_TIMEOUT;
  
  // Incremento por steps
  const stepIncrement = steps * TIMEOUT_PER_STEP;
  calculatedTimeout += stepIncrement;
  
  // Incremento por resolução (megapixels acima de 1MP)
  const megapixels = (width * height) / (1024 * 1024);
  let resolutionIncrement = 0;
  if (megapixels > 1) {
    resolutionIncrement = (megapixels - 1) * TIMEOUT_PER_MEGAPIXEL;
    calculatedTimeout += resolutionIncrement;
  }
  
  // Incremento para CFG Scale alto (acima de 10)
  let cfgIncrement = 0;
  if (cfgScale > 10) {
    cfgIncrement = (cfgScale - 10) * TIMEOUT_HIGH_CFG_PENALTY;
    calculatedTimeout += cfgIncrement;
  }
  
  // Aplicar limite máximo
  const finalTimeout = Math.min(calculatedTimeout, MAX_TIMEOUT);
  const wasLimited = finalTimeout < calculatedTimeout;
  
  // Criar breakdown detalhado
  const breakdown = `Base: ${BASE_TIMEOUT/1000}s + Steps: ${stepIncrement/1000}s + Resolução: ${resolutionIncrement/1000}s + CFG: ${cfgIncrement/1000}s`;
  
  // Log detalhado do cálculo
  logger.timeout(`Timeout calculado: ${breakdown} = ${finalTimeout/1000}s${wasLimited ? ' (limitado)' : ''}`);
  
  return { 
    timeout: finalTimeout, 
    breakdown,
    wasLimited 
  };
}

// Interfaces para o serviço local
interface LocalGenerationRequest {
  model: string;
  scheduler?: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  num_images_per_prompt?: number;
  seed?: number;
  eta?: number;
  enhance_sharpness?: number;
  enhance_contrast?: number;
  enhance_color?: number;
  enhance_brightness?: number;
  apply_unsharp_mask?: boolean;
  use_attention_slicing?: boolean;
  use_cpu_offload?: boolean;
  use_vae_slicing?: boolean;
}

interface LocalModel {
  name: string;
  slug: string;
  description: string;
  resolution: string;
  memory_usage: string;
  avg_time: string;
  available: boolean;
}

interface LocalTaskResponse {
  task_id: string;
  status: string;
  message: string;
}

interface LocalTaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  output_paths?: string[];
  generation_time?: number;
  error?: string;
}

interface ProcessedLocalData {
  imageUrl?: string;
  imageBuffer?: Buffer | null;
  type: 'url' | 'buffer';
  metadata: {
    model: string;
    provider: string;
    executionTime: number;
    parameters: {
      size: string;
      steps: number;
      cfg: number;
      seed: number | null;
    };
    prompt: string;
    requestId: string;
  };
  error?: {
    type: 'timeout' | 'api_error' | 'processing_failed' | 'cancelled';
    reason: string;
  };
}

/**
 * Verifica se o serviço local está online
 */
/**
 * Verifica se o serviço Local AI está online e disponível
 * @returns Promise<boolean> - true se o serviço estiver acessível
 * @throws {StellaError} Quando há erro crítico de conexão
 */
export async function isLocalAIOnline(): Promise<boolean> {
  if (!LOCAL_AI_URL) {
    logger.warn('Local AI URL não configurada - usando apenas fallback N8N');
    return false;
  }

  try {
    const controller = getOrCreateController(`health-${LOCAL_AI_URL}`);
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.HEALTH_CHECK);

    const response = await fetch(`${LOCAL_AI_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    return response.ok;
  } catch (error) {
    const stellaError = errorHandler.normalize(error, { 
      userId: 'system',
      operation: 'list_models'
    });    logger.debug(`Local AI indisponível: ${stellaError.message}`);
    return false;
  }
}

/**
 * Busca os modelos disponíveis no serviço Local AI
 * @returns Promise<LocalModel[]> - Lista de modelos disponíveis
 * @throws {StellaError} Quando há erro na comunicação com o serviço
 */
export async function getAvailableModels(): Promise<LocalModel[]> {
  if (!LOCAL_AI_URL) {
    return [];
  }

  try {
    const controller = getOrCreateController(`models-${LOCAL_AI_URL}`);
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.MODEL_FETCH);

    const response = await fetch(`${LOCAL_AI_URL}/models`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Converter o objeto de modelos em array
    const modelsList: LocalModel[] = [];
    
    for (const [slug, modelInfo] of Object.entries(data)) {
      if (typeof modelInfo === 'object' && modelInfo !== null && !('error' in modelInfo)) {
        const model = modelInfo as any;
        modelsList.push({
          name: model.model_name || model.name || slug,
          slug: slug,
          description: model.description || `Modelo ${slug}`,
          resolution: model.resolution || `${model.max_resolution || 512}x${model.max_resolution || 512}`,
          memory_usage: `${model.memory_usage_gb || 'N/A'}GB`,
          avg_time: 'N/A',
          available: !model.error && model.device !== undefined, // Disponível se não tem erro e tem device
        });
      }
    }
    
    return modelsList;
  } catch (error) {
    const stellaError = errorHandler.normalize(error, { 
      serviceUrl: LOCAL_AI_URL,
      operation: 'fetch_models' 
    });
    stellaError.log();
    return [];
  }
}

/**
 * Submete uma solicitação de geração de imagem para o serviço Local AI
 * @param request - Parâmetros da geração de imagem
 * @returns Promise<string | null> - ID da tarefa ou null se falhou
 * @throws {StellaError} Quando há erro na submissão
 */
async function submitGeneration(request: LocalGenerationRequest): Promise<string | null> {
  if (!LOCAL_AI_URL) {
    throw new Error('URL do serviço local não configurada');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.GENERATION_SUBMIT);

    const response = await fetch(`${LOCAL_AI_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data: LocalTaskResponse = await response.json();
    return data.task_id;
  } catch (error) {
    logger.error('Erro ao submeter geração local:', error);
    return null;
  }
}

// Sistema de resolvers para coordenação WebSocket/Polling
const taskResolvers = new Map<string, {
  resolve: (value: LocalTaskStatus) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

/**
 * Resolve uma tarefa via WebSocket (chamado pelo monitor)
 */
export function resolveTask(taskId: string, status: LocalTaskStatus): void {
  const resolver = taskResolvers.get(taskId);
  if (resolver) {
    clearTimeout(resolver.timeout);
    taskResolvers.delete(taskId);
    resolver.resolve(status);
    
    // Limpar controllers periodicamente
    if (taskResolvers.size === 0) {
      cleanupControllers();
    }
  }
}

/**
 * Rejeita uma tarefa via WebSocket (chamado pelo monitor)
 */
export function rejectTask(taskId: string, error: Error): void {
  const resolver = taskResolvers.get(taskId);
  if (resolver) {
    clearTimeout(resolver.timeout);
    taskResolvers.delete(taskId);
    resolver.reject(error);
    
    // Limpar controllers periodicamente
    if (taskResolvers.size === 0) {
      cleanupControllers();
    }
  }
}

/**
 * Monitora o status de uma tarefa até completar ou atingir timeout
 * OTIMIZAÇÃO: Usado apenas como fallback quando WebSocket não está disponível
 * @param taskId - ID da tarefa a ser monitorada
 * @param timeoutMs - Timeout em milissegundos (opcional)
 * @param usePolling - Se deve usar polling (false = apenas WebSocket)
 * @returns Promise<LocalTaskStatus> - Status final da tarefa
 * @throws {StellaError} Quando há erro no monitoramento ou timeout
 */
async function waitForCompletion(
  taskId: string, 
  timeoutMs?: number, 
  usePolling = false
): Promise<LocalTaskStatus> {
  // Se WebSocket está sendo usado, não fazer polling redundante
  if (!usePolling) {
    logger.debug(`⚡ Aguardando conclusão via WebSocket para tarefa ${taskId}`);
    // Retornar uma Promise que será resolvida pelo WebSocket callback
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        taskResolvers.delete(taskId);
        reject(new Error(`Timeout aguardando WebSocket para tarefa ${taskId}`));
      }, timeoutMs || BASE_TIMEOUT);
      
      // Registrar resolver para ser chamado pelo WebSocket
      taskResolvers.set(taskId, { resolve, reject, timeout });
    });
  }

  // FALLBACK: Polling tradicional apenas quando WebSocket falha
  logger.debug(`🔄 Usando polling como fallback para tarefa ${taskId}`);
  const startTime = Date.now();
  const maxWaitTime = timeoutMs || BASE_TIMEOUT;
  
  logger.log(`⏱️ Timeout configurado para ${(maxWaitTime / 1000).toFixed(0)}s para tarefa ${taskId}`);
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.HTTP_REQUEST);

      const response = await fetch(`${LOCAL_AI_URL}/task/${taskId}`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status: LocalTaskStatus = await response.json();
      
      if (status.status === 'completed') {
        return status;
      } else if (status.status === 'failed') {
        throw new Error(status.error || 'Geração falhou');
      } else if (status.status === 'cancelled') {
        throw new Error('Tarefa foi cancelada pelo usuário');
      }

      // Aguardar antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEFAULT_POLLING));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        continue; // Timeout na verificação, tentar novamente
      }
      throw error;
    }
  }

  throw new Error(`Timeout na geração - processo demorou mais que ${(maxWaitTime / 1000).toFixed(0)} segundos`);
}

/**
 * Gera imagem usando o serviço local com monitoramento de progresso
 */
export async function generateImageLocalWithProgress(
  request: LocalGenerationRequest,
  progressCallback?: ProgressCallback
): Promise<ProcessedLocalData | null> {
  const result = await generateImageLocalWithProgressAndMonitor(request, progressCallback);
  return result.data;
}

/**
 * Gera imagem com acesso ao monitor para cancelamento
 */
/**
 * Gera uma imagem usando o serviço Local AI com monitoramento de progresso
 * @param request - Parâmetros completos da geração de imagem  
 * @param progressCallback - Callback opcional para receber atualizações de progresso
 * @returns Promise com resultado da geração e monitor de progresso
 * @throws {StellaError} Quando há erro na geração ou comunicação
 * @example
 * ```typescript
 * const result = await generateImageLocalWithProgressAndMonitor(
 *   buildLocalRequest("uma paisagem", "stable-diffusion", { steps: 20 }),
 *   (progress) => console.log(`Progresso: ${progress.progress}%`)
 * );
 * ```
 */
export async function generateImageLocalWithProgressAndMonitor(
  request: LocalGenerationRequest,
  progressCallback?: ProgressCallback
): Promise<{ data: ProcessedLocalData | null; monitor: TaskProgressMonitor | null }> {
  const startTime = Date.now();

  try {
    // Calcular timeout dinâmico baseado nos parâmetros
    const timeoutInfo = calculateTimeout(
      request.num_inference_steps || 20,
      request.width || 1024,
      request.height || 1024,
      request.guidance_scale || 7
    );
    
    logger.ai(`Iniciando geração local: "${request.prompt}" (modelo: ${request.model})`);

    // Submeter a geração
    const taskId = await submitGeneration(request);
    if (!taskId) {
      return { data: null, monitor: null };
    }

    logger.task(`Tarefa criada: ${taskId} - Iniciando monitoramento...`);

    // Iniciar monitoramento via WebSocket se callback foi fornecido
    let monitor: TaskProgressMonitor | null = null;
    if (progressCallback && LOCAL_AI_URL) {
      monitor = new TaskProgressMonitor(LOCAL_AI_URL, taskId, progressCallback);
      monitor.start();
    }

    try {
      // OTIMIZAÇÃO: Usar WebSocket-first, polling apenas como fallback
      const usePolling = !progressCallback || !LOCAL_AI_URL;
      const result = await waitForCompletion(taskId, timeoutInfo.timeout, usePolling);
      
      const executionTime = (Date.now() - startTime) / 1000;

      if (!result.output_paths || result.output_paths.length === 0) {
        throw new Error('Nenhuma imagem gerada');
      }

      // Construir URL da imagem
      const imageUrl = `${LOCAL_AI_URL}/image/${taskId}/1`;
      logger.info('🔗 URL da imagem construída:', imageUrl);
      logger.info('🔄 TESTE: Chegou até aqui - vamos baixar a imagem como buffer...');

      // Baixar a imagem como buffer para anexar ao Discord
      logger.debug('🔄 Iniciando download da imagem como buffer...');
      
      let imageBuffer: Buffer | null = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'ngrok-skip-browser-warning': 'true',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          logger.error('❌ Erro HTTP ao baixar imagem:', response.status, response.statusText);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = globalThis.Buffer.from(arrayBuffer);
        
        logger.info('✅ Imagem baixada com sucesso como buffer:', imageBuffer.length, 'bytes');
      } catch (error) {
        logger.error('❌ Erro ao baixar imagem como buffer:', error);
        imageBuffer = null;
      }
      
      logger.debug('📦 Buffer da imagem:', { 
        hasBuffer: !!imageBuffer, 
        bufferSize: imageBuffer?.length || 0 
      });

      const processedData: ProcessedLocalData = {
        imageUrl,
        imageBuffer,
        type: 'buffer',
        metadata: {
          model: request.model,
          provider: 'local-ai',
          executionTime,
          parameters: {
            size: `${request.width || 512}x${request.height || 512}`,
            steps: request.num_inference_steps || 20,
            cfg: request.guidance_scale || 7.5,
            seed: request.seed || null,
          },
          prompt: request.prompt,
          requestId: taskId,
        },
      };

      logger.success(`Geração local concluída em ${executionTime.toFixed(2)}s (tarefa: ${taskId})`);
      logger.image(`URL da imagem: ${imageUrl}`);
      return { data: processedData, monitor };

    } finally {
      // Parar monitoramento
      if (monitor) {
        monitor.stop();
      }
    }

  } catch (error) {
    const executionTime = (Date.now() - startTime) / 1000;
    
    let errorType: 'timeout' | 'api_error' | 'processing_failed' | 'cancelled' = 'api_error';
    let reason = 'Erro desconhecido na geração local';

    if (error instanceof Error) {
      if (error.message.includes('cancelada pelo usuário')) {
        errorType = 'cancelled';
        reason = 'Tarefa cancelada pelo usuário';
        logger.log(`🚫 Geração cancelada após ${executionTime.toFixed(2)}s: ${reason}`);
      } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        errorType = 'timeout';
        reason = `Timeout após ${executionTime.toFixed(2)}s`;
        logger.error(`❌ Falha na geração local após ${executionTime.toFixed(2)}s:`, reason);
      } else if (error.message.includes('falhou') || error.message.includes('failed')) {
        errorType = 'processing_failed';
        reason = error.message;
        logger.error(`❌ Falha na geração local após ${executionTime.toFixed(2)}s:`, reason);
      } else {
        reason = error.message;
        logger.error(`❌ Falha na geração local após ${executionTime.toFixed(2)}s:`, reason);
      }
    }

    return {
      data: {
        type: 'url',
        metadata: {
          model: request.model,
          provider: 'local-ai',
          executionTime,
          parameters: {
            size: `${request.width || 512}x${request.height || 512}`,
            steps: request.num_inference_steps || 20,
            cfg: request.guidance_scale || 7.5,
            seed: request.seed || null,
          },
          prompt: request.prompt,
          requestId: '',
        },
        error: {
          type: errorType,
          reason,
        },
      },
      monitor: null
    };
  }
}

/**
 * Baixa uma imagem do serviço Local AI e retorna como buffer
 * OTIMIZAÇÃO: Streaming não-bloqueante para melhor performance
 * @param imageUrl - URL da imagem a ser baixada
 * @returns Promise<Buffer | null> - Buffer da imagem ou null se falhou
 * @throws {StellaError} Quando há erro no download
 */
async function downloadImageAsBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    logger.debug('🔄 Tentando baixar imagem como buffer:', imageUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.HTTP_REQUEST);

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('❌ Erro HTTP ao baixar imagem:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // OTIMIZAÇÃO: Streaming não-bloqueante
    if (!response.body) {
      throw new Error('Response body não disponível para streaming');
    }

    logger.debug('📡 Iniciando streaming da imagem...');
    
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          logger.debug(`✅ Streaming concluído: ${totalSize} bytes`);
          break;
        }
        
        if (value) {
          chunks.push(value);
          totalSize += value.length;
          
          // Log progresso a cada 100KB
          if (totalSize % 100000 < value.length) {
            logger.debug(`📡 Download: ${Math.round(totalSize / 1024)}KB`);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Concatenar chunks eficientemente
    const totalBuffer = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const buffer = Buffer.from(totalBuffer);
    logger.info('✅ Imagem baixada com sucesso como buffer:', buffer.length, 'bytes');
    
    return buffer;
  } catch (error) {
    logger.error('❌ Erro ao baixar imagem como buffer:', error);
    return null;
  }
}

/**
 * Gera imagem usando o serviço local e retorna como buffer (para anexo)
 */
export async function generateImageLocalAsAttachment(
  request: LocalGenerationRequest,
  progressCallback?: ProgressCallback
): Promise<{ buffer: Buffer; metadata: any } | null> {
  const result = await generateImageLocalWithProgress(request, progressCallback);
  
  if (!result?.imageUrl) {
    return null;
  }

  const imageBuffer = await downloadImageAsBuffer(result.imageUrl);
  
  if (!imageBuffer) {
    return null;
  }

  return {
    buffer: imageBuffer,
    metadata: result.metadata,
  };
}

/**
 * Cancela uma tarefa de geração local
 */
export async function cancelLocalTask(taskId: string): Promise<boolean> {
  if (!LOCAL_AI_URL) {
    return false;
  }
  return await cancelTask(LOCAL_AI_URL, taskId);
}

/**
 * Gera imagem usando o serviço local (versão compatível anterior)
 */
export async function generateImageLocal(request: LocalGenerationRequest): Promise<ProcessedLocalData | null> {
  return await generateImageLocalWithProgress(request);
}

/**
 * Converte parâmetros do Discord para formato de requisição do Local AI
 * @param prompt - Texto do prompt para geração
 * @param model - Nome/slug do modelo a ser usado
 * @param options - Opções adicionais (width, height, steps, etc.)
 * @returns LocalGenerationRequest - Objeto formatado para o serviço Local AI
 * @example
 * ```typescript
 * const request = buildLocalRequest(
 *   "uma paisagem bonita", 
 *   "stable-diffusion-v1.5",
 *   { width: 1024, height: 1024, steps: 20 }
 * );
 * ```
 */
export function buildLocalRequest(
  prompt: string,
  model: string,
  options: Record<string, any> = {}
): LocalGenerationRequest {
  return {
    model,
    prompt,
    scheduler: options.scheduler,
    negative_prompt: options.negative_prompt,
    width: options.width,
    height: options.height,
    num_inference_steps: options.num_inference_steps,
    guidance_scale: options.guidance_scale,
    num_images_per_prompt: options.num_images_per_prompt || 1,
    seed: options.seed,
    eta: options.eta,
    enhance_sharpness: options.enhance_sharpness,
    enhance_contrast: options.enhance_contrast,
    enhance_color: options.enhance_color,
    enhance_brightness: options.enhance_brightness,
    apply_unsharp_mask: options.apply_unsharp_mask,
    use_attention_slicing: options.use_attention_slicing,
    use_cpu_offload: options.use_cpu_offload,
    use_vae_slicing: options.use_vae_slicing,
  };
}
