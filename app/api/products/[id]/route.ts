import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { id: string };
}

// GET /api/products/:id
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(
      params.id
    ) as any;

    if (!product) {
      return Errors.notFound('Product');
    }

    product.images = product.images ? JSON.parse(product.images) : [];

    return successResponse({ data: product });
  } catch (error) {
    console.error('Product detail error:', error);
    return Errors.internal();
  }
}

// PUT /api/products/:id
export async function PUT(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(params.id);
    if (!existing) {
      return Errors.notFound('Product');
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const allowedFields = [
      'name',
      'description',
      'price',
      'discount_price',
      'category',
      'image',
      'stock',
      'rating',
      'rating_count',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    // Handle images array separately
    if (body.images !== undefined) {
      updates.push('images = ?');
      values.push(JSON.stringify(body.images));
    }

    if (updates.length === 0) {
      return Errors.validation('No fields to update');
    }

    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(params.id) as any;
    product.images = product.images ? JSON.parse(product.images) : [];

    return successResponse({ data: product, message: 'Product updated' });
  } catch (error) {
    console.error('Product update error:', error);
    return Errors.internal();
  }
}

// DELETE /api/products/:id
export async function DELETE(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();

    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(params.id);
    if (!existing) {
      return Errors.notFound('Product');
    }

    // Soft delete
    db.prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(
      params.id
    );

    return successResponse({ data: null, message: 'Product deleted' });
  } catch (error) {
    console.error('Product delete error:', error);
    return Errors.internal();
  }
}
