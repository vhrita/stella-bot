import { SlashCommandBuilder, CommandInteraction, AttachmentBuilder, EmbedBuilder, ComponentType } from 'discord.js';
import { generateImage } from '../core/n8n.js';
import { 
  isLocalAIOnline, 
  getAvailableModels, 
  generateImageLocalWithProgressAndMonitor, 
  buildLocalRequest,
  cancelLocalTask 
} from '../core/local-ai.js';
import { logger } from '../core/logger.js';

// Registro de carregamento do módulo para debug
logger.info('🚀 Módulo imagine.ts carregado com sucesso');
import { createErrorEmbed, createImageEmbed } from '../core/embeds.js';
import { TaskProgressMonitor } from '../core/types.js';
import { CommandProgressHandler } from '../core/command-progress-handler.js';
import { CommandUtils } from '../core/command-utils.js';

export const command = {
  data: new SlashCommandBuilder()
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
    )
    .addStringOption(option =>
      option.setName('model')
        .setDescription('Modelo de IA (use /models para ver disponíveis ou deixe vazio para auto)')
        .setRequired(false)
    ),
  
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prompt = interaction.options.getString('prompt', true);
    const quality = interaction.options.getString('quality') as 'fast' | 'balanced' | 'high' | null;
    const size = interaction.options.getString('size');
    const model = interaction.options.getString('model');
    const { user } = interaction;

    // Validar prompt usando utilitários
    const validation = CommandUtils.validatePrompt(prompt);
    if (!validation.valid) {
      const errorEmbed = createErrorEmbed(validation.reason!);
      await CommandUtils.safeReply(interaction, errorEmbed, false);
      return;
    }

    // Configurações de qualidade usando utilitários
    const qualitySettings = CommandUtils.getQualitySettings(quality || 'balanced');
    const { width, height } = CommandUtils.parseDimensions(size || qualitySettings.size);

    // Resposta inicial usando handler centralizado
    const loadingEmbed = CommandProgressHandler.createLoadingEmbed(
      prompt, user.username, user.displayAvatarURL()
    );

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
      // Verificar se serviço local está online
      const localOnline = await isLocalAIOnline();
      
      if (localOnline) {
        const updatedEmbed = CommandProgressHandler.updateEmbedForLocalService(loadingEmbed, prompt);
        await interaction.editReply({ embeds: [updatedEmbed] });

        await this.generateWithLocalAI(interaction, {
          prompt, width, height, qualitySettings, model, user, loadingEmbed
        });
      } else {
        const fallbackEmbed = CommandProgressHandler.updateEmbedForN8NFallback(loadingEmbed, prompt);
        await interaction.editReply({ embeds: [fallbackEmbed] });

        await this.generateWithN8N(interaction, {
          prompt, width, height, qualitySettings, user
        });
      }
    } catch (error) {
      await this.handleGenerationError(interaction, error, true);
    }
  },

  async generateWithLocalAI(interaction: CommandInteraction, params: {
    prompt: string;
    width: number;
    height: number;
    qualitySettings: any;
    model: string | null;
    user: any;
    loadingEmbed: EmbedBuilder;
  }) {
    const { prompt, width, height, qualitySettings, model, user, loadingEmbed } = params;

    try {
      // Buscar modelos disponíveis
      const availableModels = await getAvailableModels();
      const selectedModel = model || (availableModels.length > 0 ? availableModels[0].slug : 'stable-diffusion-v1.5');

      const request = buildLocalRequest(prompt, selectedModel, {
        width,
        height,
        num_inference_steps: qualitySettings.steps,
        guidance_scale: qualitySettings.guidance,
        use_attention_slicing: true,
        use_vae_slicing: true,
      });

      // Criar botão de cancelamento
      const row = CommandProgressHandler.createCancelButton();

      const currentTaskId: string | null = null;
      let cancelled = false;
      let monitor: TaskProgressMonitor | null = null;

      // Callback de progresso usando handler centralizado
      const progressCallback = CommandProgressHandler.createProgressCallback(
        interaction,
        loadingEmbed,
        () => currentTaskId,
        (value: boolean) => { cancelled = value; },
        () => cancelled
      );

      // Atualizar com botão de cancelamento
      await interaction.editReply({ embeds: [loadingEmbed], components: [row] });

      // Executar geração
      const { data: result, monitor: progressMonitor } = await generateImageLocalWithProgressAndMonitor(request, progressCallback);
      monitor = progressMonitor;

      // Configurar coletor para cancelamento
      const collector = interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutos
      });

      collector?.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.customId === 'cancel_generation' && buttonInteraction.user.id === user.id) {
          cancelled = true;
          
          if (currentTaskId && monitor) {
            await cancelLocalTask(currentTaskId);
            monitor.forceStop();
          }

          const cancelEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🚫 Geração Cancelada')
            .setDescription(`**Prompt:** ${prompt}\n\n🚫 Operação cancelada pelo usuário.`)
            .setTimestamp()
            .setFooter({ text: `Cancelado por ${user.username}`, iconURL: user.displayAvatarURL() });

          await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        }
      });

      // Processar resultado
      if (result && !cancelled) {
        await this.handleSuccessfulGeneration(interaction, result, prompt, user);
      }

    } catch (error) {
      await this.handleGenerationError(interaction, error, true);
    }
  },

  async generateWithN8N(interaction: CommandInteraction, params: {
    prompt: string;
    width: number;
    height: number;
    qualitySettings: any;
    user: any;
  }) {
    const { prompt, width, height, qualitySettings, user } = params;

    // Payload para N8N
    const payload = {
      prompt,
      image_size: `${width}x${height}`,
      num_inference_steps: qualitySettings.steps,
      guidance_scale: qualitySettings.guidance,
      userId: user.id,
      channelId: interaction.channelId || '',
      request_id: CommandUtils.generateRequestId()
    };

    const result = await generateImage(payload);
    
    if (result) {
      await this.handleSuccessfulGeneration(interaction, result, prompt, user);
    }
  },

  async handleSuccessfulGeneration(interaction: CommandInteraction, result: any, prompt: string, user: any) {
    try {
      const embed = createImageEmbed(user.username, user.displayAvatarURL(), result.metadata);
      
      logger.debug('Resultado da geração:', { 
        hasImageBuffer: !!result.imageBuffer, 
        hasImageUrl: !!result.imageUrl,
        type: result.type 
      });
      
      if (result.imageBuffer) {
        logger.info('📎 Anexando imagem como arquivo');
        const attachment = new AttachmentBuilder(result.imageBuffer, { name: 'stella_image.png' });
        await interaction.editReply({ embeds: [embed], files: [attachment], components: [] });
      } else if (result.imageUrl) {
        logger.info('🔗 Exibindo imagem por URL');
        embed.setImage(result.imageUrl);
        await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        logger.warn('⚠️ Nenhuma imagem disponível');
        await interaction.editReply({ embeds: [embed], components: [] });
      }
    } catch (error) {
      await this.handleGenerationError(interaction, error, true);
    }
  },

  async handleGenerationError(interaction: CommandInteraction, error: unknown, hasReplied: boolean) {
    logger.error('Erro na geração de imagem:', error);
    const errorMessage = CommandUtils.getErrorMessage(error);
    const errorEmbed = createErrorEmbed(errorMessage);
    await CommandUtils.safeReply(interaction, errorEmbed, hasReplied);
  }
};
