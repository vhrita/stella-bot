import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { getAvailableModelOptions } from '../core/model-selector.js';
import { logger } from '../core/logger.js';
import { createErrorEmbed } from '../core/embeds.js';

export const command = {
  data: new SlashCommandBuilder()
    .setName('models')
    .setDescription('📋 Lista os modelos de IA disponíveis para geração de imagens'),
  
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    try {
      await interaction.deferReply();

      const modelOptions = await getAvailableModelOptions();
      
      if (modelOptions.length === 0) {
        const errorEmbed = createErrorEmbed('Nenhum modelo disponível no momento.');
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Separar por tipo (local vs externo)
      const localModels = modelOptions.filter(model => model.name.includes('🖥️'));
      const externalModels = modelOptions.filter(model => model.name.includes('☁️'));
      const otherModels = modelOptions.filter(model => !model.name.includes('🖥️') && !model.name.includes('☁️'));

      let description = '';
      
      if (localModels.length > 0) {
        description += '## 🖥️ **Modelos Locais Disponíveis**\n\n';
        localModels.forEach(model => {
          description += `**${model.name}**\n`;
          description += `\`${model.value}\`\n`;
          if (model.description) {
            description += `*${model.description}*\n`;
          }
          description += '\n';
        });
      }

      if (externalModels.length > 0) {
        description += '## ☁️ **Modelos Externos Disponíveis**\n\n';
        externalModels.forEach(model => {
          description += `**${model.name}**\n`;
          description += `\`${model.value}\`\n`;
          if (model.description) {
            description += `*${model.description}*\n`;
          }
          description += '\n';
        });
      }

      if (otherModels.length > 0) {
        description += '## 🤖 **Outras Opções**\n\n';
        otherModels.forEach(model => {
          description += `**${model.name}**\n`;
          description += `\`${model.value}\`\n`;
          if (model.description) {
            description += `*${model.description}*\n`;
          }
          description += '\n';
        });
      }

      description += '\n**💡 Como usar:**\n';
      description += 'Copie o valor em `código` e cole no campo **model** dos comandos `/imagine` ou `/imagine-pro`\n';
      description += 'Ou deixe vazio para auto-seleção inteligente.';

      const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle('📋 Modelos de IA Disponíveis')
        .setDescription(description)
        .setTimestamp()
        .setFooter({ 
          text: `${modelOptions.length} modelo(s) disponível(is)`, 
          iconURL: interaction.user.displayAvatarURL() 
        });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Erro no comando models:', error);
      const errorEmbed = createErrorEmbed('Erro ao listar modelos disponíveis.');
      
      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (replyError) {
        logger.error('Erro ao responder com erro:', replyError);
      }
    }
  }
};
