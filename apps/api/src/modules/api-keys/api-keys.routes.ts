import { Router } from 'express';

import { createApiKeyRequestSchema } from '@tasks-platform/contracts';

import { requirePermission } from '../../shared/authorization/index.js';
import { validateBody } from '../../shared/http/index.js';
import { apiKeysController } from './api-keys.controller.js';

/** Mounted at /v1/organizations/:organizationId/api-keys, behind requireMembership. Every route needs `apikey:manage` (ADMIN/OWNER only) -- see permissions.ts. */
export const apiKeysRouter = Router({ mergeParams: true });

apiKeysRouter.post('/', requirePermission('apikey:manage'), validateBody(createApiKeyRequestSchema), apiKeysController.create);
apiKeysRouter.get('/', requirePermission('apikey:manage'), apiKeysController.list);
apiKeysRouter.delete('/:apiKeyId', requirePermission('apikey:manage'), apiKeysController.revoke);
