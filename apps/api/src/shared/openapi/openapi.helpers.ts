import { extendZodWithOpenApi, type OpenAPIRegistry, type ResponseConfig, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { problemDetailsSchema, validationProblemDetailsSchema } from '@tasks-platform/contracts';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';

import type { Permission } from '../authorization/permissions.js';
import {
  type AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  ServiceUnavailableError,
  UnauthorizedError,
  UnprocessableEntityError,
  ValidationError,
} from '../errors/app-error.js';
import { toProblemDetails } from '../errors/problem-details.js';

// Adds `.openapi()` (component names, parameter descriptions) to every Zod
// schema -- including the ones packages/contracts already built, since both
// packages resolve the same zod instance and this patches its prototype.
//
// Nothing in this folder may import config, the logger or a database client:
// the document is also built by scripts/check-openapi.ts, with no env at all.
extendZodWithOpenApi(z);

export const BEARER_AUTH = 'bearerAuth';
export const REFRESH_TOKEN_COOKIE_AUTH = 'refreshTokenCookie';

/** One tag per domain module, in the order Swagger UI lists them. */
export const API_TAGS = [
  { name: 'auth', description: 'Registro, inicio y cierre de sesion, y renovacion del access token con refresh token rotativo.' },
  { name: 'email-verification', description: 'Verificacion del correo de la cuenta. No bloquea el uso de la API (ADR 0011).' },
  { name: 'password-reset', description: 'Recuperacion de contraseña por correo, con respuesta uniforme exista o no la cuenta (ADR 0011).' },
  { name: 'users', description: 'Perfil y contraseña del usuario autenticado.' },
  { name: 'organizations', description: 'Organizaciones: alta, edicion, baja y transferencia de propiedad.' },
  { name: 'members', description: 'Miembros de una organizacion y sus roles.' },
  { name: 'invitations', description: 'Invitaciones a una organizacion, con enlace enviado por correo.' },
  { name: 'projects', description: 'Proyectos de una organizacion, con key unica y archivado.' },
  { name: 'tasks', description: 'Tareas numeradas por proyecto, con bloqueo optimista, filtros y asignacion.' },
  { name: 'comments', description: 'Comentarios de una tarea.' },
  { name: 'labels', description: 'Etiquetas reutilizables de la organizacion.' },
  { name: 'activity', description: 'Bitacora de cambios de una tarea, de solo lectura.' },
  { name: 'webhooks', description: 'Webhooks salientes firmados: alta, rotacion del secreto, prueba e historial de entregas.' },
  { name: 'api-keys', description: 'API keys de organizacion con scopes propios.' },
] as const;
export type ApiTag = (typeof API_TAGS)[number]['name'];

const ProblemDetails = problemDetailsSchema.openapi('ProblemDetails');
const ValidationProblemDetails = validationProblemDetailsSchema.openapi('ValidationProblemDetails');

export type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503;

/**
 * Real error instances, rendered below by the same function the error
 * middleware uses. No `detail`: the same example is shown on every route, and
 * a specific message ("Task not found") would be wrong on most of them.
 */
const PROBLEM_EXAMPLES: Record<ProblemStatus, AppError> = {
  400: new ValidationError(undefined, { formErrors: [], fieldErrors: { '<campo>': ['<mensaje de validacion>'] } }),
  401: new UnauthorizedError(),
  403: new ForbiddenError(),
  404: new NotFoundError(),
  409: new ConflictError(),
  422: new UnprocessableEntityError(),
  429: new TooManyRequestsError(60),
  503: new ServiceUnavailableError(),
};

const EXAMPLE_REQUEST_ID = '3f0c8a2e-5b1d-4c7e-9a6f-2d8e4b1c7a90';

const DEFAULT_PROBLEM_DESCRIPTIONS: Record<ProblemStatus, string> = {
  400: 'El cuerpo o los parametros de consulta no pasan la validacion; `errors` detalla cada campo.',
  401: 'Falta la credencial, o es invalida, esta vencida o fue revocada.',
  403: 'La credencial es valida pero no alcanza para esta accion.',
  404: 'El recurso no existe o quien llama no puede verlo (nunca se distingue con un 403).',
  409: 'La operacion choca con el estado actual del recurso.',
  422: 'La peticion es valida pero no se puede procesar.',
  429: 'Demasiados intentos; reintentar despues de `Retry-After` segundos.',
  503: 'Una dependencia necesaria para la peticion (Redis) no responde; reintentar en unos segundos.',
};

function uuidParameter(description: string): ZodTypeAny {
  return z.string().uuid().openapi({ param: { description } });
}

/** Every `:param` an Express route uses must be described here, or building the document throws. */
const PATH_PARAMETERS: Record<string, ZodTypeAny> = {
  organizationId: uuidParameter('ID de la organizacion.'),
  projectId: uuidParameter('ID del proyecto.'),
  taskId: uuidParameter('ID de la tarea.'),
  commentId: uuidParameter('ID del comentario.'),
  labelId: uuidParameter('ID de la etiqueta.'),
  webhookId: uuidParameter('ID del webhook.'),
  apiKeyId: uuidParameter('ID de la API key.'),
  userId: uuidParameter('ID del usuario miembro.'),
  id: uuidParameter('ID de la invitacion.'),
  token: z.string().openapi({ param: { description: 'Token opaco de un solo uso, tal como llego en el enlace del correo.' } }),
};

const SECURITY: Record<OperationSpec['auth'], RouteConfig['security']> = {
  public: [],
  bearer: [{ [BEARER_AUTH]: [] }],
  refreshCookie: [{ [REFRESH_TOKEN_COOKIE_AUTH]: [] }],
};

export interface OperationSpec {
  operationId: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Express syntax, exactly as the router mounts it (`/v1/organizations/:organizationId`). */
  path: string;
  tag: ApiTag;
  summary: string;
  description?: string;
  /** `bearer`: a JWT access token or an API key in `Authorization`. `refreshCookie`: the refresh token cookie. */
  auth: 'public' | 'bearer' | 'refreshCookie';
  /** Flat permission checked by `requirePermission` (a role for a user, a scope for an API key). */
  permission?: Permission;
  /** `requireUserId`/`requireUserActor`: an API key gets a 403 even with every scope. */
  usersOnly?: boolean;
  body?: ZodTypeAny;
  query?: AnyZodObject;
  responses: Record<number, ResponseConfig>;
  /**
   * Error responses beyond the ones inferred from the rest of the spec (400
   * with a body or query, 401 unless public, 403 with a permission or
   * `usersOnly`, 404 with path parameters). Also overrides their description.
   */
  errors?: Partial<Record<ProblemStatus, string>>;
}

export function jsonResponse(description: string, schema: ZodTypeAny, headers?: ResponseConfig['headers']): ResponseConfig {
  return { description, headers, content: { 'application/json': { schema } } };
}

export function emptyResponse(description: string, headers?: ResponseConfig['headers']): ResponseConfig {
  return { description, headers };
}

export function registerOperation(registry: OpenAPIRegistry, spec: OperationSpec): void {
  const parameterNames: string[] = [];
  const path = spec.path.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    parameterNames.push(name);
    return `{${name}}`;
  });

  const errors: Partial<Record<ProblemStatus, string>> = {};
  if (spec.body || spec.query) {
    errors[400] = DEFAULT_PROBLEM_DESCRIPTIONS[400];
  }
  if (spec.auth !== 'public') {
    errors[401] = DEFAULT_PROBLEM_DESCRIPTIONS[401];
  }
  if (spec.permission || spec.usersOnly) {
    errors[403] = forbiddenDescription(spec);
  }
  if (parameterNames.length > 0) {
    errors[404] = DEFAULT_PROBLEM_DESCRIPTIONS[404];
  }
  Object.assign(errors, spec.errors);

  const responses: RouteConfig['responses'] = {};
  for (const [status, response] of Object.entries(spec.responses)) {
    responses[status] = response;
  }
  for (const [status, description] of Object.entries(errors)) {
    if (description) {
      responses[status] = problemResponse(Number(status) as ProblemStatus, description);
    }
  }

  registry.registerPath({
    method: spec.method,
    path,
    operationId: spec.operationId,
    tags: [spec.tag],
    summary: spec.summary,
    description: buildDescription(spec),
    security: SECURITY[spec.auth],
    request: {
      params:
        parameterNames.length > 0
          ? z.object(Object.fromEntries(parameterNames.map((name) => [name, pathParameter(name)])))
          : undefined,
      query: spec.query,
      body: spec.body ? { required: true, content: { 'application/json': { schema: spec.body } } } : undefined,
    },
    responses,
  });
}

