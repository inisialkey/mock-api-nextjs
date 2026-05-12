import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface Params {
  params: { slug: string };
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// GET /api/categories/:slug — public detail by slug
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1')
      .get(params.slug) as CategoryRow | undefined;

    if (!row) {
      return Errors.notFound('Category');
    }

    // Live product count for this category (products.category stores the slug)
    const countRow = db
      .prepare('SELECT COUNT(*) as count FROM products WHERE category = ? AND is_active = 1')
      .get(row.slug) as { count: number };

    const data = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: row.icon,
      image_url: row.image_url,
      parent_id: row.parent_id,
      sort_order: row.sort_order,
      is_active: row.is_active === 1,
      products_count: countRow.count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    return successResponse({ data, message: 'Category retrieved.' });
  } catch (error) {
    console.error('Category detail error:', error);
    return Errors.internal();
  }
}
