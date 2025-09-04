/**
 * Sistema de logging unificado para Stella Bot
 * Fornece logging temático com emojis e cores para melhor legibilidade
 */

// Níveis de log com prioridade numérica
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

// Configuração de temas visuais com emojis específicos
const themes = {
  prefix: "☀️✨ ",
  debug: "🔍 ",
  info: "ℹ️ ",
  warn: "⚠️ ",
  error: "❌ ",
  fatal: "💀 ",
  success: "✅ ",
  progress: "📊 ",
  websocket: "🔌 ",
  task: "📋 ",
  image: "🖼️ ",
  timeout: "⏱️ ",
  network: "🌐 ",
  config: "🔧 ",
  discord: "📱 ",
  ai: "🤖 "
};

// Cores ANSI para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  emoji?: string;
}

interface BatchConfig {
  maxSize: number;
  flushInterval: number;
  enabled: boolean;
}

class StellaLogger {
  private currentLevel: LogLevel;
  private readonly enableColors: boolean;
  private readonly enableTimestamp: boolean;
  
  // OTIMIZAÇÃO FASE 2: Sistema de Log Batching
  private readonly logBatch: LogEntry[] = [];
  private readonly batchConfig: BatchConfig;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Configurar nível baseado no ambiente
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.currentLevel = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
    
    // Desabilitar cores em produção ou se especificado
    this.enableColors = process.env.NODE_ENV !== 'production' && process.env.NO_COLOR !== 'true';
    this.enableTimestamp = process.env.LOG_TIMESTAMP !== 'false';
    
    // OTIMIZAÇÃO: Configurar batching baseado no ambiente
    this.batchConfig = {
      maxSize: parseInt(process.env.LOG_BATCH_SIZE || '10'),
      flushInterval: parseInt(process.env.LOG_BATCH_INTERVAL || '1000'), // 1s
      enabled: process.env.LOG_BATCHING !== 'false' && process.env.NODE_ENV === 'production'
    };
    
    // Iniciar timer de flush periódico
    if (this.batchConfig.enabled) {
      this.startBatchTimer();
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  private formatTimestamp(): string {
    if (!this.enableTimestamp) return '';
    return colors.gray + new Date().toISOString().slice(11, 23) + colors.reset + ' ';
  }

  private colorize(text: string, color: string): string {
    if (!this.enableColors) return text;
    return color + text + colors.reset;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = this.formatTimestamp();
    const emoji = entry.emoji || '';
    const levelText = LogLevel[entry.level].padEnd(5);
    
    let levelColor = colors.white;
    switch (entry.level) {
      case LogLevel.DEBUG: levelColor = colors.gray; break;
      case LogLevel.INFO: levelColor = colors.blue; break;
      case LogLevel.WARN: levelColor = colors.yellow; break;
      case LogLevel.ERROR: levelColor = colors.red; break;
      case LogLevel.FATAL: levelColor = colors.magenta; break;
    }

    const level = this.colorize(levelText, levelColor);
    const context = entry.context ? this.colorize(`[${entry.context}]`, colors.cyan) + ' ' : '';
    
    return `${timestamp}${emoji}${level} ${context}${entry.message}`;
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    // OTIMIZAÇÃO FASE 2: Log Batching para produção
    if (this.batchConfig.enabled) {
      this.addToBatch(entry);
    } else {
      this.flushEntry(entry);
    }
  }

  /**
   * OTIMIZAÇÃO: Adiciona log ao batch e flush se necessário
   */
  private addToBatch(entry: LogEntry): void {
    this.logBatch.push(entry);
    
    // Flush imediato para logs críticos
    if (entry.level >= LogLevel.ERROR) {
      this.flushBatch();
      return;
    }
    
    // Flush se batch atingiu tamanho máximo
    if (this.logBatch.length >= this.batchConfig.maxSize) {
      this.flushBatch();
    }
  }

  /**
   * OTIMIZAÇÃO: Inicia timer periódico para flush
   */
  private startBatchTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      if (this.logBatch.length > 0) {
        this.flushBatch();
      }
    }, this.batchConfig.flushInterval);
  }

  /**
   * OTIMIZAÇÃO: Flush do batch de logs
   */
  private flushBatch(): void {
    if (this.logBatch.length === 0) return;
    
    const batchToFlush = this.logBatch.splice(0);
    
    // Agrupar por nível para otimizar output
    const errorLogs = batchToFlush.filter(entry => entry.level >= LogLevel.ERROR);
    const regularLogs = batchToFlush.filter(entry => entry.level < LogLevel.ERROR);
    
    // Flush logs regulares
    if (regularLogs.length > 0) {
      const formatted = regularLogs.map(entry => this.formatMessage(entry));
      console.log(formatted.join('\n'));
    }
    
    // Flush logs de erro
    if (errorLogs.length > 0) {
      const formatted = errorLogs.map(entry => this.formatMessage(entry));
      console.error(formatted.join('\n'));
    }
  }

  /**
   * Flush individual para modo desenvolvimento
   */
  private flushEntry(entry: LogEntry): void {
    const formatted = this.formatMessage(entry);
    
    // Escolher método de output baseado no nível
    const output = entry.level >= LogLevel.ERROR ? console.error : console.log;
    
    if (entry.data) {
      output(formatted, entry.data);
    } else {
      output(formatted);
    }
  }

  // Métodos públicos com diferentes níveis
  debug(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
      data,
      emoji: themes.debug
    });
  }

  info(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.info
    });
  }

  warn(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context,
      data,
      emoji: themes.warn
    });
  }

  error(message: string, error?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context,
      data: error,
      emoji: themes.error
    });
  }

  fatal(message: string, error?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.FATAL,
      message,
      context,
      data: error,
      emoji: themes.fatal
    });
  }

  // Métodos especializados com emojis temáticos
  success(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.success
    });
  }

  progress(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.progress
    });
  }

  websocket(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
      data,
      emoji: themes.websocket
    });
  }

  task(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.task
    });
  }

  image(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.image
    });
  }

  timeout(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
      data,
      emoji: themes.timeout
    });
  }

  network(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
      data,
      emoji: themes.network
    });
  }

  configLog(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.config
    });
  }

  discord(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.discord
    });
  }

  ai(message: string, data?: any, context?: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
      data,
      emoji: themes.ai
    });
  }

  // Método compatível com o logger antigo
  log(message: string, ...args: any[]): void {
    const data = args.length > 0 ? args : undefined;
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message: typeof message === 'string' ? message : String(message),
      data,
      emoji: themes.prefix
    });
  }

  // Métodos utilitários
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  // Método para performance timing
  time(label: string): void {
    console.time(this.colorize(`⏱️ ${label}`, colors.cyan));
  }

  timeEnd(label: string): void {
    console.timeEnd(this.colorize(`⏱️ ${label}`, colors.cyan));
  }

  /**
   * OTIMIZAÇÃO FASE 2: Cleanup de recursos
   */
  cleanup(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Flush final do batch
    if (this.logBatch.length > 0) {
      this.flushBatch();
    }
  }
}

// Instância singleton
export const logger = new StellaLogger();

// Exportar para compatibilidade
export default logger;
