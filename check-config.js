import 'dotenv/config';
import { isLocalAIOnline, getAvailableModels } from './src/core/local-ai.js';
import { logger } from './src/core/logger.js';

async function checkConfiguration() {
  logger.log('🔍 Verificando configuração do Stella Bot...\n');

  // Verificar variáveis essenciais
  const requiredVars = ['DISCORD_TOKEN', 'DISCORD_APP_ID'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error(`❌ Variáveis obrigatórias faltando: ${missingVars.join(', ')}`);
    process.exit(1);
  }

  logger.log('✅ Variáveis do Discord configuradas');

  // Verificar N8N (fallback)
  const n8nVars = ['N8N_IMAGINE_URL', 'N8N_USERNAME', 'N8N_PASSWORD'];
  const hasN8N = n8nVars.every(varName => process.env[varName]);
  
  if (hasN8N) {
    logger.log('✅ N8N configurado (fallback disponível)');
  } else {
    logger.log('⚠️  N8N não configurado (sem fallback)');
  }

  // Verificar Local AI
  const localAIUrl = process.env.LOCAL_AI_URL;
  if (localAIUrl) {
    logger.log(`🔍 Verificando serviço local: ${localAIUrl}`);
    
    const isOnline = await isLocalAIOnline();
    if (isOnline) {
      logger.log('✅ Serviço local online');
      
      try {
        const models = await getAvailableModels();
        const availableModels = models.filter(m => m.available);
        
        if (availableModels.length > 0) {
          logger.log(`✅ ${availableModels.length} modelo(s) disponível(is):`);
          availableModels.forEach(model => {
            logger.log(`  - ${model.name} (${model.resolution}, ${model.memory_usage})`);
          });
        } else {
          logger.log('⚠️  Serviço online mas nenhum modelo disponível');
        }
      } catch (error) {
        logger.error('❌ Erro ao buscar modelos:', error);
      }
    } else {
      logger.log('❌ Serviço local offline');
    }
  } else {
    logger.log('⚠️  LOCAL_AI_URL não configurada');
  }

  // Verificar configurações opcionais
  const restrictChannel = process.env.RESTRICT_TO_CHANNEL_ID;
  if (restrictChannel) {
    logger.log(`🔒 Bot restrito ao canal: ${restrictChannel}`);
  }

  const superUsers = process.env.SUPER_USERS;
  if (superUsers) {
    const userCount = superUsers.split(',').length;
    logger.log(`👑 ${userCount} super user(s) configurado(s)`);
  }

  logger.log('\n🎉 Verificação completa! O Stella Bot está pronto para brilhar.');
}

checkConfiguration().catch(error => {
  logger.error('Erro na verificação:', error);
  process.exit(1);
});
