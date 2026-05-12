import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';
import { emitToChannel } from '@/lib/socket';

/**
 * GET /api/config/maintenance
 *
 * Check if app is in maintenance mode.
 * Public endpoint — called on app launch.
 *
 * Query params:
 *   ?app_version=1.2.0 — check if this version bypasses maintenance
 */
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const appVersion = searchParams.get('app_version');

    const row = db.prepare('SELECT * FROM maintenance WHERE id = 1').get() as {
      is_active: number;
      title: string;
      message: string;
      start_at: string | null;
      end_at: string | null;
      allowed_versions: string | null;
      updated_at: string;
    } | undefined;

    if (!row) {
      return successResponse({
        data: { is_active: false },
      });
    }

    let isActive = row.is_active === 1;

    // Check time window
    const now = new Date().toISOString();
    if (isActive && row.start_at && now < row.start_at) {
      isActive = false; // Not started yet
    }
    if (isActive && row.end_at && now > row.end_at) {
      isActive = false; // Already ended
    }

    // Check version bypass
    if (isActive && row.allowed_versions && appVersion) {
      try {
        const allowed = JSON.parse(row.allowed_versions) as string[];
        if (allowed.includes(appVersion)) {
          isActive = false;
        }
      } catch {
        // ignore
      }
    }

    return successResponse({
      data: {
        is_active: isActive,
        title: isActive ? row.title : null,
        message: isActive ? row.message : null,
        start_at: row.start_at,
        end_at: row.end_at,
      },
    });
  } catch (error) {
    console.error('Maintenance check error:', error);
    return Errors.internal();
  }
}

/**
 * PUT /api/config/maintenance
 *
 * Toggle maintenance mode (admin only)
 *
 * Body: {
 *   is_active: boolean,
 *   title?: string,
 *   message?: string,
 *   start_at?: string (ISO datetime),
 *   end_at?: string (ISO datetime),
 *   allowed_versions?: string[]
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
    const {
      is_active,
      title = 'Maintenance',
      message = 'We are currently performing maintenance. Please try again later.',
      start_at,
      end_at,
      allowed_versions = [],
    } = body;

    if (is_active === undefined) {
      return Errors.validation('is_active is required');
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO maintenance (id, is_active, title, message, start_at, end_at, allowed_versions, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        is_active = excluded.is_active,
        title = excluded.title,
        message = excluded.message,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        allowed_versions = excluded.allowed_versions,
        updated_at = datetime('now')
    `).run(
      is_active ? 1 : 0,
      title,
      message,
      start_at || null,
      end_at || null,
      allowed_versions.length > 0 ? JSON.stringify(allowed_versions) : null
    );

    // Broadcast maintenance event via WebSocket
    if (is_active) {
      emitToChannel('system', 'maintenance:started', {
        title,
        message,
        start_at,
        end_at,
      });
    } else {
      emitToChannel('system', 'maintenance:ended', {
        message: 'Maintenance is over. Welcome back!',
      });
    }

    return successResponse({
      data: { is_active, title, message, start_at, end_at },
      message: `Maintenance mode ${is_active ? 'activated' : 'deactivated'}`,
    });
  } catch (error) {
    console.error('Maintenance update error:', error);
    return Errors.internal();
  }
}
