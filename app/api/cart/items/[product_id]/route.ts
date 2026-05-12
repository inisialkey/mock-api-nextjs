import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { product_id: string };
}

// PUT /api/cart/items/:product_id
//
// Body: { quantity: number }
// Sets the cart line to the exact quantity. `quantity = 0` removes the line.
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const quantity = Number(body.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      return Errors.validation('The given data was invalid.', {
        quantity: ['The quantity must be an integer >= 0.'],
      });
    }

    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?')
      .get(auth.id, params.product_id) as { id: string } | undefined;

    if (!existing) {
      return Errors.notFound('Cart item');
    }

    if (quantity === 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(existing.id);
      return new NextResponse(null, { status: 204 });
    }

    const product = db
      .prepare('SELECT stock, is_active FROM products WHERE id = ?')
      .get(params.product_id) as { stock: number; is_active: number } | undefined;

    if (!product || product.is_active !== 1) {
      return Errors.notFound('Product');
    }

    if (quantity > product.stock) {
      return Errors.validation('Not enough stock.', {
        quantity: [`Only ${product.stock} item(s) available.`],
      });
    }

    db.prepare("UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?")
      .run(quantity, existing.id);

    const line = db
      .prepare(
        `SELECT ci.id, ci.product_id, ci.quantity, ci.added_at, ci.updated_at,
                p.name as product_name, p.image as product_image,
                p.price as product_price, p.discount_price as product_discount_price
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.id = ?`
      )
      .get(existing.id) as {
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

    return successResponse({
      data: {
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
      },
      message: 'Cart item updated.',
    });
  } catch (error) {
    console.error('Cart update item error:', error);
    return Errors.internal();
  }
}

// DELETE /api/cart/items/:product_id — remove a single line
export async function DELETE(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?')
      .get(auth.id, params.product_id) as { id: string } | undefined;

    if (!existing) return Errors.notFound('Cart item');

    db.prepare('DELETE FROM cart_items WHERE id = ?').run(existing.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Cart remove item error:', error);
    return Errors.internal();
  }
}
