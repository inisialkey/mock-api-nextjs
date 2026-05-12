import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

interface AddressRow {
  id: string;
  user_id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  notes: string | null;
  is_default: number;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

function rowToAddress(r: AddressRow) {
  return {
    id: r.id,
    user_id: r.user_id,
    label: r.label,
    recipient_name: r.recipient_name,
    phone: r.phone,
    street: r.street,
    city: r.city,
    province: r.province,
    postal_code: r.postal_code,
    country: r.country,
    notes: r.notes,
    is_default: r.is_default === 1,
    latitude: r.latitude,
    longitude: r.longitude,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// GET /api/addresses/:id
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id) as
      | AddressRow
      | undefined;

    if (!row) return Errors.notFound('Address');
    if (row.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    return successResponse({ data: rowToAddress(row), message: 'Address retrieved.' });
  } catch (error) {
    console.error('Address detail error:', error);
    return Errors.internal();
  }
}

// PUT /api/addresses/:id
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const existing = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id) as
      | AddressRow
      | undefined;

    if (!existing) return Errors.notFound('Address');
    if (existing.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    const body = await request.json();
    const allowed = [
      'label', 'recipient_name', 'phone', 'street', 'city',
      'province', 'postal_code', 'country', 'notes',
      'latitude', 'longitude',
    ] as const;

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const field of allowed) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    // Special handling for is_default — must demote others when setting true
    if (body.is_default === true) {
      db.prepare("UPDATE addresses SET is_default = 0, updated_at = datetime('now') WHERE user_id = ? AND is_default = 1 AND id != ?")
        .run(existing.user_id, params.id);
      updates.push('is_default = ?');
      values.push(1);
    } else if (body.is_default === false) {
      updates.push('is_default = ?');
      values.push(0);
    }

    if (updates.length === 0) {
      return Errors.validation('No fields to update.');
    }

    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    db.prepare(`UPDATE addresses SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id) as AddressRow;

    return successResponse({ data: rowToAddress(updated), message: 'Address updated.' });
  } catch (error) {
    console.error('Address update error:', error);
    return Errors.internal();
  }
}

// DELETE /api/addresses/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const existing = db.prepare('SELECT user_id, is_default FROM addresses WHERE id = ?').get(params.id) as
      | { user_id: string; is_default: number }
      | undefined;

    if (!existing) return Errors.notFound('Address');
    if (existing.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    db.prepare('DELETE FROM addresses WHERE id = ?').run(params.id);

    // If we deleted the default, promote the most recent remaining address (if any)
    if (existing.is_default === 1) {
      db.prepare(`
        UPDATE addresses SET is_default = 1, updated_at = datetime('now')
         WHERE id = (
           SELECT id FROM addresses
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
         )
      `).run(existing.user_id);
    }

    return successResponse({ data: null, message: 'Address deleted.' });
  } catch (error) {
    console.error('Address delete error:', error);
    return Errors.internal();
  }
}
