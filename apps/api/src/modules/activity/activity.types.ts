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

export interface TaskActivityEntity {
  id: string;
  taskId: string;
  actorId: string;
  type: TaskActivityType;
  changes: TaskActivityChange;
  createdAt: Date;
}

export interface RecordActivityInput {
  taskId: string;
  actorId: string;
  type: TaskActivityType;
  before: unknown;
  after: unknown;
}
