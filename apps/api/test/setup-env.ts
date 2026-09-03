import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests run the real config loader against real env vars (no mocking), so
// they need the same .env a developer would use locally. CI environments
// that inject variables directly won't have this file, hence the guard.
const envPath = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
