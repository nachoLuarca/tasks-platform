import { PrismaClient, type Prisma } from '@prisma/client';

import { config } from '../config/index.js';

/**
 * Single Prisma instance shared by the whole process. Never instantiate
 * PrismaClient anywhere else.
 */
/**
 * "query" is emitted as an event, not printed, so it's silent by default;
 * tests subscribe to it with `prisma.$on('query', ...)` to assert a listing
 * doesn't run one query per row (see tasks.test.ts). "warn"/"error" keep
 * being printed to stdout, same as before.
 */
export const prisma = new PrismaClient({
  datasourceUrl: config.database.url,
  log: [
    { emit: 'event', level: 'query' },
    ...(config.isDevelopment
      ? ([{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }] as const)
      : ([{ emit: 'stdout', level: 'error' }] as const)),
  ],
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
