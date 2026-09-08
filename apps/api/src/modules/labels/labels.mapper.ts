import type { LabelResponse } from '@tasks-platform/contracts';

import type { LabelEntity } from './labels.types.js';

export function toLabelResponse(label: LabelEntity): LabelResponse {
  return {
    id: label.id,
    organizationId: label.organizationId,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}
