import type { TaskPriority, TaskStatus } from '@tasks-platform/contracts';

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
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
  createdById: string;
  dueDate: Date | null;
  completedAt: Date | null;
  version: number;
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
  createdById: string;
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
}

export type TaskSortBy = 'createdAt' | 'dueDate' | 'priority';
export type TaskSortOrder = 'asc' | 'desc';
