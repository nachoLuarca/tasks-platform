import type { ProjectStatus } from '@tasks-platform/contracts';

export interface ProjectEntity {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  taskCounter: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  organizationId: string;
  key: string;
  name: string;
  description?: string;
  createdById: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface ListProjectsFilter {
  status?: ProjectStatus;
}
