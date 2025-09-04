import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { logger } from './logger.js';
import { buildImagineCommand, buildImagineProCommand } from './command-builder.js';
import { command as modelsCommand } from '../commands/models.js';
import { config } from './config.js';

export async function deployCommands() {
  const token = config.DISCORD_TOKEN;
  const appId = config.DISCORD_APP_ID;
  const guildId = config.DEV_GUILD_ID;

  // Validação já é feita automaticamente pelo config

  try {
    logger.log('🔄 Construindo comandos dinamicamente...');
    
    // Construir comandos dinamicamente com modelos atuais
    const imagineCommand = await buildImagineCommand();
    const imagineProCommand = await buildImagineProCommand();

    const commands = [
      imagineCommand.toJSON(),
      imagineProCommand.toJSON(),
      modelsCommand.data.toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(token);

    logger.log(`Registrando ${commands.length} slash command(s)...`);

    let route;
    if (guildId) {
      // Rota para registrar comandos em um servidor específico (guild)
      route = Routes.applicationGuildCommands(appId, guildId);
      logger.log(`Deploy para o servidor de desenvolvimento (ID: ${guildId})`);
    } else {
      // Rota para registrar comandos globalmente
      route = Routes.applicationCommands(appId);
      logger.log('Deploy global (pode levar até 1 hora para propagar)');
    }

    const data: any = await rest.put(route, { body: commands });

    logger.log(`✅ ${data.length} slash command(s) registrados com sucesso!`);
  } catch (error) {
    logger.error('Falha ao registrar os comandos:', error);
    process.exit(1);
  }
}