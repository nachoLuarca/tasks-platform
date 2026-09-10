import type { RequestHandler } from 'express';

import type { AssignTaskRequest, CreateTaskRequest, SetTaskLabelsRequest, TaskListQuery, UpdateTaskRequest } from '@tasks-platform/contracts';

import { requireRole, requireUserId } from '../../shared/authorization/index.js';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type { ProjectEntity } from '../projects/projects.types.js';
import { toTaskResponse } from './tasks.mapper.js';
import { tasksService } from './tasks.service.js';
import type { TaskEntity } from './tasks.types.js';

function getOrganizationId(req: { membership?: { organizationId: string } }): string {
  if (!req.membership) {
    throw new UnauthorizedError('Missing membership context');
  }
  return req.membership.organizationId;
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
    const createdById = requireUserId(req);
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
    const organizationId = getOrganizationId(req);
    const userId = requireUserId(req);
    const query = req.query as unknown as TaskListQuery;

    const page = await tasksService.listAssignedToUser(organizationId, userId, query);
    res.status(200).json({ data: page.data.map(toTaskResponse), nextCursor: page.nextCursor });
  }) satisfies RequestHandler,

  getById: ((req, res) => {
    const task = getTask(req);
    res.status(200).json(toTaskResponse(task));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const task = getTask(req);
    const organizationId = getOrganizationId(req);
    const role = requireRole(req);
    const actorId = requireUserId(req);
    const body = req.body as UpdateTaskRequest;

    const updated = await tasksService.update(task, role, actorId, organizationId, body);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const task = getTask(req);
    const role = requireRole(req);
    const actorId = requireUserId(req);

    await tasksService.remove(task, role, actorId);
    res.status(204).send();
  }) satisfies RequestHandler,

  assign: (async (req, res) => {
    const task = getTask(req);
    const organizationId = getOrganizationId(req);
    const role = requireRole(req);
    const actorId = requireUserId(req);
    const body = req.body as AssignTaskRequest;

    const updated = await tasksService.assign(task, role, actorId, organizationId, body.userId);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,

  unassign: (async (req, res) => {
    const task = getTask(req);
    const organizationId = getOrganizationId(req);
    const role = requireRole(req);
    const actorId = requireUserId(req);

    const updated = await tasksService.unassign(task, role, actorId, organizationId);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,

  setLabels: (async (req, res) => {
    const task = getTask(req);
    const organizationId = getOrganizationId(req);
    const role = requireRole(req);
    const actorId = requireUserId(req);
    const body = req.body as SetTaskLabelsRequest;

    const updated = await tasksService.setLabels(task, role, actorId, organizationId, body.labelIds);
    res.status(200).json(toTaskResponse(updated));
  }) satisfies RequestHandler,
};
