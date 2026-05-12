import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

/**
 * GET /api/config/feature-flags
 *
 * List all feature flags with full detail (admin)
 */
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (auth.role !== 'admin') {
      return Errors.forbidden('Admin access required');
    }

    const db = getDb();
    const flags = db.prepare('SELECT * FROM feature_flags ORDER BY key ASC').all().map((f: any) => ({
      ...f,
      enabled: f.enabled === 1,
      whitelist_user_ids: f.whitelist_user_ids ? JSON.parse(f.whitelist_user_ids) : [],
    }));

    return successResponse({ data: flags });
  } catch (error) {
    console.error('Feature flags error:', error);
    return Errors.internal();
  }
}

/**
 * POST /api/config/feature-flags
 *
 * Create or update a feature flag (admin only)
 *
 * Body: {
 *   key: string,
 *   enabled: boolean,
 *   description?: string,
 *   platform?: 'all' | 'ios' | 'android',
 *   min_version?: string,
 *   max_version?: string,
 *   user_percentage?: number (0-100),
 *   whitelist_user_ids?: string[]
 * }
 */
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (auth.role !== 'admin') {
      return Errors.forbidden('Admin access required');
    }

    const body = await request.json();
    const {
      key,
      enabled = false,
      description,
      platform = 'all',
      min_version,
      max_version,
      user_percentage = 100,
      whitelist_user_ids = [],
    } = body;

    if (!key) {
      return Errors.validation('key is required');
    }

    if (user_percentage < 0 || user_percentage > 100) {
      return Errors.validation('user_percentage must be between 0 and 100');
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO feature_flags (key, enabled, description, platform, min_version, max_version, user_percentage, whitelist_user_ids, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        enabled = excluded.enabled,
        description = COALESCE(excluded.description, description),
        platform = excluded.platform,
        min_version = excluded.min_version,
        max_version = excluded.max_version,
        user_percentage = excluded.user_percentage,
        whitelist_user_ids = excluded.whitelist_user_ids,
        updated_at = datetime('now')
    `).run(
      key,
      enabled ? 1 : 0,
      description || null,
      platform,
      min_version || null,
      max_version || null,
      user_percentage,
      whitelist_user_ids.length > 0 ? JSON.stringify(whitelist_user_ids) : null
    );

    return successResponse({
      data: { key, enabled, platform, min_version, max_version, user_percentage },
      message: `Feature flag "${key}" ${enabled ? 'enabled' : 'disabled'}`,
      status: 201,
    });
  } catch (error) {
    console.error('Feature flag create error:', error);
    return Errors.internal();
  }
}

/**
 * DELETE /api/config/feature-flags
 *
 * Delete a feature flag (admin only)
 * Body: { key: string }
 */
export async function DELETE(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (auth.role !== 'admin') {
      return Errors.forbidden('Admin access required');
    }

    const body = await request.json();
    const { key } = body;

    if (!key) {
      return Errors.validation('key is required');
    }

    const db = getDb();
    const result = db.prepare('DELETE FROM feature_flags WHERE key = ?').run(key);

    if (result.changes === 0) {
      return Errors.notFound('Feature flag');
    }

    return successResponse({
      data: null,
      message: `Feature flag "${key}" deleted`,
    });
  } catch (error) {
    console.error('Feature flag delete error:', error);
    return Errors.internal();
  }
}
