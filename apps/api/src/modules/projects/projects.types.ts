import type { ProjectStatus } from '@tasks-platform/contracts';

export interface ProjectEntity {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  taskCounter: number;
  /** Exactly one of the two is non-null: the creating user, or the creating API key. */
  createdById: string | null;
  createdByApiKeyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  organizationId: string;
  key: string;
  name: string;
  description?: string;
  createdById: string | null;
  createdByApiKeyId: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface ListProjectsFilter {
  status?: ProjectStatus;
}
