import { ConflictError } from '../../shared/errors/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import { projectsRepository } from './projects.repository.js';
import type { ProjectEntity } from './projects.types.js';
import type { ProjectStatus } from '@tasks-platform/contracts';

export const projectsService = {
  async create(
    organizationId: string,
    createdById: string,
    key: string,
    name: string,
    description?: string,
  ): Promise<ProjectEntity> {
    const existing = await projectsRepository.findByKey(organizationId, key);
    if (existing) {
      throw new ConflictError('A project with this key already exists in the organization');
    }
    return projectsRepository.create({ organizationId, key, name, description, createdById });
  },

  async list(
    organizationId: string,
    status: ProjectStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<Page<ProjectEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await projectsRepository.list(organizationId, { status }, cursorId, limit);
    return buildPage(rows, limit);
  },

  /** Trusts `project` was already resolved (and scoped to the organization) by `requireProject`. */
  async update(project: ProjectEntity, input: { name?: string; description?: string | null }): Promise<ProjectEntity> {
    return projectsRepository.update(project.id, input);
  },

  async archive(project: ProjectEntity): Promise<ProjectEntity> {
    if (project.status === 'ARCHIVED') {
      throw new ConflictError('Project is already archived');
    }
    return projectsRepository.updateStatus(project.id, 'ARCHIVED');
  },

  async unarchive(project: ProjectEntity): Promise<ProjectEntity> {
    if (project.status === 'ACTIVE') {
      throw new ConflictError('Project is already active');
    }
    return projectsRepository.updateStatus(project.id, 'ACTIVE');
  },

  async remove(project: ProjectEntity): Promise<void> {
    await projectsRepository.softDelete(project.id);
  },
};
