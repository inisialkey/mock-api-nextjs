import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

// GET /api/users/:id
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const user = db
      .prepare(
        'SELECT id, name, email, phone, avatar_url, role, is_active, created_at, updated_at FROM users WHERE id = ?'
      )
      .get(params.id);

    if (!user) {
      return Errors.notFound('User');
    }

    return successResponse({ data: user });
  } catch (error) {
    console.error('User detail error:', error);
    return Errors.internal();
  }
}

// PUT /api/users/:id
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    // Only self or admin can update
    if (auth.id !== params.id && auth.role !== 'admin') {
      return Errors.forbidden('You can only update your own profile');
    }

    const db = getDb();
    const body = await request.json();
    const { name, phone, avatar_url } = body;

    // Check user exists
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(params.id);
    if (!existing) {
      return Errors.notFound('User');
    }

    // Build update
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return Errors.validation('No fields to update');
    }

    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Return updated user
    const user = db
      .prepare(
        'SELECT id, name, email, phone, avatar_url, role, is_active, created_at, updated_at FROM users WHERE id = ?'
      )
      .get(params.id);

    return successResponse({ data: user, message: 'User updated' });
  } catch (error) {
    console.error('User update error:', error);
    return Errors.internal();
  }
}

// DELETE /api/users/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    if (auth.role !== 'admin') {
      return Errors.forbidden('Admin access required');
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(params.id);
    if (!existing) {
      return Errors.notFound('User');
    }

    // Soft delete
    db.prepare("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(
      params.id
    );

    return successResponse({ data: null, message: 'User deleted' });
  } catch (error) {
    console.error('User delete error:', error);
    return Errors.internal();
  }
}
