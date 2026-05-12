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
  reference: string;
  user_id: string;
  status: string;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  shipping_address_id: string | null;
  shipping_address_snapshot: string | null;
  tracking_number: string | null;
  notes: string | null;
  placed_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// GET /api/orders/:id — detail by order id OR public reference
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    // Accept either UUID or "ORD-…" reference for convenience
    const order = db
      .prepare('SELECT * FROM orders WHERE id = ? OR reference = ?')
      .get(params.id, params.id) as OrderRow | undefined;

    if (!order) return Errors.notFound('Order');
    if (order.user_id !== auth.id && auth.role !== 'admin') return Errors.forbidden();

    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(order.id) as OrderItemRow[];

    const data = {
      id: order.id,
      reference: order.reference,
      user_id: order.user_id,
      status: order.status,
      subtotal: order.subtotal,
      shipping_fee: order.shipping_fee,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      currency: order.currency,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      shipping_address_id: order.shipping_address_id,
      shipping_address: order.shipping_address_snapshot
        ? JSON.parse(order.shipping_address_snapshot)
        : null,
      tracking_number: order.tracking_number,
      notes: order.notes,
      placed_at: order.placed_at,
      confirmed_at: order.confirmed_at,
      shipped_at: order.shipped_at,
      delivered_at: order.delivered_at,
      cancelled_at: order.cancelled_at,
      cancellation_reason: order.cancellation_reason,
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        product_image: it.product_image,
        quantity: it.quantity,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
      })),
      item_count: items.reduce((a, x) => a + x.quantity, 0),
      created_at: order.created_at,
      updated_at: order.updated_at,
    };

    return successResponse({ data, message: 'Order retrieved.' });
  } catch (error) {
    console.error('Order detail error:', error);
    return Errors.internal();
  }
}
