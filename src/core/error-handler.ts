import { logger } from './logger.js';

// Enum para categorias de erro
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK', 
  AI_SERVICE = 'AI_SERVICE',
  DISCORD = 'DISCORD',
  CONFIG = 'CONFIG',
  TIMEOUT = 'TIMEOUT',
  PERMISSION = 'PERMISSION',
  RESOURCE = 'RESOURCE',
  USER_INPUT = 'USER_INPUT',
  INTERNAL = 'INTERNAL'
}

// Enum para códigos de erro específicos
export enum ErrorCode {
  // Validation errors
  INVALID_PROMPT = 'INVALID_PROMPT',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Network errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  HTTP_ERROR = 'HTTP_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // AI Service errors
  AI_GENERATION_FAILED = 'AI_GENERATION_FAILED',
  AI_MODEL_NOT_FOUND = 'AI_MODEL_NOT_FOUND',
  AI_QUEUE_FULL = 'AI_QUEUE_FULL',
  AI_OUT_OF_MEMORY = 'AI_OUT_OF_MEMORY',
  AI_TASK_CANCELLED = 'AI_TASK_CANCELLED',

  // Discord errors
  DISCORD_API_ERROR = 'DISCORD_API_ERROR',
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  INTERACTION_FAILED = 'INTERACTION_FAILED',

  // Config errors
  MISSING_CONFIG = 'MISSING_CONFIG',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // Permission errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  CHANNEL_RESTRICTED = 'CHANNEL_RESTRICTED',

  // Resource errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  STORAGE_FULL = 'STORAGE_FULL',

  // Internal errors
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR'
}

// Interface para contexto de erro
export interface ErrorContext {
  userId?: string;
  channelId?: string;
  guildId?: string;
  taskId?: string;
  modelName?: string;
  prompt?: string;
  timestamp?: Date;
  statusCode?: number;
  response?: string;
  field?: string;
  value?: unknown;
  attempt?: number;
  serviceUrl?: string;
  operation?: string;
  additionalData?: Record<string, unknown>;
}

// Classe base para erros padronizados
export class StellaError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly userMessage: string;
  public readonly isRetryable: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    code: ErrorCode,
    context: ErrorContext = {},
    options: {
      userMessage?: string;
      isRetryable?: boolean;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    
    this.name = 'StellaError';
    this.category = category;
    this.code = code;
    this.context = { ...context, timestamp: new Date() };
    this.timestamp = new Date();
    this.userMessage = options.userMessage || this.getDefaultUserMessage();
    this.isRetryable = options.isRetryable ?? this.getDefaultRetryable();
    this.originalError = options.originalError;

    // Preservar stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StellaError);
    }
  }

  private getDefaultUserMessage(): string {
    switch (this.category) {
      case ErrorCategory.NETWORK:
        return 'Falha na conexão com o serviço. Tente novamente em alguns instantes.';
      case ErrorCategory.AI_SERVICE:
        return 'Erro na geração de imagem. Tente com um prompt mais simples.';
      case ErrorCategory.TIMEOUT:
        return 'A operação demorou muito para ser concluída. Tente novamente.';
      case ErrorCategory.VALIDATION:
        return 'Parâmetros inválidos fornecidos.';
      case ErrorCategory.PERMISSION:
        return 'Você não tem permissão para executar esta ação.';
      case ErrorCategory.RESOURCE:
        return 'Recurso não encontrado ou indisponível.';
      default:
        return 'Ocorreu um erro inesperado. Nossa equipe foi notificada.';
    }
  }

  private getDefaultRetryable(): boolean {
    switch (this.category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.RESOURCE:
        return true;
      case ErrorCategory.VALIDATION:
      case ErrorCategory.PERMISSION:
      case ErrorCategory.CONFIG:
        return false;
      default:
        return false;
    }
  }

  // Método para logging estruturado
  public log(): void {
    const logData = {
      category: this.category,
      code: this.code,
      context: this.context,
      originalError: this.originalError?.message,
      stack: this.stack
    };

    switch (this.category) {
      case ErrorCategory.NETWORK:
        logger.network(`[${this.code}] ${this.message}`, logData);
        break;
      case ErrorCategory.AI_SERVICE:
        logger.ai(`[${this.code}] ${this.message}`, logData);
        break;
      case ErrorCategory.DISCORD:
        logger.discord(`[${this.code}] ${this.message}`, logData);
        break;
      case ErrorCategory.CONFIG:
        logger.configLog(`[${this.code}] ${this.message}`, logData);
        break;
      case ErrorCategory.TIMEOUT:
        logger.timeout(`[${this.code}] ${this.message}`, logData);
        break;
      default:
        logger.error(`[${this.code}] ${this.message}`, logData);
    }
  }

  // Converter para JSON para logging/monitoramento
  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      userMessage: this.userMessage,
      isRetryable: this.isRetryable,
      originalError: this.originalError?.message,
      stack: this.stack
    };
  }
}

// Classe especializada para erros de rede
export class NetworkError extends StellaError {
  constructor(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {},
    options: {
      statusCode?: number;
      response?: string;
      originalError?: Error;
    } = {}
  ) {
    super(
      message,
      ErrorCategory.NETWORK,
      code,
      { ...context, statusCode: options.statusCode, response: options.response },
      { originalError: options.originalError, isRetryable: true }
    );
  }
}

