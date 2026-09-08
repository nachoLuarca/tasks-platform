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
 * column for the dispatcher to filter on. Exactly one of `actorId`/
 * `apiKeyActorId` must be given; every call site in this codebase passes
 * `actorId` (a human triggered it, always, today) -- `apiKeyActorId` exists
 * so the model and mapper are exercised end to end by
 * test/integration/webhooks-and-api-keys.test.ts ("activity log records an
 * API key actor") even though no HTTP route currently produces one, see
 * shared/authorization/api-key-scopes.ts for why.
 */
export interface RecordActivityInput {
  taskId: string;
  organizationId: string;
  actorId?: string;
  apiKeyActorId?: string;
  type: TaskActivityType;
  before: unknown;
  after: unknown;
}
