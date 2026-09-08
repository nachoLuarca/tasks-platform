import type { RequestHandler } from 'express';

import { NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { labelsRepository } from './labels.repository.js';

/** Resolves `:labelId`, scoped to the organization already resolved by `requireMembership`, onto `req.label`. */
export const requireLabel: RequestHandler = async (req, _res, next) => {
  if (!req.membership) {
    next(new UnauthorizedError('Missing membership context'));
    return;
  }

  const labelId = req.params.labelId as string;
  const label = await labelsRepository.findById(labelId, req.membership.organizationId);
  if (!label) {
    next(new NotFoundError('Label not found'));
    return;
  }

  req.label = label;
  next();
};
