import { Client, Collection, GatewayIntentBits, Events, Interaction } from 'discord.js';
import { logger } from './logger.js';
import { command as imagineCommand } from '../commands/imagine.js';
import { createErrorEmbed, createWarningEmbed } from './embeds.js';
import { isSuperUser } from './utils.js';

const restrictToChannelId = process.env.RESTRICT_TO_CHANNEL_ID;

// Estendendo o Client para incluir a coleção de comandos
class StellaClient extends Client {
  commands: Collection<string, any>;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages, // Necessário para ler o ID do canal
      ],
    });
    this.commands = new Collection();
    this.commands.set(imagineCommand.data.name, imagineCommand);
  }
}

export const client = new StellaClient();

// Evento 'ready': quando o bot está online
client.once(Events.ClientReady, readyClient => {
  logger.log(`Bot pronto! ☀️ Logado como ${readyClient.user.tag}`);
  if (restrictToChannelId) {
    logger.log(`Magia restrita ao canal: ${restrictToChannelId}`);
  }
});

// Evento 'interactionCreate': quando uma interação (ex: slash command) é recebida
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // --- VERIFICAÇÃO DE CANAL (OPCIONAL) ---
  const isUserSuper = isSuperUser(interaction.user.id, false); // Não logar aqui, só nos bypasses
  
  if (restrictToChannelId && interaction.channelId !== restrictToChannelId && !isUserSuper) {
    const warningEmbed = createWarningEmbed(
      `A magia de Stella só pode ser canalizada no lugar certo! Por favor, use meus comandos no canal <#${restrictToChannelId}>.`
    );
    await interaction.reply({ embeds: [warningEmbed], ephemeral: true });
    return;
  }
  
  // Log quando super user bypassa restrição de canal
  if (restrictToChannelId && interaction.channelId !== restrictToChannelId && isUserSuper) {
    logger.log(`👑 Super User ${interaction.user.id} bypass: Restrição de canal ignorada`);
  }
  // --- FIM DA VERIFICAÇÃO ---

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    logger.error(`Nenhum comando correspondente a "${interaction.commandName}" foi encontrado.`);
    const errorEmbed = createErrorEmbed(`O comando \`/${interaction.commandName}\` não foi encontrado. Parece que esta magia não existe.`);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }

  try {
    logger.log(`Executando comando: /${interaction.commandName}`);
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Erro ao executar o comando /${interaction.commandName}:`, error);
    const errorEmbed = createErrorEmbed('Ocorreu um erro inesperado ao executar este comando. A equipe de fadas já foi notificada.');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});