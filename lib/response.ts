import { NextResponse } from 'next/server';

/**
 * Standard response envelopes for the MockApp API.
 *
 * Success:
 *   { success: true,  message, data, meta? }
 *
 * Error:
 *   { success: false, message, errors, error_code, request_id }
 *
 * See docs/api/00-overview.md for the full design rationale.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type FieldErrors = Record<string, string[]>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_REFRESH_TOKEN_INVALID'
  | 'AUTH_ACCOUNT_DISABLED'
  | 'AUTHORIZATION_FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_ERROR'
  | 'FORCE_UPDATE_REQUIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MAINTENANCE_MODE'
  | 'INTERNAL_SERVER_ERROR';

interface SuccessParams<T> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
  status?: number;
}

interface ErrorParams {
  message: string;
  code: ErrorCode;
  errors?: FieldErrors | null;
  status?: number;
  headers?: Record<string, string>;
}

// ─── Request ID ───────────────────────────────────────────────────────────

function newRequestId(): string {
  // Web Crypto API is available globally in Node 19+, Edge runtime, and browsers.
  // Falling back to timestamp + Math.random keeps this safe in older runtimes.
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  return 'req_' + uuid.replace(/-/g, '').slice(0, 20);
}

// ─── Builders ─────────────────────────────────────────────────────────────

/**
 * Build a success response envelope: { success: true, message, data, meta? }.
 */
export function successResponse<T>({
  data,
  message = 'Success',
  meta,
  status = 200,
}: SuccessParams<T>) {
  const body: Record<string, unknown> = {
    success: true,
    message,
    data,
  };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { status });
}

/**
 * Build an error response envelope:
 *   { success: false, message, errors, error_code, request_id }
 */
export function errorResponse({
  message,
  code,
  errors = null,
  status = 400,
  headers,
}: ErrorParams) {
  const body = {
    success: false,
    message,
    errors,
    error_code: code,
    request_id: newRequestId(),
  };
  return NextResponse.json(body, { status, headers });
}

// ─── Field-error normalization ────────────────────────────────────────────

/**
 * Normalize validation details into the canonical FieldErrors map:
 *   { field: ["message", "message"] }
 *
 * Accepts both the legacy single-message-per-field shape
 *   { email: 'is required' }
 * and the canonical array shape
 *   { email: ['is required', 'must be valid'] }
 *
 * `undefined` / `null` values are dropped so route handlers can write
 *   { name: !name ? 'Name is required' : undefined }
 * without producing noise.
 */
function normalizeFieldErrors(
  details?: Record<string, unknown>
): FieldErrors | null {
  if (!details) return null;
  const out: FieldErrors = {};
  for (const [field, value] of Object.entries(details)) {
    if (value === undefined || value === null) continue;
    out[field] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─── Convenience error builders ───────────────────────────────────────────

export const Errors = {
  badRequest: (message = 'Bad request.') =>
    errorResponse({ code: 'BAD_REQUEST', message, status: 400 }),

  /**
   * Generic 401. Defaults to AUTH_TOKEN_INVALID — pass a more specific code
   * for known cases (expired, refresh invalid, invalid credentials).
   */
  unauthorized: (
    message = 'Authentication required.',
    code: ErrorCode = 'AUTH_TOKEN_INVALID'
  ) => errorResponse({ code, message, status: 401 }),

  invalidCredentials: (message = 'Invalid email or password.') =>
    errorResponse({ code: 'AUTH_INVALID_CREDENTIALS', message, status: 401 }),

  tokenExpired: (
    message = 'Your session has expired. Please sign in again.'
  ) => errorResponse({ code: 'AUTH_TOKEN_EXPIRED', message, status: 401 }),

  refreshTokenInvalid: (
    message = 'Refresh token is invalid or has been revoked.'
  ) =>
    errorResponse({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      message,
      status: 401,
    }),

  accountDisabled: (message = 'Your account has been disabled.') =>
    errorResponse({ code: 'AUTH_ACCOUNT_DISABLED', message, status: 403 }),

  forbidden: (
    message = "You don't have permission to perform this action."
  ) =>
    errorResponse({
      code: 'AUTHORIZATION_FORBIDDEN',
      message,
      status: 403,
    }),

  notFound: (resource: string | undefined = 'Resource') =>
    errorResponse({
      code: 'RESOURCE_NOT_FOUND',
      message: `${resource} not found.`,
      status: 404,
    }),

  conflict: (message: string) =>
    errorResponse({ code: 'RESOURCE_ALREADY_EXISTS', message, status: 409 }),

  fileTooLarge: (message = 'File exceeds the upload size limit.') =>
    errorResponse({ code: 'FILE_TOO_LARGE', message, status: 413 }),

  unsupportedMediaType: (message = 'Unsupported media type.') =>
    errorResponse({ code: 'UNSUPPORTED_MEDIA_TYPE', message, status: 415 }),

  /**
   * 422 Validation. `details` accepts either a flat string map
   *   { email: 'required' }
   * or the canonical array map
   *   { email: ['required', 'must be valid'] }
   * — both are normalized to `{ field: string[] }` in the response.
   */
  validation: (message: string, details?: Record<string, unknown>) =>
    errorResponse({
      code: 'VALIDATION_ERROR',
      message,
      errors: normalizeFieldErrors(details),
      status: 422,
    }),

  forceUpdate: (
    message = 'A required update is available. Please update to continue.'
  ) =>
    errorResponse({ code: 'FORCE_UPDATE_REQUIRED', message, status: 426 }),

  rateLimit: (retryAfterSeconds = 30) =>
    errorResponse({
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }),

  maintenance: (
    message = 'We are upgrading our systems. Please try again shortly.'
  ) =>
    errorResponse({ code: 'MAINTENANCE_MODE', message, status: 503 }),

  internal: (message = 'Something went wrong on our end. Please try again.') =>
    errorResponse({
      code: 'INTERNAL_SERVER_ERROR',
      message,
      status: 500,
    }),
};

// ─── Pagination ───────────────────────────────────────────────────────────

/**
 * Build pagination meta from query string + total record count.
 *
 * Defaults follow the spec: `page=1`, `limit=20`. `limit` is clamped to [1, 100].
 */
export function buildPagination(
  searchParams: URLSearchParams,
  total: number
): PaginationMeta {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get('limit') || '20', 10))
  );
  const total_pages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    total_pages,
    has_next: page < total_pages,
    has_prev: page > 1,
  };
}
