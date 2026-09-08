import type { RequestHandler } from 'express';

import type { CreateLabelRequest, LabelListQuery, UpdateLabelRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import { toLabelResponse } from './labels.mapper.js';
import { labelsService } from './labels.service.js';
import type { LabelEntity } from './labels.types.js';

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
}

function getLabel(req: { label?: LabelEntity }): LabelEntity {
  if (!req.label) {
    throw new UnauthorizedError('Missing label context');
  }
  return req.label;
}

export const labelsController = {
  create: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const body = req.body as CreateLabelRequest;

    const label = await labelsService.create(organizationId, body.name, body.color);
    res.status(201).json(toLabelResponse(label));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const organizationId = getOrganizationId(req);
    const query = req.query as unknown as LabelListQuery;

    const page = await labelsService.list(organizationId, query.cursor, query.limit);
    res.status(200).json({ data: page.data.map(toLabelResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const label = getLabel(req);
    const body = req.body as UpdateLabelRequest;

    const updated = await labelsService.update(label, body);
    res.status(200).json(toLabelResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const label = getLabel(req);
    await labelsService.remove(label);
    res.status(204).send();
  }) satisfies RequestHandler,
};
