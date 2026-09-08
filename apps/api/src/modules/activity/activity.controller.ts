import type { RequestHandler } from 'express';

import type { TaskActivityListQuery } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import type { TaskEntity } from '../tasks/tasks.types.js';
import { toTaskActivityResponse } from './activity.mapper.js';
import { activityService } from './activity.service.js';

function getTask(req: { task?: TaskEntity }): TaskEntity {
  if (!req.task) {
    throw new UnauthorizedError('Missing task context');
  }
  return req.task;
}

/** Read-only: there is no route anywhere that writes to the activity log directly, see activity.service.ts. */
export const activityController = {
  list: (async (req, res) => {
    const task = getTask(req);
    const query = req.query as unknown as TaskActivityListQuery;

    const page = await activityService.listForTask(task.id, query.cursor, query.limit);
    res.status(200).json({ data: page.data.map(toTaskActivityResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,
};
