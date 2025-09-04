import { logger } from './logger.js';
import { config } from './config.js';

const n8nUrl = config.N8N_IMAGINE_URL;
const n8nUsername = config.N8N_USERNAME;
const n8nPassword = config.N8N_PASSWORD;

interface ImaginePayload {
  prompt: string;
  userId: string;
  channelId: string;
  isSuperUser?: boolean; // Flag para indicar se é super user
}

interface ImageResponse {
  prompt: string;
  image: string;
  timings: {
    inference: number | null;
  };
  model: string;
  params: {
    seed: number | null;
    cfg: number;
    size: string;
    steps: number;
  };
  requestId: string;
  provider: string;
  type: 'url' | 'base64';
  meta: {
    index?: number;
    reason?: string; // Campo para motivo de erro/rejeição
  };
}

interface ProcessedImageData {
  imageBuffer: Buffer | null;
  imageUrl?: string;
  type: 'url' | 'base64';
  metadata: {
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
  };
  error?: {
    type: 'content_policy_violation' | 'api_error';
    reason: string;
  };
}

function handleHttpError(response: Response, executionTimeSeconds: number): void {
  const errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`;
  
  logger.error(`Erro na chamada ao n8n após ${executionTimeSeconds.toFixed(2)}s: ${errorMessage}`);
  
  // Casos específicos
  if (response.status === 504) {
    logger.error('Gateway Timeout detectado - n8n demorou muito para responder');
  } else if (response.status >= 500) {
    logger.error('Erro interno do servidor n8n');
  } else if (response.status === 429) {
    logger.error('Rate limit atingido no n8n');
  }
}

function processImageBase64(base64Image: string): Buffer | null {
  try {
    let base64Data = base64Image;
    
    // Verificar se é um JSON com campo b64_json
    try {
      const parsedJson = JSON.parse(base64Data);
      if (parsedJson.b64_json) {
        base64Data = parsedJson.b64_json;
      }
    } catch {
      // Se não for JSON válido, usar como está
    }

    // Remover prefixo data:image se existir
    base64Data = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    return Buffer.from(base64Data, 'base64');
  } catch (error) {
    logger.error('Erro ao decodificar imagem base64:', error);
    return null;
  }
}

export async function generateImage(payload: ImaginePayload): Promise<ProcessedImageData | null> {
  if (!n8nUrl || !n8nUsername || !n8nPassword) {
    logger.error('As variáveis de ambiente N8N_IMAGINE_URL, N8N_USERNAME e N8N_PASSWORD são obrigatórias para gerar imagens.');
    return null;
  }

  const startTime = Date.now(); // Início do timer

  try {
    const credentials = Buffer.from(`${n8nUsername}:${n8nPassword}`).toString('base64');

    const logMessage = payload.isSuperUser 
      ? `👑 Super User enviando prompt para o n8n: "${payload.prompt}"` 
      : `Enviando prompt para o n8n: "${payload.prompt}"`;
    logger.log(logMessage);
    
    // AbortController para controlar timeout de 2 minutos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutos

    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId); // Limpar timeout se a resposta chegou

    if (!response.ok) {
      const executionTimeMs = Date.now() - startTime;
      const executionTimeSeconds = executionTimeMs / 1000;
      
      handleHttpError(response, executionTimeSeconds);
      return null;
    }

    let responseData;
    try {
      responseData = await response.json();
    } catch (parseError) {
      logger.error('Erro ao parsear resposta JSON do n8n:', parseError);
      return null;
    }
    
    // Calcular tempo de execução real
    const executionTimeMs = Date.now() - startTime;
    const executionTimeSeconds = executionTimeMs / 1000;
    
    // Log para debug da estrutura da resposta
    logger.log('Resposta do n8n:', JSON.stringify(responseData, null, 2));
    
    if (!responseData) {
      logger.error('Resposta vazia do n8n');
      return null;
    }

    // Tratar resposta inconsistente: aceitar tanto objeto quanto array
    // Em caso de array, o objeto sempre estará no primeiro item
    if (Array.isArray(responseData) && responseData.length > 0) {
      logger.log('Resposta do n8n veio como array, extraindo primeiro item');
      responseData = responseData[0];
    } else if (Array.isArray(responseData) && responseData.length === 0) {
      logger.error('Resposta do n8n veio como array vazio');
      return null;
    }

    // Verificar se há erro de violação de diretrizes
    if (responseData.meta?.reason) {
      logger.error('Prompt rejeitado pela API:', responseData.meta.reason);
      
      return {
        imageBuffer: null,
        type: 'url',
        metadata: {
          model: responseData.model || 'unknown',
          provider: responseData.provider || 'unknown',
          executionTime: executionTimeSeconds,
          parameters: {
            size: responseData.params?.size || 'unknown',
            steps: responseData.params?.steps || 0,
            cfg: responseData.params?.cfg || 0,
            seed: responseData.params?.seed || null,
          },
          prompt: responseData.prompt || payload.prompt,
          requestId: responseData.requestId || '',
        },
        error: {
          type: 'content_policy_violation',
          reason: responseData.meta.reason,
        },
      };
    }

    // Validar estrutura mínima necessária
    if (!responseData.image || !responseData.model || !responseData.type) {
      logger.error('Resposta do n8n com estrutura inválida - campos obrigatórios ausentes:', responseData);
      return null;
    }

    // A resposta já vem com a estrutura direta, sem wrapper 'output'
    const imageData: ImageResponse = responseData;
    
    // Processar imagem baseado no tipo
    let imageBuffer: Buffer | null = null;
    let imageUrl: string | undefined = undefined;

    if (imageData.type === 'url') {
      // Para URLs, apenas armazenar a URL sem baixar
      imageUrl = imageData.image;
    } else if (imageData.type === 'base64') {
      // Para base64, decodificar para buffer
      imageBuffer = processImageBase64(imageData.image);
    }

    const processedData: ProcessedImageData = {
      imageBuffer,
      imageUrl,
      type: imageData.type,
      metadata: {
        model: imageData.model,
        provider: imageData.provider,
        executionTime: executionTimeSeconds, // Usar nosso timer em vez da API
        parameters: {
          size: imageData.params.size,
          steps: imageData.params.steps,
          cfg: imageData.params.cfg,
          seed: imageData.params.seed,
        },
        prompt: imageData.prompt,
        requestId: imageData.requestId,
      },
    };

    logger.log(`Imagem processada com sucesso. Modelo: ${imageData.model}, Provider: ${imageData.provider}, Tempo real: ${executionTimeSeconds.toFixed(2)}s`);
    return processedData;

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const executionTimeSeconds = executionTimeMs / 1000;
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(`Timeout na chamada ao n8n (2 minutos). Tempo decorrido: ${executionTimeSeconds.toFixed(2)}s`);
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      logger.error('Erro de conexão com o n8n (rede/conectividade):', error.message);
    } else {
      logger.error('Falha ao comunicar com o n8n:', error);
    }
    
    return null;
  }
}
