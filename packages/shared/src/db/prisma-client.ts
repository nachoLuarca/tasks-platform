import { PrismaClient, type Prisma } from '@prisma/client';

import { sharedConfig } from '../config/index.js';

/**
 * Single Prisma instance shared by every process's code, though never
 * literally shared across processes -- the api and the worker are separate
 * Node processes, each with its own instance of this module. What's shared
 * is the instantiation logic (query-event logging, log level, ...), so it
 * never drifts between the two the way apps/api/src/shared/db/prisma-client.ts
 * did before this module existed.
 */
export const prisma = new PrismaClient({
  datasourceUrl: sharedConfig.database.url,
  log: [
    { emit: 'event', level: 'query' },
    ...(sharedConfig.isDevelopment
      ? ([{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }] as const)
      : ([{ emit: 'stdout', level: 'error' }] as const)),
  ],
});

/**
 * A repository can run against the shared client or against a transaction
 * handle - this is the only thing services know about persistence when they
 * need to compose a multi-repository unit of work.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;
