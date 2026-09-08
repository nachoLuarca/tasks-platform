import { ValidationError } from '../errors/index.js';

/**
 * Keyset ("cursor") pagination, not offset pagination: see
 * docs/adr/0006-cursor-pagination.md for why. The cursor is just a row id,
 * base64-encoded so it reads as an opaque token to clients -- they are never
 * meant to construct or inspect one, only pass back what `nextCursor` gave
 * them. Prisma's own `cursor` + `skip: 1` option resolves it against
 * whatever `orderBy` the query uses, including multi-field orderBy.
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    if (id.length === 0) {
      throw new Error('empty cursor');
    }
    return id;
  } catch {
    throw new ValidationError('Invalid pagination cursor');
  }
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Repositories fetch `limit + 1` rows; this trims the extra row (if present)
 * and turns it into the next cursor. `rows` must already be in the same
 * order the query used.
 */
export function buildPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.id) : null;
  return { data, nextCursor };
}
