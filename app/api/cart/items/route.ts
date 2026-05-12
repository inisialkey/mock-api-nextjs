import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

// POST /api/cart/items
//
// Body: { product_id: string, quantity?: number = 1 }
// If the item already exists in the cart, the quantity is incremented.
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const product_id: unknown = body.product_id;
    const quantityRaw: unknown = body.quantity;
    const quantity = quantityRaw === undefined ? 1 : Number(quantityRaw);

    if (!product_id || typeof product_id !== 'string') {
      return Errors.validation('The given data was invalid.', {
        product_id: ['The product_id field is required.'],
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return Errors.validation('The given data was invalid.', {
        quantity: ['The quantity must be a positive integer.'],
      });
    }

    const db = getDb();
    const product = db
      .prepare('SELECT id, stock, is_active FROM products WHERE id = ?')
      .get(product_id) as { id: string; stock: number; is_active: number } | undefined;

    if (!product || product.is_active !== 1) {
      return Errors.notFound('Product');
    }

    // Check existing line
    const existing = db
      .prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?')
      .get(auth.id, product_id) as { id: string; quantity: number } | undefined;

    const newQuantity = (existing?.quantity || 0) + quantity;

    if (newQuantity > product.stock) {
      return Errors.validation('Not enough stock.', {
        quantity: [`Only ${product.stock} item(s) available.`],
      });
    }

    if (existing) {
      db.prepare("UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?")
        .run(newQuantity, existing.id);
    } else {
      db.prepare(
        'INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)'
      ).run(uuid(), auth.id, product_id, quantity);
    }

    const line = db
      .prepare(
        `SELECT ci.id, ci.product_id, ci.quantity, ci.added_at, ci.updated_at,
                p.name as product_name, p.image as product_image,
                p.price as product_price, p.discount_price as product_discount_price
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ? AND ci.product_id = ?`
      )
      .get(auth.id, product_id) as {
        id: string;
        product_id: string;
        quantity: number;
        added_at: string;
        updated_at: string;
        product_name: string;
        product_image: string | null;
        product_price: number;
        product_discount_price: number | null;
      };

    const unitPrice = line.product_discount_price ?? line.product_price;
    const data = {
      id: line.id,
      product_id: line.product_id,
      product: {
        id: line.product_id,
        name: line.product_name,
        image: line.product_image,
        price: line.product_price,
        discount_price: line.product_discount_price,
      },
      quantity: line.quantity,
      unit_price: unitPrice,
      subtotal: Math.round(unitPrice * line.quantity),
      currency: 'IDR',
      added_at: line.added_at,
      updated_at: line.updated_at,
    };

    return successResponse({
      data,
      message: 'Item added to cart.',
      status: 201,
    });
  } catch (error) {
    console.error('Cart add item error:', error);
    return Errors.internal();
  }
}
