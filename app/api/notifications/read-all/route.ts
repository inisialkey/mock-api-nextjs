import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

// PUT /api/notifications/read-all
export async function PUT(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();

    const result = db
      .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
      .run(auth.id);

    return successResponse({
      data: { updated: result.changes },
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Read all error:', error);
    return Errors.internal();
  }
}
