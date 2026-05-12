import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface ConfigRow {
  key: string;
  value: string;
  type: string;
  description: string | null;
  platform: string;
  updated_at: string;
}

/**
 * Parse config value based on its type
 */
function parseConfigValue(row: ConfigRow): unknown {
  switch (row.type) {
    case 'number':
      return parseFloat(row.value);
    case 'boolean':
      return row.value === 'true' || row.value === '1';
    case 'json':
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    default:
      return row.value;
  }
}

/**
 * GET /api/config
 *
 * Returns all app configuration as key-value pairs.
 * Supports filtering by platform via ?platform=ios|android
 *
 * Response format:
 * {
 *   "success": true,
 *   "data": {
 *     "configs": { "app_name": "MockApp", "max_upload_size": 10485760, ... },
 *     "feature_flags": { "dark_mode": true, "new_checkout": false, ... },
 *     "force_update": { "current_version": "2.1.0", ... },
 *     "maintenance": { "is_active": false, ... }
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'all';
    const appVersion = searchParams.get('app_version');

    // ─── App Configs ───
    const configRows = db
      .prepare("SELECT * FROM app_config WHERE platform IN ('all', ?)")
      .all(platform) as ConfigRow[];

    const configs: Record<string, unknown> = {};
    for (const row of configRows) {
      configs[row.key] = parseConfigValue(row);
    }

    // ─── Feature Flags ───
    // Optionally pass user_id via auth token to check whitelist
    let userId: string | null = null;
    try {
      const auth = authenticate(request);
      if (!isAuthError(auth)) {
        userId = auth.id;
      }
    } catch {
      // No auth is fine for config endpoint
    }

    const flagRows = db
      .prepare("SELECT * FROM feature_flags WHERE platform IN ('all', ?)")
      .all(platform) as Array<{
      key: string;
      enabled: number;
      description: string | null;
      platform: string;
      min_version: string | null;
      max_version: string | null;
      user_percentage: number;
      whitelist_user_ids: string | null;
      updated_at: string;
    }>;

    const featureFlags: Record<string, boolean> = {};
    const featureFlagsDetail: Record<string, unknown> = {};

    for (const flag of flagRows) {
      let isEnabled = flag.enabled === 1;

      // Check version constraint
      if (isEnabled && appVersion && flag.min_version) {
        isEnabled = compareVersions(appVersion, flag.min_version) >= 0;
      }
      if (isEnabled && appVersion && flag.max_version) {
        isEnabled = compareVersions(appVersion, flag.max_version) <= 0;
      }

      // Check user percentage (deterministic based on userId)
      if (isEnabled && flag.user_percentage < 100 && userId) {
        const hash = simpleHash(userId + flag.key);
        isEnabled = (hash % 100) < flag.user_percentage;
      }

      // Check whitelist
      if (!isEnabled && flag.whitelist_user_ids && userId) {
        try {
          const whitelist = JSON.parse(flag.whitelist_user_ids) as string[];
          if (whitelist.includes(userId)) {
            isEnabled = true;
          }
        } catch {
          // ignore
        }
      }

      featureFlags[flag.key] = isEnabled;
      featureFlagsDetail[flag.key] = {
        enabled: isEnabled,
        description: flag.description,
        min_version: flag.min_version,
        max_version: flag.max_version,
      };
    }

    // ─── Force Update ───
    const forceUpdate = db
      .prepare("SELECT * FROM force_update WHERE platform = ?")
      .get(platform === 'all' ? 'android' : platform) as {
      platform: string;
      current_version: string;
      min_version: string;
      update_url: string;
      release_notes: string | null;
      is_force: number;
    } | undefined;

    let updateInfo: Record<string, unknown> | null = null;
    if (forceUpdate) {
      const needsUpdate = appVersion
        ? compareVersions(appVersion, forceUpdate.min_version) < 0
        : false;

      updateInfo = {
        current_version: forceUpdate.current_version,
        min_version: forceUpdate.min_version,
        update_url: forceUpdate.update_url,
        release_notes: forceUpdate.release_notes,
        is_force: forceUpdate.is_force === 1,
        needs_update: needsUpdate,
      };
    }

    // ─── Maintenance ───
    const maintenanceRow = db.prepare('SELECT * FROM maintenance WHERE id = 1').get() as {
      is_active: number;
      title: string;
      message: string;
      start_at: string | null;
      end_at: string | null;
      allowed_versions: string | null;
    } | undefined;

    let maintenance: Record<string, unknown> = {
      is_active: false,
      title: null,
      message: null,
    };

    if (maintenanceRow) {
      let bypassMaintenance = false;

      // Check if current version is allowed to bypass
      if (maintenanceRow.allowed_versions && appVersion) {
        try {
          const allowed = JSON.parse(maintenanceRow.allowed_versions) as string[];
          bypassMaintenance = allowed.includes(appVersion);
        } catch {
          // ignore
        }
      }

      maintenance = {
        is_active: maintenanceRow.is_active === 1 && !bypassMaintenance,
        title: maintenanceRow.title,
        message: maintenanceRow.message,
        start_at: maintenanceRow.start_at,
        end_at: maintenanceRow.end_at,
      };
    }

    return successResponse({
      data: {
        configs,
        feature_flags: featureFlags,
        feature_flags_detail: featureFlagsDetail,
        force_update: updateInfo,
        maintenance,
      },
    });
  } catch (error) {
    console.error('Config error:', error);
    return Errors.internal();
  }
}

/**
 * PUT /api/config
 *
 * Update app config (admin only)
 * Body: { key: string, value: any, type?: string, description?: string, platform?: string }
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
    const { key, value, type = 'string', description, platform = 'all' } = body;

    if (!key || value === undefined) {
      return Errors.validation('key and value are required');
    }

    const db = getDb();
    const stringValue = type === 'json' ? JSON.stringify(value) : String(value);

    db.prepare(`
      INSERT INTO app_config (key, value, type, description, platform, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        description = COALESCE(excluded.description, description),
        platform = excluded.platform,
        updated_at = datetime('now')
    `).run(key, stringValue, type, description || null, platform);

    return successResponse({
      data: { key, value, type, platform },
      message: 'Config updated',
    });
  } catch (error) {
    console.error('Config update error:', error);
    return Errors.internal();
  }
}

// ─── Utility ──────────────────────────────────────────

/**
 * Compare semantic versions: returns -1, 0, 1
 */
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

/**
 * Simple deterministic hash for percentage rollout
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
