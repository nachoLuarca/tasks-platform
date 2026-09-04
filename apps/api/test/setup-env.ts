import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run the real config loader against real env vars (no mocking), so
// they need the same .env a developer would use locally. CI environments
// that inject variables directly won't have this file, hence the guard.
const envPath = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env');

// Set before loading .env: Node's loadEnvFile, like dotenv, never overrides
// a variable that is already present in process.env.
process.env.RATE_LIMIT_ENABLED ??= 'false';
process.env.ARGON2_MEMORY_COST_KIB ??= '1024';
process.env.ARGON2_TIME_COST ??= '2';
process.env.ARGON2_PARALLELISM ??= '1';

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
