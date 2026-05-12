import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

// PUT /api/addresses/:id/default — set this address as the user's default
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const existing = db
      .prepare('SELECT id, user_id FROM addresses WHERE id = ?')
      .get(params.id) as { id: string; user_id: string } | undefined;

    if (!existing) return Errors.notFound('Address');
    if (existing.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    // Atomically swap default
    const tx = db.transaction(() => {
      db.prepare("UPDATE addresses SET is_default = 0, updated_at = datetime('now') WHERE user_id = ?").run(existing.user_id);
      db.prepare("UPDATE addresses SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
    });
    tx();

    const updated = db.prepare('SELECT * FROM addresses WHERE id = ?').get(params.id);

    return successResponse({ data: updated, message: 'Default address updated.' });
  } catch (error) {
    console.error('Set default address error:', error);
    return Errors.internal();
  }
}
