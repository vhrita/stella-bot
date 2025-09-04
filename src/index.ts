import 'dotenv/config';
import { logger } from './core/logger.js';
import { deployCommands } from './core/deploy.js';
import { client } from './core/client.js';
import { config } from './core/config.js';
import { ErrorHandler } from './core/error-handler.js';

async function main() {
  // Configurar handlers globais de erro
  ErrorHandler.setupGlobalHandlers();
  
  logger.log('A mágica de Stella está começando...');

  const token = config.DISCORD_TOKEN;

  // 1. Registrar os slash commands na API do Discord
  await deployCommands();

  // 2. Conectar o bot ao Discord
  await client.login(token);
}

main().catch(error => {
  logger.fatal('Um erro fatal ocorreu durante a inicialização:', error);
  process.exit(1);
});
