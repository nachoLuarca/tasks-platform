import type { DbClient } from '../../shared/db/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import { outboxRepository } from '../outbox/outbox.repository.js';
import { activityRepository } from './activity.repository.js';
import type { RecordActivityInput, TaskActivityEntity } from './activity.types.js';

export const activityService = {
  /**
   * The only way a TaskActivity row is ever written. `client` must be the
   * same transaction handle the caller used for the change itself (task
   * creation, an update, a new comment, ...), so PHASE.md decision 6 holds:
   * if that transaction rolls back, this entry never existed either. There
   * is deliberately no write endpoint anywhere in this module -- callers are
   * always another module's service, never an HTTP route.
   *
   * Also writes the matching OutboxEvent, in the same transaction, so a
   * webhook subscriber can eventually be notified of the same change (Phase
   * 4, PHASE.md decision 1; see docs/adr/0009-outbox-pattern.md). Every
   * TaskActivityType is publishable one-for-one as an OutboxEvent of the
   * same `type` name -- there's no curated subset, since PHASE.md's list of
   * what the activity log tracks (creation, status/priority/assignee/
   * due-date/title/labels, comments) is already exactly the set of changes
   * worth notifying an external system about.
   */
  async record(input: RecordActivityInput, client: DbClient): Promise<void> {
    await activityRepository.record(input, client);
    await outboxRepository.record(
      {
        organizationId: input.organizationId,
        type: input.type,
        payload: {
          taskId: input.taskId,
          type: input.type,
          changes: { before: input.before, after: input.after },
          actor: input.actorId
            ? { type: 'USER', id: input.actorId }
            : { type: 'API_KEY', id: input.apiKeyActorId },
          createdAt: new Date().toISOString(),
        },
      },
      client,
    );
  },

  async listForTask(taskId: string, cursor: string | undefined, limit: number): Promise<Page<TaskActivityEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await activityRepository.listForTask(taskId, cursorId, limit);
    return buildPage(rows, limit);
  },
};
