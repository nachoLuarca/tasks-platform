import type { Actor } from '../../shared/authorization/index.js';

export type TaskActivityType =
  | 'TASK_CREATED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNEE_CHANGED'
  | 'DUE_DATE_CHANGED'
  | 'TITLE_CHANGED'
  | 'LABELS_CHANGED'
  | 'COMMENT_ADDED';

export interface TaskActivityChange {
  before: unknown;
  after: unknown;
}

/** Exactly one of `user`/`apiKey` is ever set -- see the schema comment on TaskActivity. */
export type TaskActivityActor =
  | { type: 'USER'; id: string; name: string; email: string }
  | { type: 'API_KEY'; id: string; name: string; prefix: string };

export interface TaskActivityEntity {
  id: string;
  taskId: string;
  actor: TaskActivityActor;
  type: TaskActivityType;
  changes: TaskActivityChange;
  createdAt: Date;
}

/**
 * `organizationId` doesn't land on TaskActivity itself -- it's what lets
 * `record` also write the mirroring OutboxEvent (see activity.service.ts and
 * docs/adr/0009-outbox-pattern.md), which does need it as a top-level
 * column for the dispatcher to filter on. `actor` is whoever performed the
 * change: a member, or an API key writing in its own name (Phase 4.5) --
 * never the person who created that key.
 */
export interface RecordActivityInput {
  taskId: string;
  organizationId: string;
  actor: Actor;
  type: TaskActivityType;
  before: unknown;
  after: unknown;
}

/** Row shape for the repository: the actor already split into its two mutually exclusive columns. */
export interface CreateActivityRowInput {
  taskId: string;
  actorId: string | null;
  apiKeyActorId: string | null;
  type: TaskActivityType;
  before: unknown;
  after: unknown;
}
