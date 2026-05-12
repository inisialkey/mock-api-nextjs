import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

/**
 * POST /api/auth/logout
 *
 * Revoke refresh token(s) for the authenticated user. The access token expires
 * naturally — mobile clients should clear both tokens from secure storage.
 *
 * Body (optional):
 *   { "refresh_token": "..." }  — revokes only that token (this device)
 *   no body                     — revokes ALL refresh tokens for this user (every device)
 *
 * Always returns 204 No Content on success.
 */
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    let refreshToken: string | undefined;
    try {
      // Body is optional. Failing to parse JSON is not an error here.
      const body = await request.json();
      if (body && typeof body.refresh_token === 'string') {
        refreshToken = body.refresh_token;
      }
    } catch {
      // No body or non-JSON body — fall through to revoke-all
    }

    const db = getDb();
    if (refreshToken) {
      db.prepare(
        'DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?'
      ).run(refreshToken, auth.id);
    } else {
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(auth.id);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Logout error:', error);
    return Errors.internal();
  }
}
