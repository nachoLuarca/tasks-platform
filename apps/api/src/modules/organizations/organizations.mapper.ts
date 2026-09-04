import type { OrganizationResponse } from '@tasks-platform/contracts';

import type { OrganizationEntity } from './organizations.types.js';

export function toOrganizationResponse(organization: OrganizationEntity): OrganizationResponse {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
  };
}
