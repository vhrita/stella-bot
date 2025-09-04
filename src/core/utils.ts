import { User } from 'discord.js';
import { logger } from './logger.js';
import { config } from './config.js';

/**
 * Valida se um usuário tem permissões de super usuário
 * Baseado na lista de IDs definida na variável de ambiente SUPER_USERS
 */
export function isSuperUser(user: User): boolean {
  const superUsers = config.SUPER_USERS?.split(',').map(id => id.trim()) || [];
  
  const isSuper = superUsers.includes(user.id);
  
  if (isSuper) {
    logger.log(`🌟 Super User detectado: ${user.username} (${user.id})`);
  }
  
  return isSuper;
}
