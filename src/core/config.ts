import { z } from 'zod';
import { logger } from './logger.js';

// Schema de validação para todas as variáveis de ambiente
const envSchema = z.object({
  // Discord Bot - OBRIGATÓRIAS
  DISCORD_TOKEN: z.string().min(50, 'Token do Discord deve ter pelo menos 50 caracteres'),
  DISCORD_APP_ID: z.string().min(17, 'App ID do Discord deve ter pelo menos 17 caracteres'),
  
  // Discord Bot - OPCIONAIS
  DEV_GUILD_ID: z.string().optional(),
  RESTRICT_TO_CHANNEL_ID: z.string().optional(),
  SUPER_USERS: z.string().optional(),

  // Local AI - OPCIONAIS
  LOCAL_AI_URL: z.string().optional().refine(val => !val || /^https?:\/\//.test(val), {
    message: 'LOCAL_AI_URL deve ser uma URL válida'
  }),

  // N8N Fallback - OPCIONAIS (mas recomendadas para fallback)
  N8N_IMAGINE_URL: z.string().optional().refine(val => !val || /^https?:\/\//.test(val), {
    message: 'N8N_IMAGINE_URL deve ser uma URL válida'
  }),
  N8N_USERNAME: z.string().optional(),
  N8N_PASSWORD: z.string().optional(),

  // Timeouts Dinâmicos - COM DEFAULTS SEGUROS
  AI_TIMEOUT_BASE: z.coerce.number()
    .min(30, 'Timeout base deve ser pelo menos 30 segundos')
    .max(7200, 'Timeout base deve ser no máximo 2 horas')
    .default(1800), // 30 minutos

  AI_TIMEOUT_PER_STEP: z.coerce.number()
    .min(1, 'Timeout por step deve ser pelo menos 1 segundo')
    .max(120, 'Timeout por step deve ser no máximo 2 minutos')
    .default(20), // 20 segundos

  AI_TIMEOUT_PER_MP: z.coerce.number()
    .min(10, 'Timeout por megapixel deve ser pelo menos 10 segundos')
    .max(600, 'Timeout por megapixel deve ser no máximo 10 minutos')
    .default(90), // 90 segundos

  AI_TIMEOUT_HIGH_CFG: z.coerce.number()
    .min(0, 'Penalidade CFG não pode ser negativa')
    .max(300, 'Penalidade CFG deve ser no máximo 5 minutos')
    .default(45), // 45 segundos

  AI_TIMEOUT_MAX: z.coerce.number()
    .min(300, 'Timeout máximo deve ser pelo menos 5 minutos')
    .max(14400, 'Timeout máximo deve ser no máximo 4 horas')
    .default(7200), // 2 horas
});

// Tipo inferido do schema para type safety
export type Config = z.infer<typeof envSchema>;

