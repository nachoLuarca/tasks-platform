import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const apiRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const tsxCli = path.join(apiRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runWithEnv(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsxCli, 'src/shared/config/config.ts'], {
    cwd: apiRoot,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf-8',
  });
}

const validEnv = {
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('config', () => {
  it('exits with a message naming the missing variable', () => {
    const { DATABASE_URL: _databaseUrl, ...envWithoutDatabaseUrl } = validEnv;
    const result = runWithEnv(envWithoutDatabaseUrl);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('starts successfully when every required variable is present', () => {
    const result = runWithEnv(validEnv);

    expect(result.status).toBe(0);
  });
});
