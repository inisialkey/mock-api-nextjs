import { NextRequest } from 'next/server';
import { extractToken, verifyToken, JwtPayload } from './auth';
import { Errors } from './response';
import { getDb } from './db';

/**
 * Authenticate request and return user payload
 * Returns JwtPayload if authenticated, NextResponse error otherwise
 */
export function authenticate(request: NextRequest): JwtPayload | ReturnType<typeof Errors.unauthorized> {
  const token = extractToken(request.headers.get('Authorization'));

  if (!token) {
    return Errors.unauthorized('Missing or invalid Authorization header');
  }

  const payload = verifyToken(token);
  if (!payload) {
    return Errors.unauthorized('Invalid or expired token');
  }

  // Verify user still exists and is active
  const db = getDb();
  const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(payload.id) as
    | { id: string; is_active: number }
    | undefined;

  if (!user || !user.is_active) {
    return Errors.unauthorized('User not found or inactive');
  }

  return payload;
}

/**
 * Check if authentication result is an error response
 */
export function isAuthError(
  result: JwtPayload | ReturnType<typeof Errors.unauthorized>
): result is ReturnType<typeof Errors.unauthorized> {
  return result instanceof Response;
}

/**
 * Require admin role
 */
export function requireAdmin(payload: JwtPayload) {
  if (payload.role !== 'admin') {
    return Errors.forbidden('Admin access required');
  }
  return null;
}
