import { prisma, redis } from '../../shared/db/index.js';

export const healthRepository = {
  async checkDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },

  async checkRedis(): Promise<boolean> {
    try {
      const response = await redis.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  },
};
