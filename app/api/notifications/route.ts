import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, buildPagination, Errors } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';

interface CountRow {
  count: number;
}

// GET /api/notifications
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (isEmptyScenario(request)) {
      return successResponse({
        data: [],
        meta: { page: 1, limit: 20, total: 0, total_pages: 0, has_next: false, has_prev: false },
        message: 'No notifications found.',
      });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);

    // Build query
    const conditions: string[] = ['user_id = ?'];
    const params: (string | number)[] = [auth.id];

    const type = searchParams.get('type');
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    const isRead = searchParams.get('is_read');
    if (isRead !== null) {
      conditions.push('is_read = ?');
      params.push(isRead === 'true' ? 1 : 0);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM notifications ${whereClause}`)
      .get(...params) as CountRow;
    const total = countRow.count;

    // Unread count
    const unreadRow = db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(auth.id) as CountRow;

    // Pagination
    const meta = buildPagination(searchParams, total);
    const offset = (meta.page - 1) * meta.limit;

    // Fetch
    const notifications = db
      .prepare(
        `SELECT * FROM notifications ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, meta.limit, offset)
      .map((n: any) => ({
        ...n,
        data: n.data ? JSON.parse(n.data) : null,
      }));

    return successResponse({
      data: {
        notifications,
        unread_count: unreadRow.count,
      },
      meta,
    });
  } catch (error) {
    console.error('Notifications list error:', error);
    return Errors.internal();
  }
}
