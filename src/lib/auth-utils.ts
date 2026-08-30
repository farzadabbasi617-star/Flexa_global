import argon2 from 'argon2';
import logger from './logger';

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 32768,
      timeCost: 2,
      parallelism: 1,
    });
  } catch (error) {
    logger.error({ error }, 'Hashing method failed');
    throw new Error('Security system failure');
  }
}

export async function comparePassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error({ error }, 'Password verification failed');
    return false;
  }
}
