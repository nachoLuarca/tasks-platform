import type { Prisma } from '@prisma/client';

import type { DbClient } from '../../shared/db/index.js';
import type { RecordOutboxEventInput } from './outbox.types.js';

export const outboxRepository = {
  /**
   * `client` is always the caller's own transaction handle (see
   * activity.service.ts), the same requirement as activityRepository.record
   * and for the same reason: if that transaction rolls back, this event
   * never existed either, so the worker's dispatcher can never pick up an
   * event for a change that didn't actually happen.
   */
  async record(input: RecordOutboxEventInput, client: DbClient): Promise<void> {
    await client.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  },
};
