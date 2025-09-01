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
    model: '🤖',
    time: '⏱️',
    settings: '⚙️',
  }
};

interface ImageMetadata {
  model: string;
  provider: string;
  executionTime: number | null;
  parameters: {
    size: string;
    steps: number;
    cfg: number;
    seed: number | null;
  };
  prompt: string;
  requestId: string;
}

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

/**
 * Formata o tempo de execução
 */
function formatExecutionTime(timeInSeconds: number | null): string {
  if (timeInSeconds === null || timeInSeconds === undefined) return 'N/A';
  
  // Se for exatamente 0, pode ser um problema na API - mostrar como N/A
  if (timeInSeconds === 0) return 'N/A';
  
  // Para valores muito pequenos, mostrar em ms
  if (timeInSeconds < 1) return `${Math.round(timeInSeconds * 1000)}ms`;
  
  // Para valores maiores, mostrar em segundos
  if (timeInSeconds < 60) return `${timeInSeconds.toFixed(1)}s`;
  
  // Para valores em minutos
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Cria um embed enriquecido para imagem gerada com metadados
 */
export function createImageEmbed(username: string, userAvatarUrl: string, metadata: ImageMetadata, imageUrl?: string) {
  const executionTime = formatExecutionTime(metadata.executionTime);
  
  // Criar campos organizados em linhas separadas para melhor legibilidade
  const fields = [
    {
      name: `${theme.icon.model} Modelo`,
      value: metadata.model,
      inline: false
    },
    {
      name: `${theme.icon.time} Tempo de Execução`,
      value: executionTime,
      inline: true
    },
    {
      name: `📐 Tamanho`,
      value: metadata.parameters.size,
      inline: true
    },
    {
      name: `🔧 Steps`,
      value: metadata.parameters.steps.toString(),
      inline: true
    },
    {
      name: `⚙️ CFG`,
      value: metadata.parameters.cfg.toString(),
      inline: true
    },
    {
      name: `🎲 Seed`,
      value: metadata.parameters.seed ? metadata.parameters.seed.toString() : 'Aleatório',
      inline: true
    }
  ];

  const embed = new EmbedBuilder()
    .setColor(theme.color.primary)
    .setTitle(`${theme.icon.sun}${theme.icon.magic} A luz de Stella deu vida ao seu desejo!`)
    .setDescription(`**Prompt:** ${metadata.prompt}`)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ 
      text: `Criado por ${username} • Provider: ${metadata.provider}`, 
      iconURL: userAvatarUrl 
    });

  // Se tiver URL, usar diretamente; senão usar anexo
  if (imageUrl) {
    embed.setImage(imageUrl);
  } else {
    embed.setImage('attachment://stella-image.png');
  }

  return embed;
}
