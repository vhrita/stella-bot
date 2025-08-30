import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { logger } from './logger.js';
import { command as imagineCommand } from '../commands/imagine.js';

export async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const appId = process.env.DISCORD_APP_ID;
  const guildId = process.env.DEV_GUILD_ID;

  if (!token || !appId) {
    logger.error('Erro: As variáveis de ambiente DISCORD_TOKEN e DISCORD_APP_ID são obrigatórias.');
    process.exit(1);
  }

  const commands = [imagineCommand.data.toJSON()];
  const rest = new REST({ version: '10' }).setToken(token);

  try {
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