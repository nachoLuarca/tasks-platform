import type { ReadinessResponse } from '@tasks-platform/contracts';

import { healthRepository } from './health.repository.js';

export const healthService = {
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  },

  async checkReadiness(): Promise<ReadinessResponse> {
    const [databaseOk, redisOk] = await Promise.all([
      healthRepository.checkDatabase(),
      healthRepository.checkRedis(),
    ]);

    const dependencies = {
      database: databaseOk ? ('ok' as const) : ('error' as const),
      redis: redisOk ? ('ok' as const) : ('error' as const),
    };

    return {
      status: databaseOk && redisOk ? 'ok' : 'error',
      dependencies,
    };
  },
};
