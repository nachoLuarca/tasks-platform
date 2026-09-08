import type { DbClient } from '../../shared/db/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
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
   */
  async record(input: RecordActivityInput, client: DbClient): Promise<void> {
    await activityRepository.record(input, client);
  },

  async listForTask(taskId: string, cursor: string | undefined, limit: number): Promise<Page<TaskActivityEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await activityRepository.listForTask(taskId, cursorId, limit);
    return buildPage(rows, limit);
  },
};
