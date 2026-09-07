import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '../../src/shared/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../prisma/migrations');
const SCHEMA = `phase1_backfill_check_${randomUUID().replace(/-/g, '')}`;

function readMigration(folder: string): string {
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8');
}

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function run(sql: string, exec: (statement: string) => Promise<unknown>): Promise<void> {
  for (const statement of statements(sql)) {
    await exec(statement);
  }
}

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await prisma.$disconnect();
});

describe('migration 20260907210755_add_roles_and_invitations', () => {
  it('backfills every pre-existing Membership row as OWNER', async () => {
    // Replays both migrations, in order, against a throwaway schema, with a
    // hand-inserted row standing in for real Phase 1 data created before the
    // "role" column existed. This is the only way to actually exercise the
    // backfill UPDATE statement, since the real test database is always
    // fully migrated before this suite runs.
    const initIdentitySql = readMigration('20260904161931_init_identity');
    const addRolesSql = readMigration('20260907210755_add_roles_and_invitations');

    const userId = randomUUID();
    const organizationId = randomUUID();
    const membershipId = randomUUID();

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);

        await run(initIdentitySql, (statement) => tx.$executeRawUnsafe(statement));

        // Simulates a Phase 1 row: created before "role" existed at all.
        await tx.$executeRawUnsafe(
          `INSERT INTO "User" (id, email, "passwordHash", name, "updatedAt") VALUES ('${userId}', 'phase1@example.com', 'x', 'Phase One', now())`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ('${organizationId}', 'Phase One Org', 'phase-one-org', now())`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Membership" (id, "userId", "organizationId") VALUES ('${membershipId}', '${userId}', '${organizationId}')`,
        );

        await run(addRolesSql, (statement) => tx.$executeRawUnsafe(statement));
      },
      { timeout: 20_000 },
    );

    const rows = await prisma.$queryRawUnsafe<{ role: string }[]>(
      `SELECT role FROM "${SCHEMA}"."Membership" WHERE id = '${membershipId}'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('OWNER');
  });
});
