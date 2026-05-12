import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

/**
 * GET /api/config/force-update?platform=android&app_version=1.0.0
 *
 * Check if current app version needs to be updated.
 * Public endpoint — no auth required.
 *
 * Response:
 * {
 *   "needs_update": true,
 *   "is_force": true,         // true = must update, false = optional
 *   "current_version": "2.1.0",
 *   "min_version": "1.5.0",
 *   "update_url": "https://play.google.com/store/...",
 *   "release_notes": "Bug fixes and new features"
 * }
 */
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const appVersion = searchParams.get('app_version');

    if (!platform || !appVersion) {
      return Errors.validation('platform and app_version query params are required');
    }

    if (!['ios', 'android'].includes(platform)) {
      return Errors.validation('platform must be "ios" or "android"');
    }

    const db = getDb();
    const row = db.prepare('SELECT * FROM force_update WHERE platform = ?').get(platform) as {
      platform: string;
      current_version: string;
      min_version: string;
      update_url: string;
      release_notes: string | null;
      is_force: number;
      updated_at: string;
    } | undefined;

    if (!row) {
      return successResponse({
        data: {
          needs_update: false,
          is_force: false,
          current_version: appVersion,
          min_version: appVersion,
          update_url: null,
          release_notes: null,
        },
      });
    }

    const needsUpdate = compareVersions(appVersion, row.min_version) < 0;
    const hasNewVersion = compareVersions(appVersion, row.current_version) < 0;

    return successResponse({
      data: {
        needs_update: needsUpdate,
        is_force: needsUpdate && row.is_force === 1,
        has_new_version: hasNewVersion,
        current_version: row.current_version,
        min_version: row.min_version,
        your_version: appVersion,
        update_url: row.update_url,
        release_notes: row.release_notes,
      },
    });
  } catch (error) {
    console.error('Force update error:', error);
    return Errors.internal();
  }
}

/**
 * PUT /api/config/force-update
 *
 * Update force update config (admin only)
 *
 * Body: {
 *   platform: 'ios' | 'android',
 *   current_version: string,
 *   min_version: string,
 *   update_url: string,
 *   release_notes?: string,
 *   is_force?: boolean
 * }
 */
export async function PUT(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (auth.role !== 'admin') {
      return Errors.forbidden('Admin access required');
    }

    const body = await request.json();
    const { platform, current_version, min_version, update_url, release_notes, is_force = false } = body;

    if (!platform || !current_version || !min_version || !update_url) {
      return Errors.validation('platform, current_version, min_version, and update_url are required');
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO force_update (platform, current_version, min_version, update_url, release_notes, is_force, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(platform) DO UPDATE SET
        current_version = excluded.current_version,
        min_version = excluded.min_version,
        update_url = excluded.update_url,
        release_notes = excluded.release_notes,
        is_force = excluded.is_force,
        updated_at = datetime('now')
    `).run(platform, current_version, min_version, update_url, release_notes || null, is_force ? 1 : 0);

    return successResponse({
      data: { platform, current_version, min_version, is_force },
      message: 'Force update config updated',
    });
  } catch (error) {
    console.error('Force update config error:', error);
    return Errors.internal();
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
