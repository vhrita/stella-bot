import { logger } from './logger.js';
import { ErrorHandler, ErrorCategory, ErrorCode, StellaError } from './error-handler.js';

// OTIMIZAÇÃO FASE 2: Cache de Validação JSON Schema
interface JSONValidationCache {
  hash: string;
  isValid: boolean;
  timestamp: number;
}

/**
 * Cliente HTTP centralizado para eliminar duplicação de código
 * entre local-ai.ts e n8n.ts
 */
export class StellaHttpClient {
  
  // OTIMIZAÇÃO FASE 2: Cache para validação de JSON
  private static readonly jsonValidationCache = new Map<string, JSONValidationCache>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  private static readonly MAX_CACHE_SIZE = 100;

  // OTIMIZAÇÃO FASE 2: Configuração de Retry
  private static readonly RETRY_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000, // 1s
    maxDelay: 5000,  // 5s
    retryableStatusCodes: new Set([408, 429, 500, 502, 503, 504]),
    retryableErrors: new Set(['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'])
  };

  /**
   * OTIMIZAÇÃO: Gera hash simples para caching
   */
  private static generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converter para 32bit integer
    }
    return hash.toString();
  }

  /**
   * OTIMIZAÇÃO: Limpa cache expirado
   */
  private static cleanupValidationCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.jsonValidationCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.jsonValidationCache.delete(key);
      }
    }
    
    // Limitar tamanho do cache
    if (this.jsonValidationCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.jsonValidationCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remover 20% dos mais antigos
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.jsonValidationCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * OTIMIZAÇÃO: Validação de JSON com cache
   */
  private static isValidJSONCached(text: string): boolean {
    const hash = this.generateHash(text);
    const cached = this.jsonValidationCache.get(hash);
    
    // Verificar cache válido
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.isValid;
    }
    
    // Validar e cachear
    let isValid = false;
    try {
      JSON.parse(text);
      isValid = true;
    } catch {
      isValid = false;
    }
    
    // Limpar cache periodicamente
    if (this.jsonValidationCache.size > this.MAX_CACHE_SIZE * 0.8) {
      this.cleanupValidationCache();
    }
    
    // Cachear resultado
    this.jsonValidationCache.set(hash, {
      hash,
      isValid,
      timestamp: Date.now()
    });
    
    return isValid;
  }
  
  /**
   * OTIMIZAÇÃO FASE 2: Verifica se erro é retryable
   */
  private static isRetryableError(error: unknown, response?: Response): boolean {
    // Verificar status HTTP
    if (response && this.RETRY_CONFIG.retryableStatusCodes.has(response.status)) {
      return true;
    }
    
    // Verificar códigos de erro de rede
    if (error && typeof error === 'object' && 'code' in error && 
        typeof error.code === 'string' && this.RETRY_CONFIG.retryableErrors.has(error.code)) {
      return true;
    }
    
    // Verificar timeout
    if (error && typeof error === 'object' && 
        (('name' in error && error.name === 'AbortError') || 
         ('message' in error && typeof error.message === 'string' && error.message.includes('timeout')))) {
      return true;
    }
    
    return false;
  }

  /**
   * OTIMIZAÇÃO FASE 2: Delay exponencial com jitter
   */
  private static async delay(attempt: number): Promise<void> {
    const exponentialDelay = Math.min(
      this.RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
      this.RETRY_CONFIG.maxDelay
    );
    
    // Adicionar jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const finalDelay = exponentialDelay + jitter;
    
    return new Promise(resolve => setTimeout(resolve, finalDelay));
  }

  /**
   * Fetch com tratamento de erro padronizado e retry automático
   * OTIMIZAÇÃO FASE 2: Sistema de retry com backoff exponencial
   */
  static async fetchWithErrorHandling(
    url: string, 
    options: RequestInit = {},
    context = 'HTTP Request',
    enableRetry = true
  ): Promise<Response> {
    let lastError: any;
    let response: Response | undefined;
    
    const maxAttempts = enableRetry ? this.RETRY_CONFIG.maxRetries + 1 : 1;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await fetch(url, options);
        
        if (!response.ok) {
          // Verificar se deve tentar novamente
          if (attempt < maxAttempts && this.isRetryableError(null, response)) {
            logger.warn(`Tentativa ${attempt}/${maxAttempts} falhou (HTTP ${response.status}), tentando novamente...`);
            await this.delay(attempt);
            continue;
          }
          
          await this.handleHttpError(response, context);
        }
        
        // Sucesso
        if (attempt > 1) {
          logger.info(`✅ Sucesso na tentativa ${attempt}/${maxAttempts}`);
        }
        
        return response;
      } catch (error) {
        lastError = error;
        
        // Verificar se deve tentar novamente
        if (attempt < maxAttempts && this.isRetryableError(error, response)) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(`Tentativa ${attempt}/${maxAttempts} falhou: ${errorMsg}, tentando novamente...`);
          await this.delay(attempt);
          continue;
        }
        
        // Não é retryable ou esgotaram as tentativas
        break;
      }
    }
    
    // Falhou em todas as tentativas
    throw ErrorHandler.normalize(lastError, { 
      operation: context, 
      serviceUrl: url,
      additionalData: { 
        method: options.method || 'GET',
        attempts: maxAttempts,
        finalError: lastError?.message
      }
    });
  }

  /**
   * Fetch JSON com tipagem e tratamento de erro
   * OTIMIZAÇÃO FASE 2: Validação JSON com cache
   */
  static async fetchJSON<T>(
    url: string, 
    options: RequestInit = {},
    context = 'JSON Request'
  ): Promise<T> {
    const response = await this.fetchWithErrorHandling(url, options, context);
    
    try {
      const text = await response.text();
      
      // OTIMIZAÇÃO: Usar cache de validação JSON
      if (!this.isValidJSONCached(text)) {
        throw new Error('Resposta não é um JSON válido');
      }
      
      return JSON.parse(text) as T;
    } catch (parseError) {
      logger.error(`Erro ao parsear JSON de ${url}:`, parseError);
      throw new StellaError(
        'Resposta inválida do servidor',
        ErrorCategory.VALIDATION,
        ErrorCode.INVALID_PARAMETERS,
        { serviceUrl: url, operation: context, additionalData: { parseError } }
      );
    }
  }

  /**
   * Fetch com timeout customizado
   */
  static async fetchWithTimeout(
    url: string, 
    options: RequestInit = {},
    timeoutMs = 30000,
    context = 'Timeout Request'
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchWithErrorHandling(url, {
        ...options,
        signal: controller.signal
      }, context);
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new StellaError(
          `Timeout após ${timeoutMs}ms`,
          ErrorCategory.TIMEOUT,
          ErrorCode.REQUEST_TIMEOUT,
          { serviceUrl: url, operation: context, additionalData: { timeoutMs } }
        );
      }
      
      throw error;
    }
  }

  /**
   * Busca dados como ArrayBuffer (para imagens)
   */
  static async fetchBuffer(
    url: string, 
    options: RequestInit = {},
    context = 'Buffer Request'
  ): Promise<Buffer> {
    const response = await this.fetchWithErrorHandling(url, options, context);
    
    try {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (bufferError) {
      logger.error(`Erro ao converter buffer de ${url}:`, bufferError);
      throw new StellaError(
        'Erro ao processar dados binários',
        ErrorCategory.RESOURCE,
        ErrorCode.FILE_NOT_FOUND,
        { serviceUrl: url, operation: context, additionalData: { bufferError } }
      );
    }
  }

  /**
   * Health check padronizado
   */
  static async healthCheck(
    baseUrl: string,
    endpoint = '/health',
    timeoutMs = 5000
  ): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${baseUrl}${endpoint}`,
        { method: 'GET' },
        timeoutMs,
        'Health Check'
      );
      
      return response.ok;
    } catch (error) {
      logger.debug(`Health check falhou para ${baseUrl}:`, error);
      return false;
    }
  }

  /**
   * Trata erros HTTP de forma padronizada
   */
  private static async handleHttpError(response: Response, context: string): Promise<never> {
    let errorText: string;
    
    try {
      errorText = await response.text();
    } catch {
      errorText = `HTTP ${response.status}: ${response.statusText}`;
    }

    const errorMessage = `${context} falhou: ${errorText}`;
    
    // Log específico baseado no status
    if (response.status === 504) {
      logger.network('Gateway Timeout detectado', { url: response.url, status: response.status });
    } else if (response.status >= 500) {
      logger.network('Erro interno do servidor', { url: response.url, status: response.status });
    } else if (response.status === 429) {
      logger.network('Rate limit atingido', { url: response.url, status: response.status });
    } else if (response.status === 404) {
      logger.network('Endpoint não encontrado', { url: response.url, status: response.status });
    }

    // Determinar categoria do erro
    let category: ErrorCategory;
    let code: ErrorCode;

    if (response.status >= 500) {
      category = ErrorCategory.NETWORK;
      code = ErrorCode.SERVICE_UNAVAILABLE;
    } else if (response.status === 429) {
      category = ErrorCategory.RESOURCE;
      code = ErrorCode.STORAGE_FULL; // Usando como proxy para rate limit
    } else if (response.status === 404) {
      category = ErrorCategory.RESOURCE;
      code = ErrorCode.FILE_NOT_FOUND;
    } else if (response.status === 401 || response.status === 403) {
      category = ErrorCategory.PERMISSION;
      code = ErrorCode.INSUFFICIENT_PERMISSIONS;
    } else {
      category = ErrorCategory.NETWORK;
      code = ErrorCode.HTTP_ERROR;
    }

    throw new StellaError(errorMessage, category, code, {
      statusCode: response.status,
      response: response.statusText,
      serviceUrl: response.url,
      operation: context,
      additionalData: { errorText }
    });
  }

  /**
   * Cria headers de autenticação básica
   */
  static createBasicAuthHeaders(username: string, password: string): Record<string, string> {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Cria headers JSON padrão
   */
  static createJSONHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Combina múltiplos conjuntos de headers
   */
  static combineHeaders(...headerSets: Record<string, string>[]): Record<string, string> {
    return Object.assign({}, ...headerSets);
  }
}
