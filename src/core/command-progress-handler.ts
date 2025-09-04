import { 
  CommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { TaskProgress, ProgressCallback } from './types.js';
import { logger } from './logger.js';

/**
 * Classe centralizada para gerenciar progresso de comandos Discord
 * Elimina duplicação entre imagine.ts e imagine-pro.ts
 */
export class CommandProgressHandler {
  
  /**
   * Cria callback de progresso padronizado para comandos
   */
  static createProgressCallback(
    interaction: CommandInteraction,
    loadingEmbed: EmbedBuilder,
    getCurrentTaskId: () => string | null,
    setCancelled: (value: boolean) => void,
    getCancelled: () => boolean
  ): ProgressCallback {
    return (progress: TaskProgress) => {
      if (getCancelled()) return;

      try {
        const { progressText, embedColor, title } = this.buildProgressStatus(progress);

        // Atualizar embed
        const updatedEmbed = EmbedBuilder.from(loadingEmbed)
          .setColor(embedColor)
          .setTitle(title)
          .setDescription(progressText);

        // Atualizar interaction de forma segura
        interaction.editReply({ embeds: [updatedEmbed] }).catch(error => {
          logger.error('Erro ao atualizar progress embed:', error);
        });

      } catch (error) {
        logger.error('Erro no callback de progresso:', error);
      }
    };
  }

  /**
   * Constrói status de progresso baseado no tipo
   */
  private static buildProgressStatus(progress: TaskProgress): {
    progressText: string;
    embedColor: number;
    title: string;
  } {
    switch (progress.status) {
      case 'processing':
        return this.buildProcessingStatus(progress);
      case 'failed':
        return this.buildFailedStatus(progress);
      case 'completed':
        return this.buildCompletedStatus(progress);
      case 'cancelled':
        return this.buildCancelledStatus(progress);
      default:
        return {
          progressText: '🔄 Processando...',
          embedColor: 0x7289DA,
          title: '🎨 Geração em Andamento'
        };
    }
  }

  /**
   * Constrói status de processamento
   */
  private static buildProcessingStatus(progress: TaskProgress): {
    progressText: string;
    embedColor: number;
    title: string;
  } {
    const percentage = Math.round(progress.progress || 0);
    let progressText = `🎨 Gerando imagem... ${percentage}%`;
    
    if (progress.current_step && progress.total_steps) {
      progressText += ` (${progress.current_step}/${progress.total_steps} steps)`;
    }

    // Adicionar informações de performance se disponíveis
    if (progress.performance_stats && progress.performance_stats.memory_percent > 90) {
      progressText += ` ⚠️ Memória: ${progress.performance_stats.memory_percent.toFixed(0)}%`;
    }

    // Adicionar modelo sendo usado
    if (progress.model_used) {
      progressText += `\n**Modelo:** ${progress.model_used}`;
    }

    return {
      progressText,
      embedColor: 0x7289DA,
      title: '🎨 Geração em Andamento'
    };
  }

  /**
   * Constrói status de falha
   */
  private static buildFailedStatus(progress: TaskProgress): {
    progressText: string;
    embedColor: number;
    title: string;
  } {
    let progressText: string;

    // Identificar tipo de erro
    if (progress.message.includes('CUDA out of memory') || progress.message.includes('out of memory')) {
      progressText = `💥 **Memória insuficiente!**\n\n${progress.message}\n\n*Tente com resolução menor ou menos steps.*`;
    } else {
      progressText = `❌ **Erro na geração:**\n\n${progress.message}`;
    }

    // Adicionar informações do progresso quando falhou
    if (progress.current_step && progress.total_steps) {
      progressText += `\n\n📊 Falhou no step ${progress.current_step}/${progress.total_steps} (${Math.round(progress.progress || 0)}%)`;
    }

    return {
      progressText,
      embedColor: 0xFF6B35,
      title: '❌ Falha na Geração'
    };
  }

  /**
   * Constrói status de conclusão
   */
  private static buildCompletedStatus(progress: TaskProgress): {
    progressText: string;
    embedColor: number;
    title: string;
  } {
    const timeInfo = progress.generation_time ? ` em ${progress.generation_time.toFixed(1)}s` : '';
    const imageInfo = progress.image_stats ? 
      ` (${progress.image_stats.width}x${progress.image_stats.height})` : '';
    
    let progressText = `🎉 **Sucesso!** Imagem gerada${timeInfo}${imageInfo}`;
    
    if (progress.output_paths && progress.output_paths.length > 0) {
      progressText += `\n📁 ${progress.output_paths.length} arquivo(s) gerado(s)`;
    }

    return {
      progressText,
      embedColor: 0x57F287,
      title: '✅ Geração Concluída'
    };
  }

  /**
   * Constrói status de cancelamento
   */
  private static buildCancelledStatus(progress: TaskProgress): {
    progressText: string;
    embedColor: number;
    title: string;
  } {
    return {
      progressText: `🚫 **Operação cancelada**\n\n${progress.message}`,
      embedColor: 0x5865F2,
      title: '🚫 Geração Cancelada'
    };
  }

  /**
   * Cria botão de cancelamento padronizado
   */
  static createCancelButton(): ActionRowBuilder<ButtonBuilder> {
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_generation')
      .setLabel('🚫 Cancelar')
      .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(cancelButton);
  }

  /**
   * Atualiza embed com informações de progresso específicas
   */
  static updateProgressEmbed(
    embed: EmbedBuilder,
    progress: TaskProgress,
    additionalInfo?: string
  ): EmbedBuilder {
    let description = embed.data.description || '';
    
    if (progress.status === 'processing') {
      const percentage = Math.round(progress.progress || 0);
      const stepInfo = progress.current_step && progress.total_steps ? 
        ` (${progress.current_step}/${progress.total_steps})` : '';
      
      description += `\n\n📊 Progresso: ${percentage}%${stepInfo}`;
      
      if (progress.model_used) {
        description += `\n🤖 Modelo: ${progress.model_used}`;
      }
    }

    if (additionalInfo) {
      description += `\n${additionalInfo}`;
    }

    return embed.setDescription(description);
  }

  /**
   * Cria embed de loading inicial padronizado
   */
  static createLoadingEmbed(
    prompt: string,
    username: string,
    avatarURL: string,
    status = '🔍 Verificando serviços disponíveis...'
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle('🎨 Iniciando Geração')
      .setDescription(`**Prompt:** ${prompt}\n\n${status}`)
      .setTimestamp()
      .setFooter({ text: `Solicitado por ${username}`, iconURL: avatarURL });
  }

  /**
   * Atualiza embed para indicar serviço local online
   */
  static updateEmbedForLocalService(
    embed: EmbedBuilder,
    prompt: string
  ): EmbedBuilder {
    return embed.setDescription(
      `**Prompt:** ${prompt}\n\n🖥️ **Serviço Local Online** ✅\n🔄 Gerando com IA local...`
    );
  }

  /**
   * Atualiza embed para fallback N8N
   */
  static updateEmbedForN8NFallback(
    embed: EmbedBuilder,
    prompt: string
  ): EmbedBuilder {
    return embed.setDescription(
      `**Prompt:** ${prompt}\n\n☁️ **Usando N8N (Fallback)** ⚡\n🔄 Enviando para processamento...`
    );
  }

  /**
   * Cria embed final de sucesso com imagem
   */
  static createSuccessEmbed(
    prompt: string,
    metadata: any,
    username: string,
    avatarURL: string
  ): EmbedBuilder {
    const executionTime = metadata.executionTime ? 
      `⏱️ ${metadata.executionTime.toFixed(1)}s` : '⏱️ N/A';
    
    const parameters = metadata.parameters;
    const paramText = `📐 ${parameters.size} | 🔢 ${parameters.steps} steps | ⚖️ CFG ${parameters.cfg}`;
    const seedText = parameters.seed ? ` | 🌱 Seed ${parameters.seed}` : '';

    return new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✨ Imagem Criada com Sucesso!')
      .setDescription(`**Prompt:** ${prompt}`)
      .addFields(
        { name: '🤖 Modelo', value: metadata.model, inline: true },
        { name: '⚡ Provider', value: metadata.provider, inline: true },
        { name: '⏱️ Tempo', value: executionTime, inline: true },
        { name: '⚙️ Parâmetros', value: `${paramText}${seedText}`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: `Solicitado por ${username}`, iconURL: avatarURL });
  }
}
