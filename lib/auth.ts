import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'mock-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

/**
 * Standard token type returned in auth responses.
 */
export const TOKEN_TYPE = 'Bearer' as const;

/**
 * Parse a duration string like "7d", "15m", "1h", "60s" (or a number of seconds)
 * into seconds. Returns 0 on parse failure so callers can detect bad config.
 */
function parseDurationToSeconds(input: string | number): number {
  if (typeof input === 'number') return Math.floor(input);
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(input.trim());
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default:  return value;
  }
}

/**
 * Access token lifetime in seconds (parsed from `JWT_EXPIRES_IN`).
 * Returned to clients as `expires_in` so Dio refresh interceptors can
 * proactively rotate before expiry.
 */
export const ACCESS_TOKEN_LIFETIME_SECONDS = parseDurationToSeconds(JWT_EXPIRES_IN);
export const REFRESH_TOKEN_LIFETIME_SECONDS = parseDurationToSeconds(JWT_REFRESH_EXPIRES_IN);

/**
 * Generate access token (short-lived).
 * Uses the parsed numeric lifetime so the type checker is happy with newer
 * @types/jsonwebtoken which restricts `expiresIn` to `number | StringValue`.
 */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS });
}

/**
 * Generate refresh token (long-lived).
 */
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_LIFETIME_SECONDS });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Simple password hashing for mock purposes
 * (In production, use bcrypt)
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify password
 */
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}