// Função para validar e carregar configuração
function loadConfig(): Config {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Log de configuração carregada (sem expor secrets)
    logger.success('Configuração validada com sucesso:');
    logger.configLog(`Discord App ID: ${parsed.DISCORD_APP_ID}`);
    logger.configLog(`Guild ID: ${parsed.DEV_GUILD_ID || 'global'}`);
    logger.configLog(`Local AI: ${parsed.LOCAL_AI_URL ? '✅ configurado' : '❌ não configurado'}`);
    logger.configLog(`N8N Fallback: ${parsed.N8N_IMAGINE_URL ? '✅ configurado' : '❌ não configurado'}`);
    logger.configLog(`Timeouts: Base ${parsed.AI_TIMEOUT_BASE}s, Max ${parsed.AI_TIMEOUT_MAX}s`);
    
    // Validações de consistência
    if (parsed.AI_TIMEOUT_BASE > parsed.AI_TIMEOUT_MAX) {
      throw new Error('AI_TIMEOUT_BASE não pode ser maior que AI_TIMEOUT_MAX');
    }

    // Warnings para configurações ausentes
    if (!parsed.LOCAL_AI_URL && !parsed.N8N_IMAGINE_URL) {
      logger.warn('Nem LOCAL_AI_URL nem N8N_IMAGINE_URL configurados. Bot não poderá gerar imagens!');
    }

    if (!parsed.SUPER_USERS) {
      logger.info('SUPER_USERS não definido - todas as restrições aplicam-se a todos os usuários');
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('❌ Erro de validação da configuração:', error.issues);
      console.error('\n🔧 Variáveis com problemas:');
      error.issues.forEach((issue: any) => {
        console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
      });
      
      logger.error('\n📋 Variáveis obrigatórias:');
      logger.error('   • DISCORD_TOKEN=seu_token_aqui');
      logger.error('   • DISCORD_APP_ID=seu_app_id_aqui');
      
      logger.error('\n📋 Configuração recomendada (.env):');
      logger.error('   # Discord Bot (OBRIGATÓRIO)');
      logger.error('   DISCORD_TOKEN=seu_token_aqui');
      logger.error('   DISCORD_APP_ID=seu_app_id_aqui');
      logger.error('   DEV_GUILD_ID=seu_guild_id_para_dev');
      logger.error('');
      logger.error('   # Local AI (OPCIONAL)');
      logger.error('   LOCAL_AI_URL=http://localhost:8000');
      logger.error('');
      logger.error('   # N8N Fallback (OPCIONAL)');
      logger.error('   N8N_IMAGINE_URL=https://seu-n8n.com/webhook/imagine');
      logger.error('   N8N_USERNAME=seu_usuario');
      logger.error('   N8N_PASSWORD=sua_senha');
      logger.error('');
      logger.error('   # Timeouts (OPCIONAL - já tem defaults)');
      logger.error('   AI_TIMEOUT_BASE=1800');
      logger.error('   AI_TIMEOUT_MAX=7200');
      
      process.exit(1);
    }
    
    logger.error('❌ Erro inesperado na configuração:', error);
    process.exit(1);
  }
}

// Carregar e exportar configuração validada
export const config = loadConfig();

// Constantes de timeout padronizadas para toda aplicação
export const TIMEOUTS = {
  // Health checks e verificações rápidas
  HEALTH_CHECK: 5000,           // 5s para verificar se serviços estão online
  MODEL_FETCH: 10000,           // 10s para buscar lista de modelos
  
  // Operações de geração
  GENERATION_SUBMIT: 30000,     // 30s para submeter tarefa de geração
  DEFAULT_POLLING: 2000,        // 2s entre verificações de progresso
  
  // Timeouts de rede
  WEBSOCKET_CONNECT: 15000,     // 15s para conectar WebSocket
  HTTP_REQUEST: 20000,          // 20s para requisições HTTP gerais
  
  // Cancelamento e limpeza
  TASK_CANCEL: 5000,            // 5s para cancelar tarefa
  CLEANUP_WAIT: 3000,           // 3s para operações de limpeza
} as const;

// Helper functions para uso mais fácil
export const isDevelopment = !!config.DEV_GUILD_ID;
export const hasLocalAI = !!config.LOCAL_AI_URL;
export const hasN8NFallback = !!config.N8N_IMAGINE_URL;
export const getSuperUsers = (): string[] => {
  return config.SUPER_USERS?.split(',').map(id => id.trim()).filter(Boolean) || [];
};

// Função para validar configuração em runtime (para health checks)
export function validateRuntimeConfig(): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Verificar se pelo menos um método de geração está disponível
  if (!hasLocalAI && !hasN8NFallback) {
    errors.push('Nenhum método de geração de imagem configurado (LOCAL_AI_URL ou N8N_IMAGINE_URL)');
  }
  
  // Verificar se N8N está configurado corretamente
  if (config.N8N_IMAGINE_URL && (!config.N8N_USERNAME || !config.N8N_PASSWORD)) {
    warnings.push('N8N_IMAGINE_URL configurado mas faltam credenciais (N8N_USERNAME/N8N_PASSWORD)');
  }
  
  // Verificar timeouts
  if (config.AI_TIMEOUT_BASE < 300) {
    warnings.push('AI_TIMEOUT_BASE muito baixo, pode causar timeouts em modelos lentos');
  }
  
  if (config.AI_TIMEOUT_MAX > 10800) { // 3 horas
    warnings.push('AI_TIMEOUT_MAX muito alto, pode causar travamentos longos');
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}
