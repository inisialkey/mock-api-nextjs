import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, buildPagination } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';
import { Errors } from '@/lib/response';

interface CountRow {
  count: number;
}

export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    // Handle empty scenario
    if (isEmptyScenario(request)) {
      return successResponse({
        data: [],
        meta: { page: 1, limit: 10, total: 0, total_pages: 0 },
      });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);

    // Build query
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    const search = searchParams.get('search');
    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const role = searchParams.get('role');
    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`)
      .get(...params) as CountRow;
    const total = countRow.count;

    // Pagination
    const meta = buildPagination(searchParams, total);
    const offset = (meta.page - 1) * meta.limit;

    // Sort
    const sortField = searchParams.get('sort') || 'created_at';
    const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const allowedSorts = ['name', 'email', 'created_at', 'role'];
    const safeSort = allowedSorts.includes(sortField) ? sortField : 'created_at';

    // Fetch
    const users = db
      .prepare(
        `SELECT id, name, email, phone, avatar, role, is_active, created_at
         FROM users ${whereClause}
         ORDER BY ${safeSort} ${sortOrder}
         LIMIT ? OFFSET ?`
      )
      .all(...params, meta.limit, offset);

    return successResponse({ data: users, meta });
  } catch (error) {
    console.error('Users list error:', error);
    return Errors.internal();
  }
}
