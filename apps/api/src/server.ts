import { buildApp } from './app.js';
import { config } from './shared/config/index.js';
import { prisma, redis } from './shared/db/index.js';
import { logger } from './shared/logger/index.js';

const app = buildApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');

  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await Promise.all([prisma.$disconnect(), redis.quit()]);
    clearTimeout(timeout);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
