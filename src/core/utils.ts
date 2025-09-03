import { logger } from './logger.js';

/**
 * Verifica se um usuário é um Super User
 * Super Users ignoram todas as restrições (canal, conteúdo, etc.)
 * @param userId - ID do usuário do Discord
 * @param logDetection - Se deve logar quando detectar um super user (padrão: true)
 * @returns true se o usuário for um Super User
 */
export function isSuperUser(userId: string, logDetection: boolean = true): boolean {
  const superUsers = process.env.SUPER_USERS?.split(',').map(id => id.trim()) || [];
  const isSuper = superUsers.includes(userId);
  
  if (isSuper && logDetection) {
    logger.log(`👑 Super user detectado: ${userId} - Todas as restrições ignoradas`);
  }
  
  return isSuper;
}
