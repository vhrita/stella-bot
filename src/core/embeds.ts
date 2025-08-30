import { EmbedBuilder } from 'discord.js';

const theme = {
  color: {
    primary: 0xFFD700, // Dourado
    error: 0xED4245,   // Vermelho do Discord
    warning: 0xFEE75C, // Amarelo do Discord
  },
  icon: {
    sun: '☀️',
    magic: '✨',
    error: '⛈️',
    warning: '⚠️',
  }
};

/**
 * Cria um embed de erro padrão.
 */
export function createErrorEmbed(description: string) {
  return new EmbedBuilder()
    .setColor(theme.color.error)
    .setTitle(`${theme.icon.error} Magia Interrompida`)
    .setDescription(description);
}

/**
 * Cria um embed de aviso padrão.
 */
export function createWarningEmbed(description: string) {
  return new EmbedBuilder()
    .setColor(theme.color.warning)
    .setTitle(`${theme.icon.warning} Atenção, pequena fada!`)
    .setDescription(description);
}
