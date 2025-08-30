import 'dotenv/config';
import { logger } from './core/logger.js';
import { deployCommands } from './core/deploy.js';
import { client } from './core/client.js';

async function main() {
  logger.log('A mágica de Stella está começando...');

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error('A variável de ambiente DISCORD_TOKEN é obrigatória.');
    process.exit(1);
  }

  // 1. Registrar os slash commands na API do Discord
  await deployCommands();

  // 2. Conectar o bot ao Discord
  await client.login(token);
}

main().catch(error => {
  logger.error('Um erro fatal ocorreu:', error);
  process.exit(1);
});
