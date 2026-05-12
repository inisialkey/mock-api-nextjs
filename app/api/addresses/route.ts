import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';

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

// GET /api/addresses — list current user's addresses (default first)
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (isEmptyScenario(request)) {
      return successResponse({ data: [], message: 'No addresses found.' });
    }

    const db = getDb();
    const rows = db
      .prepare(
        'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC'
      )
      .all(auth.id) as AddressRow[];

    return successResponse({
      data: rows.map(rowToAddress),
      message: 'Addresses retrieved.',
    });
  } catch (error) {
    console.error('Addresses list error:', error);
    return Errors.internal();
  }
}

// POST /api/addresses — create
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const {
      label,
      recipient_name,
      phone,
      street,
      city,
      province,
      postal_code,
      country = 'ID',
      notes,
      is_default = false,
      latitude,
      longitude,
    } = body;

    // Validate required fields
    const fieldErrors: Record<string, string[] | undefined> = {
      recipient_name: !recipient_name ? ['The recipient_name field is required.'] : undefined,
      phone:          !phone          ? ['The phone field is required.']          : undefined,
      street:         !street         ? ['The street field is required.']         : undefined,
      city:           !city           ? ['The city field is required.']           : undefined,
      province:       !province       ? ['The province field is required.']       : undefined,
      postal_code:    !postal_code    ? ['The postal_code field is required.']    : undefined,
    };
    if (Object.values(fieldErrors).some((v) => v !== undefined)) {
      return Errors.validation('The given data was invalid.', fieldErrors);
    }

    const db = getDb();
    const id = uuid();
    const wantDefault = Boolean(is_default);

    // If creating as default, demote existing defaults
    if (wantDefault) {
      db.prepare("UPDATE addresses SET is_default = 0, updated_at = datetime('now') WHERE user_id = ? AND is_default = 1")
        .run(auth.id);
    }

    db.prepare(`
      INSERT INTO addresses
        (id, user_id, label, recipient_name, phone, street, city, province, postal_code, country, notes, is_default, latitude, longitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, auth.id,
      label || null,
      recipient_name, phone, street, city, province, postal_code, country,
      notes || null,
      wantDefault ? 1 : 0,
      typeof latitude  === 'number' ? latitude  : null,
      typeof longitude === 'number' ? longitude : null
    );

    const created = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id) as AddressRow;

    return successResponse({
      data: rowToAddress(created),
      message: 'Address created.',
      status: 201,
    });
  } catch (error) {
    console.error('Address create error:', error);
    return Errors.internal();
  }
}
