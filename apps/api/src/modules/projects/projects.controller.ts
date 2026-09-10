import type { RequestHandler } from 'express';

import type { CreateProjectRequest, ProjectListQuery, UpdateProjectRequest } from '@tasks-platform/contracts';

import { requireUserId } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import { toProjectResponse } from './projects.mapper.js';
import { projectsService } from './projects.service.js';
import type { ProjectEntity } from './projects.types.js';

const getAuthenticatedUserId = requireUserId;

function getMembershipContext(req: { membership?: { organizationId: string } }): { organizationId: string } {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership;
}

function getProject(req: { project?: ProjectEntity }): ProjectEntity {
  if (!req.project) {
    throw new UnauthorizedError('Missing project context');
  }
  return req.project;
}

export const projectsController = {
  create: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const createdById = getAuthenticatedUserId(req);
    const body = req.body as CreateProjectRequest;

    const project = await projectsService.create(organizationId, createdById, body.key, body.name, body.description);
    res.status(201).json(toProjectResponse(project));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const query = req.query as unknown as ProjectListQuery;

    const page = await projectsService.list(organizationId, query.status, query.cursor, query.limit);
    res.status(200).json({ data: page.data.map(toProjectResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  getById: ((req, res) => {
    const project = getProject(req);
    res.status(200).json(toProjectResponse(project));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const project = getProject(req);
    const body = req.body as UpdateProjectRequest;

    const updated = await projectsService.update(project, body);
    res.status(200).json(toProjectResponse(updated));
  }) satisfies RequestHandler,

  archive: (async (req, res) => {
    const project = getProject(req);
    const updated = await projectsService.archive(project);
    res.status(200).json(toProjectResponse(updated));
  }) satisfies RequestHandler,

  unarchive: (async (req, res) => {
    const project = getProject(req);
    const updated = await projectsService.unarchive(project);
    res.status(200).json(toProjectResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const project = getProject(req);
    await projectsService.remove(project);
    res.status(204).send();
  }) satisfies RequestHandler,
};
