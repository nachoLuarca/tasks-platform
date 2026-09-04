import { PrismaClient, type Prisma } from '@prisma/client';

import { config } from '../config/index.js';

/**
 * Single Prisma instance shared by the whole process. Never instantiate
 * PrismaClient anywhere else.
 */
export const prisma = new PrismaClient({
  datasourceUrl: config.database.url,
  log: config.isDevelopment ? ['warn', 'error'] : ['error'],
});

/**
 * A repository can run against the shared client or against a transaction
 * handle - this is the only thing services know about persistence when they
 * need to compose a multi-repository unit of work (e.g. registration
 * creating a user, an organization and a membership atomically). Services
 * only ever forward this value to their own repository; they never call
 * query methods on it directly.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;
