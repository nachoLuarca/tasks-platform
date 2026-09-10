import type { TaskPriority, TaskStatus } from '@tasks-platform/contracts';

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
}

export interface TaskLabelSummary {
  id: string;
  name: string;
  color: string;
}

export interface TaskEntity {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee: TaskAssignee | null;
  /** Exactly one of the two is non-null: the creating user, or the creating API key. */
  createdById: string | null;
  createdByApiKeyId: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  version: number;
  labels: TaskLabelSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  assigneeId?: string;
  dueDate?: Date;
  createdById: string | null;
  createdByApiKeyId: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  completedAt?: Date | null;
}

export interface TaskListFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  unassigned?: boolean;
  dueBefore?: Date;
  dueAfter?: Date;
  search?: string;
  labelId?: string;
}

export type TaskSortBy = 'createdAt' | 'dueDate' | 'priority';
export type TaskSortOrder = 'asc' | 'desc';
