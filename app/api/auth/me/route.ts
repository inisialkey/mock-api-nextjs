import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const user = db
      .prepare(
        'SELECT id, name, email, phone, avatar_url, role, is_active, created_at, updated_at FROM users WHERE id = ?'
      )
      .get(auth.id);

    if (!user) {
      return Errors.notFound('User');
    }

    return successResponse({ data: user, message: 'Profile retrieved.' });
  } catch (error) {
    console.error('Me error:', error);
    return Errors.internal();
  }
}