// Classe especializada para erros de IA
export class AIServiceError extends StellaError {
  constructor(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {},
    options: {
      modelName?: string;
      taskId?: string;
      originalError?: Error;
    } = {}
  ) {
    super(
      message,
      ErrorCategory.AI_SERVICE,
      code,
      { ...context, modelName: options.modelName, taskId: options.taskId },
      { originalError: options.originalError }
    );
  }
}

// Classe especializada para erros de validação
export class ValidationError extends StellaError {
  constructor(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {},
    options: {
      field?: string;
      value?: unknown;
      originalError?: Error;
    } = {}
  ) {
    super(
      message,
      ErrorCategory.VALIDATION,
      code,
      { ...context, field: options.field, value: options.value },
      { originalError: options.originalError, isRetryable: false }
    );
  }
}

// Sistema de error handling centralizado
export class ErrorHandler {
  // Manipular erros não capturados
  public static setupGlobalHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      const stellaError = new StellaError(
        'Uncaught exception',
        ErrorCategory.INTERNAL,
        ErrorCode.UNEXPECTED_ERROR,
        {},
        { originalError: error }
      );
      stellaError.log();
      logger.fatal('Uncaught exception - aplicação será encerrada', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const stellaError = new StellaError(
        'Unhandled promise rejection',
        ErrorCategory.INTERNAL,
        ErrorCode.UNEXPECTED_ERROR,
        {},
        { originalError: error }
      );
      stellaError.log();
      logger.fatal('Unhandled promise rejection', error);
    });
  }

  // Converter erros genéricos em StellaError
  public static normalize(error: unknown, context: ErrorContext = {}): StellaError {
    if (error instanceof StellaError) {
      return error;
    }

    if (error instanceof Error) {
      // Detectar tipos específicos de erro baseado na mensagem
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        return new NetworkError(
          error.message,
          ErrorCode.REQUEST_TIMEOUT,
          context,
          { originalError: error }
        );
      }

      if (error.message.includes('network') || error.message.includes('fetch')) {
        return new NetworkError(
          error.message,
          ErrorCode.CONNECTION_FAILED,
          context,
          { originalError: error }
        );
      }

      if (error.message.includes('CUDA out of memory')) {
        return new AIServiceError(
          error.message,
          ErrorCode.AI_OUT_OF_MEMORY,
          context,
          { originalError: error }
        );
      }

      if (error.message.includes('cancelled') || error.message.includes('canceled')) {
        return new AIServiceError(
          error.message,
          ErrorCode.AI_TASK_CANCELLED,
          context,
          { originalError: error }
        );
      }

      // Erro genérico
      return new StellaError(
        error.message,
        ErrorCategory.INTERNAL,
        ErrorCode.UNEXPECTED_ERROR,
        context,
        { originalError: error }
      );
    }

    // Erro não é instância de Error
    return new StellaError(
      String(error),
      ErrorCategory.INTERNAL,
      ErrorCode.UNEXPECTED_ERROR,
      context
    );
  }

  // Manipular erro em comando Discord
  public static async handleCommandError(
    error: unknown,
    interaction: any,
    context: ErrorContext = {}
  ): Promise<void> {
    const stellaError = this.normalize(error, {
      ...context,
      userId: interaction.user?.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId
    });

    stellaError.log();

    try {
      const errorEmbed = {
        color: 0xff0000,
        title: '❌ Erro',
        description: stellaError.userMessage,
        footer: {
          text: stellaError.isRetryable ? 'Você pode tentar novamente' : 'Contate o suporte se o problema persistir'
        },
        timestamp: new Date().toISOString()
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      logger.error('Falha ao enviar mensagem de erro para o usuário', replyError);
    }
  }

  // Retry automatico para operações retriables
  public static async withRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: StellaError | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.normalize(error, { ...context, attempt });
        
        if (!lastError.isRetryable || attempt === maxRetries) {
          throw lastError;
        }

        logger.warn(
          `Tentativa ${attempt}/${maxRetries} falhou, tentando novamente em ${delayMs}ms`,
          { error: lastError.code, context }
        );

        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    throw lastError || new StellaError(
      'Operação falhou após múltiplas tentativas',
      ErrorCategory.INTERNAL,
      ErrorCode.UNEXPECTED_ERROR,
      context
    );
  }
}

// Funções utilitárias para criação rápida de erros
export const createError = {
  network: (message: string, code: ErrorCode, context?: ErrorContext, options?: any) =>
    new NetworkError(message, code, context, options),
    
  ai: (message: string, code: ErrorCode, context?: ErrorContext, options?: any) =>
    new AIServiceError(message, code, context, options),
    
  validation: (message: string, code: ErrorCode, context?: ErrorContext, options?: any) =>
    new ValidationError(message, code, context, options),
    
  generic: (message: string, category: ErrorCategory, code: ErrorCode, context?: ErrorContext, options?: any) =>
    new StellaError(message, category, code, context, options)
};

// Exportar handler global
export const errorHandler = ErrorHandler;
