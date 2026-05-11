import { NextResponse } from 'next/server';

/**
 * Standard API response types
 */
interface SuccessResponseParams<T> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
  status?: number;
}

interface ErrorResponseParams {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/**
 * Return success response with standard format
 */
export function successResponse<T>({
  data,
  message,
  meta,
  status = 200,
}: SuccessResponseParams<T>) {
  const body: Record<string, unknown> = {
    success: true,
    data,
  };

  if (message) body.message = message;
  if (meta) body.meta = meta;

  return NextResponse.json(body, { status });
}

/**
 * Return error response with standard format
 */
export function errorResponse({
  code,
  message,
  details,
  status = 400,
}: ErrorResponseParams) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status }
  );
}

/**
 * Common error shortcuts
 */
export const Errors = {
  unauthorized: (message = 'Unauthorized') =>
    errorResponse({ code: 'UNAUTHORIZED', message, status: 401 }),

  forbidden: (message = 'Forbidden') =>
    errorResponse({ code: 'FORBIDDEN', message, status: 403 }),

  notFound: (resource = 'Resource') =>
    errorResponse({ code: 'NOT_FOUND', message: `${resource} not found`, status: 404 }),

  validation: (message: string, details?: Record<string, unknown>) =>
    errorResponse({ code: 'VALIDATION_ERROR', message, details, status: 422 }),

  conflict: (message: string) =>
    errorResponse({ code: 'CONFLICT', message, status: 409 }),

  internal: (message = 'Internal server error') =>
    errorResponse({ code: 'INTERNAL_ERROR', message, status: 500 }),
};

/**
 * Build pagination meta from query params
 */
export function buildPagination(
  searchParams: URLSearchParams,
  total: number
): PaginationMeta {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));
  const total_pages = Math.ceil(total / limit);

  return { page, limit, total, total_pages };
}
