import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  TOKEN_TYPE,
  ACCESS_TOKEN_LIFETIME_SECONDS,
} from '@/lib/auth';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  is_active: number;
}

export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const body = await request.json();
    const { refresh_token } = body;

    if (!refresh_token) {
      return Errors.validation('The given data was invalid.', {
        refresh_token: ['The refresh_token field is required.'],
      });
    }

    // Verify JWT signature & expiry
    const decoded = verifyToken(refresh_token);
    if (!decoded) {
      return Errors.refreshTokenInvalid();
    }

    const db = getDb();

    // Check token is still in DB (not rotated/revoked)
    const storedToken = db
      .prepare('SELECT * FROM refresh_tokens WHERE token = ?')
      .get(refresh_token) as RefreshTokenRow | undefined;

    if (!storedToken) {
      return Errors.refreshTokenInvalid();
    }

    // Check user still active
    const user = db
      .prepare('SELECT id, email, role, is_active FROM users WHERE id = ?')
      .get(decoded.id) as UserRow | undefined;

    if (!user) {
      return Errors.refreshTokenInvalid();
    }
    if (!user.is_active) {
      return Errors.accountDisabled();
    }

    // Rotate: invalidate old, issue new pair
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refresh_token);

    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const new_access_token = generateAccessToken(tokenPayload);
    const new_refresh_token = generateRefreshToken(tokenPayload);

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, datetime('now', '+30 days'))
    `).run(uuid(), user.id, new_refresh_token);

    return successResponse({
      data: {
        access_token: new_access_token,
        refresh_token: new_refresh_token,
        token_type: TOKEN_TYPE,
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      },
      message: 'Token refreshed.',
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return Errors.internal();
  }
}
