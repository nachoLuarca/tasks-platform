import { prisma } from '../../shared/db/index.js';
import { ConflictError, UnprocessableEntityError } from '../../shared/errors/index.js';
import { buildPage, decodeCursor, type Page } from '../../shared/pagination/index.js';
import { activityService } from '../activity/activity.service.js';
import { labelsRepository } from './labels.repository.js';
import type { LabelEntity } from './labels.types.js';

export const labelsService = {
  async create(organizationId: string, name: string, color: string): Promise<LabelEntity> {
    const existing = await labelsRepository.findByNameCaseInsensitive(organizationId, name);
    if (existing) {
      throw new ConflictError('A label with this name already exists in the organization');
    }
    return labelsRepository.create({ organizationId, name, color });
  },

  async list(organizationId: string, cursor: string | undefined, limit: number): Promise<Page<LabelEntity>> {
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = await labelsRepository.list(organizationId, cursorId, limit);
    return buildPage(rows, limit);
  },

  async update(label: LabelEntity, input: { name?: string; color?: string }): Promise<LabelEntity> {
    if (input.name && input.name.toLowerCase() !== label.name.toLowerCase()) {
      const existing = await labelsRepository.findByNameCaseInsensitive(label.organizationId, input.name);
      if (existing) {
        throw new ConflictError('A label with this name already exists in the organization');
      }
    }
    return labelsRepository.update(label.id, input);
  },

  /** Detaches the label from every task that used it; the label row itself is removed, tasks are untouched. */
  async remove(label: LabelEntity): Promise<void> {
    await labelsRepository.remove(label.id);
  },

  /**
   * Replaces a task's whole label set in one call and records a single
   * LABELS_CHANGED entry with the before/after name lists, in the same
   * transaction as the write (PHASE.md decision 6). Callers (tasks.service)
   * are responsible for the task:update:own/:any authorization check before
   * calling this -- this function only validates that the requested labels
   * actually belong to the organization.
   */
  async setTaskLabels(organizationId: string, taskId: string, actorId: string, labelIds: string[]): Promise<LabelEntity[]> {
    const uniqueIds = [...new Set(labelIds)];
    const validLabels = await labelsRepository.findManyByIds(organizationId, uniqueIds);
    if (validLabels.length !== uniqueIds.length) {
      throw new UnprocessableEntityError('One or more labels do not belong to this organization');
    }

    return prisma.$transaction(async (tx) => {
      const before = await labelsRepository.listForTask(taskId, tx);
      await labelsRepository.replaceTaskLabels(taskId, uniqueIds, tx);
      await activityService.record(
        {
          taskId,
          actorId,
          type: 'LABELS_CHANGED',
          before: before.map((label) => label.name),
          after: validLabels.map((label) => label.name),
        },
        tx,
      );
      return validLabels;
    });
  },

  async listForTask(taskId: string): Promise<LabelEntity[]> {
    return labelsRepository.listForTask(taskId);
  },
};
