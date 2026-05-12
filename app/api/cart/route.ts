import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface CartJoinRow {
  id: string;
  product_id: string;
  quantity: number;
  added_at: string;
  updated_at: string;
  product_name: string;
  product_image: string | null;
  product_price: number;
  product_discount_price: number | null;
  product_stock: number;
  product_is_active: number;
}

const CURRENCY = 'IDR';

// GET /api/cart — current user's cart with computed totals
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT ci.id, ci.product_id, ci.quantity, ci.added_at, ci.updated_at,
                p.name  as product_name, p.image as product_image,
                p.price as product_price, p.discount_price as product_discount_price,
                p.stock as product_stock, p.is_active as product_is_active
           FROM cart_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.user_id = ?
          ORDER BY ci.added_at DESC`
      )
      .all(auth.id) as CartJoinRow[];

    let subtotal = 0;
    let itemCount = 0;
    const items = rows.map((r) => {
      const unitPrice = r.product_discount_price ?? r.product_price;
      const lineSubtotal = Math.round(unitPrice * r.quantity);
      subtotal += lineSubtotal;
      itemCount += r.quantity;
      return {
        id: r.id,
        product_id: r.product_id,
        product: {
          id: r.product_id,
          name: r.product_name,
          image: r.product_image,
          price: r.product_price,
          discount_price: r.product_discount_price,
          stock: r.product_stock,
          is_active: r.product_is_active === 1,
        },
        quantity: r.quantity,
        unit_price: unitPrice,
        subtotal: lineSubtotal,
        currency: CURRENCY,
        added_at: r.added_at,
        updated_at: r.updated_at,
      };
    });

    return successResponse({
      data: {
        items,
        summary: {
          item_count: itemCount,
          unique_items: items.length,
          subtotal,
          currency: CURRENCY,
        },
      },
      message: 'Cart retrieved.',
    });
  } catch (error) {
    console.error('Cart get error:', error);
    return Errors.internal();
  }
}

// DELETE /api/cart — clear the user's cart
export async function DELETE(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(auth.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Cart clear error:', error);
    return Errors.internal();
  }
}
