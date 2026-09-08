/**
 * Base class for every expected application error. Carries enough
 * information to be rendered as an RFC 9457 Problem Details response.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail?: string;

  constructor(params: { status: number; type: string; title: string; detail?: string }) {
    super(params.detail ?? params.title);
    this.name = this.constructor.name;
    this.status = params.status;
    this.type = params.type;
    this.title = params.title;
    this.detail = params.detail;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(detail?: string) {
    super({
      status: 404,
      type: 'https://tasks-platform.dev/errors/not-found',
      title: 'Not Found',
      detail,
    });
  }
}

export class ValidationError extends AppError {
  public readonly errors?: unknown;

  constructor(detail?: string, errors?: unknown) {
    super({
      status: 400,
      type: 'https://tasks-platform.dev/errors/validation',
      title: 'Validation Error',
      detail,
    });
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super({
      status: 401,
      type: 'https://tasks-platform.dev/errors/unauthorized',
      title: 'Unauthorized',
      detail,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super({
      status: 403,
      type: 'https://tasks-platform.dev/errors/forbidden',
      title: 'Forbidden',
      detail,
    });
  }
}

export class ConflictError extends AppError {
  constructor(detail?: string) {
    super({
      status: 409,
      type: 'https://tasks-platform.dev/errors/conflict',
      title: 'Conflict',
      detail,
    });
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(detail?: string) {
    super({
      status: 422,
      type: 'https://tasks-platform.dev/errors/unprocessable-entity',
      title: 'Unprocessable Entity',
      detail,
    });
  }
}

export class TooManyRequestsError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, detail?: string) {
    super({
      status: 429,
      type: 'https://tasks-platform.dev/errors/too-many-requests',
      title: 'Too Many Requests',
      detail,
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
