import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, buildPagination, Errors } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';

interface CountRow { count: number }
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

interface CartLine {
  cart_id: string;
  product_id: string;
  quantity: number;
  product_name: string;
  product_image: string | null;
  product_price: number;
  product_discount_price: number | null;
  product_stock: number;
  product_is_active: number;
}

const VALID_PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'e_wallet', 'cod'];

function rowToOrder(r: OrderRow, items?: OrderItemRow[]) {
  return {
    id: r.id,
    reference: r.reference,
    user_id: r.user_id,
    status: r.status,
    subtotal: r.subtotal,
    shipping_fee: r.shipping_fee,
    discount: r.discount,
    tax: r.tax,
    total: r.total,
    currency: r.currency,
    payment_method: r.payment_method,
    payment_status: r.payment_status,
    shipping_address_id: r.shipping_address_id,
    shipping_address: r.shipping_address_snapshot ? JSON.parse(r.shipping_address_snapshot) : null,
    tracking_number: r.tracking_number,
    notes: r.notes,
    placed_at: r.placed_at,
    confirmed_at: r.confirmed_at,
    shipped_at: r.shipped_at,
    delivered_at: r.delivered_at,
    cancelled_at: r.cancelled_at,
    cancellation_reason: r.cancellation_reason,
    items: items?.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      product_image: it.product_image,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    })),
    item_count: items?.reduce((a, x) => a + x.quantity, 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// GET /api/orders — list current user's orders
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);

    if (isEmptyScenario(request)) {
      return successResponse({
        data: [],
        meta: { page: 1, limit: 20, total: 0, total_pages: 0, has_next: false, has_prev: false },
        message: 'No orders found.',
      });
    }

    const db = getDb();
    const conditions: string[] = ['user_id = ?'];
    const params: (string | number)[] = [auth.id];

    const status = searchParams.get('status');
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM orders ${whereClause}`)
      .get(...params) as CountRow;

    const meta = buildPagination(searchParams, countRow.count);
    const offset = (meta.page - 1) * meta.limit;

    const orders = db
      .prepare(`SELECT * FROM orders ${whereClause} ORDER BY placed_at DESC LIMIT ? OFFSET ?`)
      .all(...params, meta.limit, offset) as OrderRow[];

    // Fetch items for the orders we returned
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    if (orders.length > 0) {
      const placeholders = orders.map(() => '?').join(',');
      const items = db
        .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`)
        .all(...orders.map((o) => o.id)) as OrderItemRow[];
      for (const it of items) {
        const arr = itemsByOrder.get(it.order_id) || [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }
    }

    const data = orders.map((o) => rowToOrder(o, itemsByOrder.get(o.id) || []));

    return successResponse({ data, meta, message: 'Orders retrieved.' });
  } catch (error) {
    console.error('Orders list error:', error);
    return Errors.internal();
  }
}

// POST /api/orders — create from current cart
//
// Body:
//   {
//     "shipping_address_id": "uuid",
//     "payment_method": "bank_transfer" | "credit_card" | "e_wallet" | "cod",
//     "notes": "string (optional)"
//   }
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const shipping_address_id: unknown = body.shipping_address_id;
    const payment_method: unknown    = body.payment_method;
    const notes: unknown             = body.notes;

    const fieldErrors: Record<string, string[] | undefined> = {
      shipping_address_id: !shipping_address_id || typeof shipping_address_id !== 'string'
        ? ['The shipping_address_id field is required.']
        : undefined,
      payment_method: !payment_method || typeof payment_method !== 'string'
        ? ['The payment_method field is required.']
        : !VALID_PAYMENT_METHODS.includes(payment_method as string)
          ? [`The payment_method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}.`]
          : undefined,
    };
    if (Object.values(fieldErrors).some((v) => v !== undefined)) {
      return Errors.validation('The given data was invalid.', fieldErrors);
    }

    const db = getDb();

    // Validate shipping address belongs to this user
    const address = db
      .prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?')
      .get(shipping_address_id, auth.id) as Record<string, unknown> | undefined;

    if (!address) return Errors.notFound('Shipping address');

    // Read cart
    const cartLines = db
      .prepare(
        `SELECT ci.id as cart_id, ci.product_id, ci.quantity,
                p.name as product_name, p.image as product_image,
                p.price as product_price, p.discount_price as product_discount_price,
                p.stock as product_stock, p.is_active as product_is_active
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?`
      )
      .all(auth.id) as CartLine[];

    if (cartLines.length === 0) {
      return Errors.validation('Your cart is empty.', {
        cart: ['Add at least one item before placing an order.'],
      });
    }

    // Validate stock for each line
    for (const line of cartLines) {
      if (line.product_is_active !== 1) {
        return Errors.validation('A product in your cart is no longer available.', {
          [`product:${line.product_id}`]: [`"${line.product_name}" is unavailable.`],
        });
      }
      if (line.quantity > line.product_stock) {
        return Errors.validation('Not enough stock.', {
          [`product:${line.product_id}`]: [`"${line.product_name}" has only ${line.product_stock} item(s) in stock.`],
        });
      }
    }

    // Compute totals
    const items = cartLines.map((l) => {
      const unitPrice = l.product_discount_price ?? l.product_price;
      return {
        product_id: l.product_id,
        product_name: l.product_name,
        product_image: l.product_image,
        quantity: l.quantity,
        unit_price: unitPrice,
        subtotal: Math.round(unitPrice * l.quantity),
      };
    });
    const subtotal = items.reduce((a, x) => a + x.subtotal, 0);
    const shipping_fee = 20000; // flat for the mock
    const discount = 0;
    const tax = 0;
    const total = subtotal + shipping_fee + tax - discount;
    const currency = 'IDR';

    // Snapshot the shipping address
    const addressSnapshot = JSON.stringify({
      label: address.label,
      recipient_name: address.recipient_name,
      phone: address.phone,
      street: address.street,
      city: address.city,
      province: address.province,
      postal_code: address.postal_code,
      country: address.country,
      notes: address.notes,
    });

    // Reference: ORD-<year>-<sequential 5-digit>
    const year = new Date().getFullYear();
    const yearCount = db
      .prepare('SELECT COUNT(*) as count FROM orders WHERE reference LIKE ?')
      .get(`ORD-${year}-%`) as CountRow;
    const reference = `ORD-${year}-${String(yearCount.count + 1).padStart(5, '0')}`;

    const orderId = uuid();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO orders
           (id, reference, user_id, status,
            subtotal, shipping_fee, discount, tax, total, currency,
            payment_method, payment_status,
            shipping_address_id, shipping_address_snapshot,
            notes)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      ).run(
        orderId, reference, auth.id,
        subtotal, shipping_fee, discount, tax, total, currency,
        payment_method as string,
        shipping_address_id as string,
        addressSnapshot,
        typeof notes === 'string' ? notes : null
      );

      const insertItem = db.prepare(
        `INSERT INTO order_items
           (id, order_id, product_id, product_name, product_image, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const it of items) {
        insertItem.run(
          uuid(), orderId,
          it.product_id, it.product_name, it.product_image,
          it.quantity, it.unit_price, it.subtotal
        );
      }

      // Clear cart
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(auth.id);
    });
    tx();

    const orderRow  = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
    const itemRows  = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as OrderItemRow[];

    return successResponse({
      data: rowToOrder(orderRow, itemRows),
      message: 'Order placed.',
      status: 201,
    });
  } catch (error) {
    console.error('Order create error:', error);
    return Errors.internal();
  }
}
