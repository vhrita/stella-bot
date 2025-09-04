import { SlashCommandBuilder } from 'discord.js';
import { getAvailableModelOptions } from './model-selector.js';
import { logger } from './logger.js';

// OTIMIZAÇÃO FASE 3: Cache de comandos construídos
interface CommandCache {
  command: any;
  timestamp: number;
  modelCount: number;
}

const commandCache = new Map<string, CommandCache>();
const COMMAND_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

/**
 * OTIMIZAÇÃO FASE 3: Verificar se cache de comando é válido
 */
function isCommandCacheValid(cacheKey: string, modelCount: number): boolean {
  const cached = commandCache.get(cacheKey);
  if (!cached) return false;
  
  const isExpired = Date.now() - cached.timestamp > COMMAND_CACHE_TTL;
  const modelCountChanged = cached.modelCount !== modelCount;
  
  return !isExpired && !modelCountChanged;
}

/**
 * Constrói o comando /imagine com modelos dinâmicos
 * OTIMIZAÇÃO FASE 3: Cache de comandos para evitar rebuilds desnecessários
 */
export async function buildImagineCommand() {
  const cacheKey = 'imagine-command';
  
  try {
    // Obter modelos disponíveis primeiro
    logger.debug('🔍 Obtendo modelos para comando /imagine...');
    const modelOptions = await getAvailableModelOptions();
    
    // OTIMIZAÇÃO FASE 3: Verificar cache de comando
    if (isCommandCacheValid(cacheKey, modelOptions.length)) {
      logger.debug('🎯 Usando comando /imagine do cache');
      return commandCache.get(cacheKey)!.command;
    }
    
    logger.debug('🔨 Construindo comando /imagine...');
    
    const builder = new SlashCommandBuilder()
      .setName('imagine')
      .setDescription('✨ Cria uma imagem a partir de um texto, com a luz de Stella!')
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('A sua ideia para a imagem (em inglês)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('quality')
          .setDescription('Qualidade da geração (padrão: balanced)')
          .setRequired(false)
          .addChoices(
            { name: '⚡ Rápida (10 steps)', value: 'fast' },
            { name: '⚖️ Balanceada (20 steps)', value: 'balanced' },
            { name: '💎 Alta (30 steps)', value: 'high' }
          )
      )
      .addStringOption(option =>
        option.setName('size')
          .setDescription('Tamanho da imagem (padrão: 1024x1024)')
          .setRequired(false)
          .addChoices(
            { name: '📱 Quadrado - 512x512', value: '512x512' },
            { name: '🖼️ Quadrado HD - 1024x1024', value: '1024x1024' },
            { name: '📐 Paisagem - 1152x896', value: '1152x896' },
            { name: '📏 Retrato - 896x1152', value: '896x1152' }
          )
      );

    // Adicionar modelos disponíveis ao comando
    builder.addStringOption(option => {
      option
        .setName('model')
        .setDescription('Modelo de IA para gerar a imagem')
        .setRequired(false);

      // Adicionar choices dinamicamente
      for (const modelChoice of modelOptions) {
        option.addChoices({
          name: modelChoice.name,
          value: modelChoice.value
        });
      }

      return option;
    });

    // OTIMIZAÇÃO FASE 3: Cachear comando construído
    const builtCommand = builder;
    commandCache.set(cacheKey, {
      command: builtCommand,
      timestamp: Date.now(),
      modelCount: modelOptions.length
    });

    logger.log(`🎨 Comando /imagine construído com ${modelOptions.length} modelo(s)`);
    return builtCommand;
    
  } catch (error) {
    logger.error('Erro ao construir comando /imagine:', error);
    
    // Fallback: comando básico sem cache
    const fallbackBuilder = new SlashCommandBuilder()
      .setName('imagine')
      .setDescription('✨ Cria uma imagem a partir de um texto, com a luz de Stella!')
      .addStringOption(option =>
        option.setName('prompt')
          .setDescription('A sua ideia para a imagem (em inglês)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('model')
          .setDescription('Modelo de IA para gerar a imagem')
          .setRequired(false)
          .addChoices({
            name: '🤖 Auto-seleção',
            value: 'auto'
          })
      );
      
    return fallbackBuilder;
  }
}

/**
 * Constrói o comando /imagine-pro com modelos dinâmicos
 */
export async function buildImagineProCommand() {
  const builder = new SlashCommandBuilder()
    .setName('imagine-pro')
    .setDescription('🔧 Geração avançada com controle total dos parâmetros técnicos')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Descrição da imagem desejada (em inglês)')
        .setRequired(true)
    );

  try {
    // Obter modelos disponíveis e adicionar ao comando
    const modelOptions = await getAvailableModelOptions();
    
    builder.addStringOption(option => {
      option
        .setName('model')
        .setDescription('Modelo de IA específico')
        .setRequired(false);

      // Adicionar choices dinamicamente
      for (const modelChoice of modelOptions) {
        option.addChoices({
          name: modelChoice.name,
          value: modelChoice.value
        });
      }

      return option;
    });

    logger.log(`🔧 Comando /imagine-pro construído com ${modelOptions.length} modelo(s)`);
    
  } catch (error) {
    logger.error('Erro ao construir comando /imagine-pro:', error);
    
    // Fallback: adicionar apenas auto-seleção
    builder.addStringOption(option =>
      option.setName('model')
        .setDescription('Modelo de IA específico')
        .setRequired(false)
        .addChoices({
          name: '🤖 Auto-seleção',
          value: 'auto'
        })
    );
  }

  // Continuar adicionando as outras opções do imagine-pro
  builder
    .addStringOption(option =>
      option.setName('size')
        .setDescription('Resolução da imagem (padrão: 1024x1024)')
        .setRequired(false)
        .addChoices(
          { name: '📱 512x512 (Rápido)', value: '512x512' },
          { name: '🖼️ 1024x1024 (Padrão)', value: '1024x1024' },
          { name: '📐 1152x896 (Paisagem)', value: '1152x896' },
          { name: '📏 896x1152 (Retrato)', value: '896x1152' },
          { name: '🖥️ 1280x720 (16:9)', value: '1280x720' },
          { name: '📺 1920x1080 (Full HD)', value: '1920x1080' }
        )
    )
    .addIntegerOption(option =>
      option.setName('steps')
        .setDescription('Número de steps de inferência (10-100, padrão: 20)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(100)
    )
    .addNumberOption(option =>
      option.setName('cfg')
        .setDescription('CFG Scale - força da aderência ao prompt (1.0-20.0, padrão: 7.5)')
        .setRequired(false)
        .setMinValue(1.0)
        .setMaxValue(20.0)
    )
    .addIntegerOption(option =>
      option.setName('seed')
        .setDescription('Seed para reproduzibilidade (deixe vazio para aleatório)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(2147483647)
    )
    .addStringOption(option =>
      option.setName('scheduler')
        .setDescription('Algoritmo de sampling (padrão: auto)')
        .setRequired(false)
        .addChoices(
          { name: '🔄 Auto (Recomendado)', value: 'auto' },
          { name: '⚡ DPM++ 2M Karras', value: 'DPM++ 2M Karras' },
          { name: '🎯 Euler Ancestral', value: 'Euler a' },
          { name: '🔀 DDIM', value: 'DDIM' },
          { name: '🌊 LMS', value: 'LMS' }
        )
    )
    .addStringOption(option =>
      option.setName('negative_prompt')
        .setDescription('Prompt negativo - o que NÃO deve aparecer na imagem')
        .setRequired(false)
    )
    .addNumberOption(option =>
      option.setName('eta')
        .setDescription('Parâmetro ETA para alguns schedulers (0.0-1.0, padrão: 0.0)')
        .setRequired(false)
        .setMinValue(0.0)
        .setMaxValue(1.0)
    )
    .addBooleanOption(option =>
      option.setName('attention_slicing')
        .setDescription('Usar attention slicing (reduz uso de VRAM, padrão: true)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('vae_slicing')
        .setDescription('Usar VAE slicing (reduz uso de VRAM, padrão: true)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('cpu_offload')
        .setDescription('Usar CPU offload (economia máxima de VRAM, mais lento)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_sharpness')
        .setDescription('Melhorar nitidez da imagem final')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_contrast')
        .setDescription('Melhorar contraste da imagem final')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_color')
        .setDescription('Melhorar saturação de cores')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('enhance_brightness')
        .setDescription('Ajustar brilho automaticamente')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('unsharp_mask')
        .setDescription('Aplicar máscara de nitidez avançada')
        .setRequired(false)
    );

  return builder;
}
