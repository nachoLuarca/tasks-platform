import type { DbClient } from '../../shared/db/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { membersService } from '../members/members.service.js';
import { organizationsRepository } from './organizations.repository.js';
import type { OrganizationEntity } from './organizations.types.js';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : 'org';
}

async function generateUniqueSlug(name: string, client: DbClient | undefined): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (await organizationsRepository.findBySlug(candidate, client)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export const organizationsService = {
  /** Creates an organization and adds `ownerId` as its first member. */
  async createOrganization(
    name: string,
    ownerId: string,
    client?: DbClient,
  ): Promise<OrganizationEntity> {
    const slug = await generateUniqueSlug(name, client);
    const organization = await organizationsRepository.create({ name, slug }, client);
    await membersService.addOwner(ownerId, organization.id, client);
    return organization;
  },

  async listForUser(userId: string): Promise<OrganizationEntity[]> {
    return organizationsRepository.listForUser(userId);
  },

  /** Only reachable once `requireMembership` has already confirmed the caller belongs to it. */
  async getById(organizationId: string): Promise<OrganizationEntity> {
    const organization = await organizationsRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }
    return organization;
  },

  async update(organizationId: string, name: string): Promise<OrganizationEntity> {
    return organizationsRepository.update(organizationId, { name });
  },

  async remove(organizationId: string): Promise<void> {
    await organizationsRepository.softDelete(organizationId);
  },
};
