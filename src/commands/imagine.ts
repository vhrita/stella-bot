import { SlashCommandBuilder, CommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { generateImage } from '../core/n8n.js';
import { logger } from '../core/logger.js';
import { createErrorEmbed, createImageEmbed } from '../core/embeds.js';

function getErrorMessage(error: unknown): string {
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

async function safeReply(interaction: CommandInteraction, embed: EmbedBuilder, hasReplied: boolean): Promise<void> {
  try {
    if (hasReplied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (replyError) {
    logger.error('Erro ao enviar mensagem de erro:', replyError);
    // Em último caso, tentar responder com mensagem simples
    try {
      if (!hasReplied) {
        await interaction.reply({ content: '❌ Erro inesperado! Tente novamente.', ephemeral: true });
      }
    } catch (finalError) {
      logger.error('Falha total ao responder ao usuário:', finalError);
    }
  }
}

export const command = {
  data: new SlashCommandBuilder()
    .setName('imagine')
    .setDescription('✨ Cria uma imagem a partir de um texto, com a luz de Stella!')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('A sua ideia para a imagem (em inglês)')
        .setRequired(true)
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prompt = interaction.options.getString('prompt', true);
    const { user, channelId } = interaction;
    let hasReplied = false;

    try {
      // Responder imediatamente com mensagem de carregamento
      const loadingEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('✨🎨 Stella está criando sua imagem...')
        .setDescription(`**Prompt:** ${prompt}\n\n🌟 *A magia está acontecendo, aguarde um momento...*`)
        .setTimestamp()
        .setFooter({ text: `Solicitado por ${user.username}`, iconURL: user.displayAvatarURL() });

      await interaction.reply({ embeds: [loadingEmbed] });
      hasReplied = true;

      const imageData = await generateImage({
        prompt,
        userId: user.id,
        channelId,
      });

      if (!imageData) {
        // Criar mensagem de erro mais específica baseada nos logs
        let errorMessage = 'A magia falhou! Não consegui gerar sua imagem.';
        
        // Sugestões baseadas em possíveis problemas
        const suggestions = [
          '🔄 Tente novamente em alguns minutos',
          '✏️ Verifique se o prompt está em inglês',
          '🎯 Tente um prompt mais simples'
        ];
        
        const errorEmbed = createErrorEmbed(`${errorMessage}\n\n${suggestions.join('\n')}`);
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      let embed;
      let files: AttachmentBuilder[] = [];

      if (imageData.type === 'url' && imageData.imageUrl) {
        // Se for URL, usar diretamente no embed
        embed = createImageEmbed(
          user.username,
          user.displayAvatarURL(),
          imageData.metadata,
          imageData.imageUrl
        );
      } else if (imageData.type === 'base64' && imageData.imageBuffer) {
        // Se for base64, anexar como arquivo
        const attachment = new AttachmentBuilder(imageData.imageBuffer, { name: 'stella-image.png' });
        files.push(attachment);
        
        embed = createImageEmbed(
          user.username,
          user.displayAvatarURL(),
          imageData.metadata
        );
      } else {
        const errorEmbed = createErrorEmbed('A magia falhou! Formato de imagem não suportado.');
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      await interaction.editReply({ embeds: [embed], files });

      // Limpar buffer da memória após envio (evitar vazamentos de memória)
      if (imageData.type === 'base64' && imageData.imageBuffer) {
        imageData.imageBuffer.fill(0); // Limpar o conteúdo do buffer
        logger.log('Buffer de imagem limpo da memória após envio');
      }

    } catch (error) {
      logger.error('Erro no comando /imagine:', error);
      
      const errorMessage = getErrorMessage(error);
      const errorEmbed = createErrorEmbed(errorMessage);
      
      await safeReply(interaction, errorEmbed, hasReplied);
    }
  },
};
