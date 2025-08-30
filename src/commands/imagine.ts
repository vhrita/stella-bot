import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { generateImage } from '../core/n8n.js';
import { logger } from '../core/logger.js';
import { createErrorEmbed } from '../core/embeds.js';

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

    try {
      await interaction.deferReply();

      const imageBuffer = await generateImage({
        prompt,
        userId: user.id,
        channelId,
      });

      if (!imageBuffer) {
        const errorEmbed = createErrorEmbed('A magia falhou! Não consegui gerar sua imagem. Tente novamente mais tarde.');
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      const attachment = new AttachmentBuilder(imageBuffer, { name: 'stella-image.png' });

      const embed = new EmbedBuilder()
        .setColor(0xFFD700) // Dourado, como o sol de Stella
        .setTitle('☀️✨ A luz de Stella deu vida ao seu desejo!')
        .setDescription(`**Prompt:** ${prompt}`)
        .setImage('attachment://stella-image.png')
        .setTimestamp()
        .setFooter({ text: `Criado por ${user.username}`, iconURL: user.displayAvatarURL() });

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      logger.error('Erro no comando /imagine:', error);
      const errorEmbed = createErrorEmbed('Ocorreu um erro inesperado! A equipe de fadas já foi notificada.');
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};
