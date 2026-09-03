import { PrismaClient } from '@prisma/client';

import { config } from '../config/index.js';

/**
 * Single Prisma instance shared by the whole process. Never instantiate
 * PrismaClient anywhere else.
 */
export const prisma = new PrismaClient({
  datasourceUrl: config.database.url,
  log: config.isDevelopment ? ['warn', 'error'] : ['error'],
});
