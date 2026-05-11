import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

// PUT /api/notifications/:id/read
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();

    const notification = db
      .prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
      .get(params.id, auth.id);

    if (!notification) {
      return Errors.notFound('Notification');
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(params.id);

    return successResponse({ data: null, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Notification read error:', error);
    return Errors.internal();
  }
}
