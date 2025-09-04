import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from './logger.js';
import { QualitySettings } from './types.js';

/**
 * Utilitários compartilhados entre comandos Discord
 * Centraliza funções comuns para eliminar duplicação de código
 * e garantir comportamento consistente em todos os comandos
 */
export class CommandUtils {
  
  /**
   * Trata erro e retorna mensagem amigável ao usuário
   * @param error - Erro capturado
   * @returns string - Mensagem amigável para o usuário
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        return 'A geração demorou muito! Tente novamente com um prompt mais simples.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        return 'Problema de conexão! Verifique sua internet e tente novamente.';
      } else if (error.name === 'AbortError') {
        return 'A requisição foi cancelada por demorar muito! Tente um prompt mais simples.';
      }
    }
    return 'Ocorreu um erro inesperado! A equipe de fadas já foi notificada.';
  }

  /**
   * Resposta segura ao Discord - tenta reply ou edit baseado no estado
   * @param interaction - Interação do Discord
   * @param embed - Embed a ser enviado
   * @param hasReplied - Se já respondeu à interação
   */
  static async safeReply(
    interaction: CommandInteraction, 
    embed: EmbedBuilder, 
    hasReplied: boolean
  ): Promise<void> {
    try {
      if (hasReplied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    } catch (replyError) {
      logger.error('Erro ao enviar mensagem de erro:', replyError);
      try {
        if (!hasReplied) {
          await interaction.reply({ content: '❌ Erro inesperado! Tente novamente.', ephemeral: true });
        }
      } catch (finalError) {
        logger.error('Falha total ao responder ao usuário:', finalError);
      }
    }
  }

  /**
   * Configurações de qualidade padronizadas para comandos
   * @param quality - Nível de qualidade ('fast', 'balanced', 'high')
   * @returns QualitySettings - Configurações correspondentes
   */
  static getQualitySettings(quality: string): QualitySettings {
    switch (quality) {
      case 'fast': 
        return { steps: 10, guidance: 6.0, size: '512x512' };
      case 'high': 
        return { steps: 30, guidance: 8.0, size: '1024x1024' };
      default: 
        return { steps: 20, guidance: 7.5, size: '1024x1024' };
    }
  }

  /**
   * Extrai dimensões de string de tamanho
   * @param sizeString - String no formato "WxH" (ex: "1024x1024")
   * @returns Objeto com width e height
   */
  static parseDimensions(sizeString: string): { width: number; height: number } {
    const [width, height] = sizeString.split('x').map(Number);
    return { width, height };
  }

  /**
   * Valida se o prompt é apropriado (filtros básicos)
   * @param prompt - Texto do prompt a ser validado
   * @returns Objeto com resultado da validação
   */
  static validatePrompt(prompt: string): { valid: boolean; reason?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return { valid: false, reason: 'Prompt não pode estar vazio' };
    }

    if (prompt.length > 1000) {
      return { valid: false, reason: 'Prompt muito longo (máximo 1000 caracteres)' };
    }

    // Lista básica de palavras não permitidas
    const forbiddenWords = ['nsfw', 'explicit', 'nude', 'porn', 'sexual'];
    const lowerPrompt = prompt.toLowerCase();
    
    for (const word of forbiddenWords) {
      if (lowerPrompt.includes(word)) {
        return { valid: false, reason: 'Prompt contém conteúdo inapropriado' };
      }
    }

    return { valid: true };
  }

  /**
   * Formata tempo em segundos para string legível
   * @param timeInSeconds - Tempo em segundos
   * @returns String formatada (ex: "2m 30s")
   */
  static formatTime(timeInSeconds: number): string {
    if (timeInSeconds < 60) {
      return `${Math.round(timeInSeconds)}s`;
    } else {
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.floor(timeInSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Gera um ID único para requisições
   * @returns string - ID único no formato timestamp-random
   */
  static generateRequestId(): string {
    return `stella_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Formata parâmetros para exibição em embed
   * @param parameters - Parâmetros da geração
   * @returns String formatada para exibição
   */
  static formatParameters(parameters: {
    size: string;
    steps: number;
    cfg: number;
    seed?: number | null;
    scheduler?: string;
  }): string {
    const parts = [
      `📐 ${parameters.size}`,
      `🔢 ${parameters.steps} steps`,
      `⚖️ CFG ${parameters.cfg}`
    ];

    if (parameters.seed) {
      parts.push(`🌱 Seed ${parameters.seed}`);
    }

    if (parameters.scheduler && parameters.scheduler !== 'auto') {
      parts.push(`🔄 ${parameters.scheduler}`);
    }

    return parts.join(' | ');
  }

  /**
   * Determina emoji baseado no status da operação
   * @param status - Status da operação
   * @returns Emoji correspondente
   */
  static getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return '✅';
      case 'processing':
      case 'pending':
        return '⚡';
      case 'failed':
      case 'error':
        return '❌';
      case 'cancelled':
        return '🚫';
      default:
        return '⏳';
    }
  }

  /**
   * Calcula progress bar visual para Discord
   * @param percentage - Porcentagem (0-100)
   * @param length - Comprimento da barra
   * @returns String com progress bar
   */
  static createProgressBar(percentage: number, length = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}
