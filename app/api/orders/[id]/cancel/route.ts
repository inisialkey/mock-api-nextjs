import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
}

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

// POST /api/orders/:id/cancel
//
// Body (optional): { reason: string }
// Allowed only while order is in 'pending' or 'confirmed' status.
export async function POST(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const order = db
      .prepare('SELECT id, user_id, status, payment_status FROM orders WHERE id = ? OR reference = ?')
      .get(params.id, params.id) as OrderRow | undefined;

    if (!order) return Errors.notFound('Order');
    if (order.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return Errors.validation(
        `Order cannot be cancelled from status "${order.status}".`,
        { status: [`Only orders in ${CANCELLABLE_STATUSES.join(' or ')} can be cancelled.`] }
      );
    }

    let reason: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.reason === 'string') reason = body.reason;
    } catch {
      // No body or invalid JSON — fine
    }

    // If already paid, mark for refund. Otherwise mark as failed.
    const newPaymentStatus = order.payment_status === 'paid' ? 'refunded' : 'failed';

    db.prepare(`
      UPDATE orders
         SET status              = 'cancelled',
             payment_status      = ?,
             cancelled_at        = datetime('now'),
             cancellation_reason = ?,
             updated_at          = datetime('now')
       WHERE id = ?
    `).run(newPaymentStatus, reason, order.id);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as {
      shipping_address_snapshot: string | null;
      [key: string]: unknown;
    };

    const data = {
      ...updated,
      shipping_address: updated.shipping_address_snapshot
        ? JSON.parse(updated.shipping_address_snapshot as string)
        : null,
    };

    return successResponse({ data, message: 'Order cancelled.' });
  } catch (error) {
    console.error('Order cancel error:', error);
    return Errors.internal();
  }
}