function pathParameter(name: string): ZodTypeAny {
  const schema = PATH_PARAMETERS[name];
  if (!schema) {
    throw new Error(`Path parameter ":${name}" has no OpenAPI description; add it to PATH_PARAMETERS`);
  }
  return schema;
}

function problemResponse(status: ProblemStatus, description: string): ResponseConfig {
  return {
    description,
    headers:
      status === 429
        ? { 'Retry-After': { description: 'Segundos a esperar antes de reintentar.', schema: { type: 'integer' } } }
        : undefined,
    content: {
      'application/problem+json': {
        schema: status === 400 ? ValidationProblemDetails : ProblemDetails,
        example: toProblemDetails(PROBLEM_EXAMPLES[status], EXAMPLE_REQUEST_ID),
      },
    },
  };
}

function forbiddenDescription(spec: OperationSpec): string {
  const reasons: string[] = [];
  if (spec.permission) {
    reasons.push(`falta el permiso \`${spec.permission}\` (o el scope, si la credencial es una API key)`);
  }
  if (spec.usersOnly) {
    reasons.push('la credencial es una API key, y esta accion es solo para usuarios');
  }
  const text = reasons.join(', o ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function buildDescription(spec: OperationSpec): string | undefined {
  const paragraphs = [
    spec.description,
    spec.permission ? `**Permiso:** \`${spec.permission}\`. Una API key necesita ese mismo scope.` : undefined,
    spec.usersOnly ? '**Solo usuarios:** una API key recibe `403`.' : undefined,
  ].filter((paragraph): paragraph is string => Boolean(paragraph));
  return paragraphs.length > 0 ? paragraphs.join('\n\n') : undefined;
}
