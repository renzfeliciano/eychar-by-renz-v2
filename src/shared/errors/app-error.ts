export type AppErrorKind =
  | "authentication"
  | "authorization"
  | "validation"
  | "not_found"
  | "conflict"
  | "business_rule"
  | "rate_limited"
  | "database"
  | "unexpected";

const STATUS_BY_KIND: Record<AppErrorKind, number> = {
  authentication: 401,
  authorization: 403,
  validation: 400,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  rate_limited: 429,
  database: 500,
  unexpected: 500,
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status: number;
  readonly details?: unknown;

  constructor(kind: AppErrorKind, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.kind = kind;
    this.status = STATUS_BY_KIND[kind];
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super("authentication", message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Not authorized") {
    super("authorization", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details?: unknown) {
    super("validation", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super("conflict", message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super("business_rule", message);
  }
}

/** Too many requests in the current window; `retryAfterSeconds` feeds the Retry-After header. */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = "Too many requests — please wait a few minutes and try again.", retryAfterSeconds = 60) {
    super("rate_limited", message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
