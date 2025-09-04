import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { isLocalAIOnline, getAvailableModels } from './local-ai.js';

// OTIMIZAÇÃO FASE 3: Cache de Status de Serviços
interface ServiceStatusCache {
  isOnline: boolean;
  timestamp: number;
  lastCheck: number;
}

interface AIModel {
  name: string;
  slug: string;
  bestFor: string;
  pros: string;
  cons: string;
  keywords: string[];
  routingHints: string;
  providers: Array<{
    name: string;
    endpoint: string;
  }>;
  response: {
    url: { field: string };
    base64: { field: string };
  };
}

interface AIModelsConfig {
  models: AIModel[];
}

interface ModelOption {
  name: string;
  value: string;
  description?: string;
}

// OTIMIZAÇÃO FASE 3: Cache para status de serviços
const serviceStatusCache = new Map<string, ServiceStatusCache>();
const CACHE_TTL = 30 * 1000; // 30 segundos
const MIN_CHECK_INTERVAL = 5 * 1000; // 5 segundos entre verificações

/**
 * OTIMIZAÇÃO FASE 3: Verificação de serviço com cache
 */
async function checkServiceWithCache(serviceKey: string, checkFn: () => Promise<boolean>): Promise<boolean> {
  const now = Date.now();
  const cached = serviceStatusCache.get(serviceKey);
  
  // Verificar se cache é válido e se não passou do intervalo mínimo
  if (cached && 
      now - cached.timestamp < CACHE_TTL && 
      now - cached.lastCheck < MIN_CHECK_INTERVAL) {
    logger.debug(`🎯 Cache hit para ${serviceKey}: ${cached.isOnline}`);
    return cached.isOnline;
  }
  
  // Se está dentro do intervalo mínimo mas cache expirou, retornar último status
  if (cached && now - cached.lastCheck < MIN_CHECK_INTERVAL) {
    logger.debug(`⏰ Aguardando intervalo para ${serviceKey}, usando cache: ${cached.isOnline}`);
    return cached.isOnline;
  }
  
  try {
    logger.debug(`🔄 Verificando status de ${serviceKey}...`);
    const isOnline = await checkFn();
    
    // Atualizar cache
    serviceStatusCache.set(serviceKey, {
      isOnline,
      timestamp: now,
      lastCheck: now
    });
    
    logger.debug(`✅ Status ${serviceKey}: ${isOnline ? 'online' : 'offline'}`);
    return isOnline;
  } catch (error) {
    logger.debug(`❌ Erro ao verificar ${serviceKey}:`, error);
    
    // Se há cache, usar o último status conhecido
    if (cached) {
      logger.debug(`🔄 Usando último status conhecido para ${serviceKey}: ${cached.isOnline}`);
      return cached.isOnline;
    }
    
    return false;
  }
}

/**
 * OTIMIZAÇÃO FASE 3: Verificação paralela de serviços
 */
async function checkServicesInParallel(): Promise<{ localAI: boolean; n8n: boolean }> {
  logger.debug('🚀 Iniciando verificação paralela de serviços...');
  
  const checks = await Promise.allSettled([
    checkServiceWithCache('localai', isLocalAIOnline),
    // Adicionar verificação N8N quando disponível
    Promise.resolve(true) // N8N sempre considerado disponível por enquanto
  ]);
  
  const localAI = checks[0].status === 'fulfilled' ? checks[0].value : false;
  const n8n = checks[1].status === 'fulfilled' ? checks[1].value : true;
  
  logger.debug(`🎯 Resultado verificação: Local AI=${localAI}, N8N=${n8n}`);
  
  return { localAI, n8n };
}

/**
 * Carrega os modelos do arquivo ai_models.json
 */
function loadAIModels(): AIModel[] {
  try {
    const configPath = join(process.cwd(), 'ai_models.json');
    const configContent = readFileSync(configPath, 'utf-8');
    const config: AIModelsConfig = JSON.parse(configContent);
    return config.models;
  } catch (error) {
    logger.error('Erro ao carregar ai_models.json:', error);
    return [];
  }
}

/**
 * Obtém a lista de modelos disponíveis baseado na disponibilidade do serviço local
 * OTIMIZAÇÃO FASE 3: Verificação paralela e cache de status
 * Limitado a 25 opções (limite do Discord)
 */
export async function getAvailableModelOptions(): Promise<ModelOption[]> {
  try {
    logger.debug('🔍 Obtendo opções de modelos disponíveis...');
    
    // OTIMIZAÇÃO FASE 3: Verificação paralela de serviços
    const { localAI: localOnline } = await checkServicesInParallel();
    
    if (localOnline) {
      // Se local está online, usar apenas modelos locais
      logger.debug('🖥️ Usando modelos locais');
      const localModels = await getAvailableModels();
      
      const options = localModels.slice(0, 24).map(model => ({
        name: `🖥️ ${model.name}`.substring(0, 100), // Limite do Discord
        value: model.slug,
        description: model.description?.substring(0, 100) || 'Modelo local'
      }));

      // Adicionar opção auto se ainda houver espaço
      if (options.length < 25) {
        options.unshift({
          name: '🤖 Auto-seleção',
          value: 'auto',
          description: 'Deixe o sistema escolher o melhor modelo local'
        });
      }

      logger.debug(`✅ ${options.length} modelo(s) local(is) disponível(is)`);
      return options;
    } else {
      // Se local está offline, usar modelos do N8N (ai_models.json)
      logger.debug('🌐 Usando modelos N8N (fallback)');
      const aiModels = loadAIModels();
      
      const options = aiModels.slice(0, 24).map(model => ({
        name: `☁️ ${model.name}`.substring(0, 100),
        value: model.slug,
        description: model.bestFor?.substring(0, 100) || 'Modelo externo'
      }));

      // Adicionar opção auto se ainda houver espaço
      if (options.length < 25) {
        options.unshift({
          name: '🤖 Auto-seleção',
          value: 'auto',
          description: 'Deixe o sistema escolher o melhor modelo'
        });
      }

      return options;
    }
  } catch (error) {
    logger.error('Erro ao obter modelos disponíveis:', error);
    
    // Fallback para auto-seleção
    return [
      {
        name: '🤖 Auto-seleção',
        value: 'auto',
        description: 'Deixe o sistema escolher o melhor modelo'
      }
    ];
  }
}

/**
 * Obtém o modelo padrão baseado na disponibilidade
 */
export async function getDefaultModel(): Promise<string> {
  try {
    const localOnline = await isLocalAIOnline();
    
    if (localOnline) {
      const localModels = await getAvailableModels();
      return localModels.length > 0 ? localModels[0].slug : 'stable-diffusion-v1.5';
    } else {
      const aiModels = loadAIModels();
      return aiModels.length > 0 ? aiModels[0].slug : 'auto';
    }
  } catch (error) {
    logger.error('Erro ao obter modelo padrão:', error);
    return 'auto';
  }
}

/**
 * Verifica se um modelo específico está disponível
 */
export async function isModelAvailable(modelSlug: string): Promise<boolean> {
  try {
    const availableOptions = await getAvailableModelOptions();
    return availableOptions.some(option => option.value === modelSlug);
  } catch (error) {
    logger.error('Erro ao verificar disponibilidade do modelo:', error);
    return false;
  }
}
