import type { RequestHandler } from 'express';

import type { AssignTaskRequest, CreateTaskRequest, Role, TaskListQuery, UpdateTaskRequest } from '@tasks-platform/contracts';

import { UnauthorizedError } from '../../shared/errors/index.js';
import type { ProjectEntity } from '../projects/projects.types.js';
import { toTaskResponse } from './tasks.mapper.js';
import { tasksService } from './tasks.service.js';
import type { TaskEntity } from './tasks.types.js';

function getAuthenticatedUserId(req: { auth?: { userId: string } }): string {
  if (!req.auth) {
    throw new UnauthorizedError('Missing authentication context');
  }
  return req.auth.userId;
}

function getMembershipContext(req: {
  membership?: { organizationId: string; role: Role };
}): { organizationId: string; role: Role } {
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

function getTask(req: { task?: TaskEntity }): TaskEntity {
  if (!req.task) {
    throw new UnauthorizedError('Missing task context');
  }
  return req.task;
}

export const tasksController = {
  create: (async (req, res) => {
    const project = getProject(req);
    const createdById = getAuthenticatedUserId(req);
    const body = req.body as CreateTaskRequest;

    const task = await tasksService.create(project, createdById, body);
    res.status(201).json(toTaskResponse(task));
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const project = getProject(req);
    const query = req.query as unknown as TaskListQuery;

    const page = await tasksService.list(project, query);
    res.status(200).json({ data: page.data.map(toTaskResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  listAssignedToMe: (async (req, res) => {
    const { organizationId } = getMembershipContext(req);
    const userId = getAuthenticatedUserId(req);
    const query = req.query as unknown as TaskListQuery;

    const page = await tasksService.listAssignedToUser(organizationId, userId, query);
    res.status(200).json({ data: page.data.map(toTaskResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  getById: (async (req, res) => {
    const task = getTask(req);
    res.status(200).json(toTaskResponse(task));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const task = getTask(req);
    const { role } = getMembershipContext(req);
    const actorId = getAuthenticatedUserId(req);
    const body = req.body as UpdateTaskRequest;

    const updated = await tasksService.update(task, role, actorId, body);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const task = getTask(req);
    const { role } = getMembershipContext(req);
    const actorId = getAuthenticatedUserId(req);

    await tasksService.remove(task, role, actorId);
    res.status(204).send();
  }) satisfies RequestHandler,

  assign: (async (req, res) => {
    const task = getTask(req);
    const { organizationId } = getMembershipContext(req);
    const body = req.body as AssignTaskRequest;

    const updated = await tasksService.assign(task, organizationId, body.userId);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,

  unassign: (async (req, res) => {
    const task = getTask(req);
    const updated = await tasksService.unassign(task);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,
};
