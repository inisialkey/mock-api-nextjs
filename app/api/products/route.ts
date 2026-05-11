import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, buildPagination, Errors } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';

interface CountRow {
  count: number;
}

// GET /api/products
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    // Products list is public (no auth required)
    if (isEmptyScenario(request)) {
      return successResponse({
        data: [],
        meta: { page: 1, limit: 10, total: 0, total_pages: 0 },
      });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);

    // Build dynamic query
    const conditions: string[] = ['is_active = 1'];
    const params: (string | number)[] = [];

    // Search
    const search = searchParams.get('search');
    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    // Filter by category
    const category = searchParams.get('category');
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    // Filter by price range
    const minPrice = searchParams.get('min_price');
    if (minPrice) {
      conditions.push('price >= ?');
      params.push(parseFloat(minPrice));
    }

    const maxPrice = searchParams.get('max_price');
    if (maxPrice) {
      conditions.push('price <= ?');
      params.push(parseFloat(maxPrice));
    }

    // Filter in stock
    const inStock = searchParams.get('in_stock');
    if (inStock === 'true') {
      conditions.push('stock > 0');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM products ${whereClause}`)
      .get(...params) as CountRow;
    const total = countRow.count;

    // Pagination
    const meta = buildPagination(searchParams, total);
    const offset = (meta.page - 1) * meta.limit;

    // Sort
    const sortField = searchParams.get('sort') || 'created_at';
    const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const allowedSorts = ['name', 'price', 'rating', 'created_at', 'stock'];
    const safeSort = allowedSorts.includes(sortField) ? sortField : 'created_at';

    // Fetch
    const products = db
      .prepare(
        `SELECT * FROM products ${whereClause}
         ORDER BY ${safeSort} ${sortOrder}
         LIMIT ? OFFSET ?`
      )
      .all(...params, meta.limit, offset)
      .map((p: any) => ({
        ...p,
        images: p.images ? JSON.parse(p.images) : [],
      }));

    return successResponse({ data: products, meta });
  } catch (error) {
    console.error('Products list error:', error);
    return Errors.internal();
  }
}

// POST /api/products
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { name, description, price, discount_price, category, image, images, stock } = body;

    // Validation
    if (!name || !category || price === undefined) {
      return Errors.validation('Missing required fields', {
        name: !name ? 'Name is required' : undefined,
        category: !category ? 'Category is required' : undefined,
        price: price === undefined ? 'Price is required' : undefined,
      });
    }

    if (price < 0) {
      return Errors.validation('Price must be positive');
    }

    const db = getDb();
    const id = uuid();

    db.prepare(`
      INSERT INTO products (id, name, description, price, discount_price, category, image, images, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      description || null,
      price,
      discount_price || null,
      category,
      image || null,
      images ? JSON.stringify(images) : null,
      stock || 0
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    product.images = product.images ? JSON.parse(product.images) : [];

    return successResponse({
      data: product,
      message: 'Product created',
      status: 201,
    });
  } catch (error) {
    console.error('Product create error:', error);
    return Errors.internal();
  }
}
