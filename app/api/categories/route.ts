import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario, isEmptyScenario } from '@/lib/scenario';

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

// GET /api/categories
//
// Public. Returns active categories. Supports `?parent_id=` to scope to root
// (`parent_id=null`) or to children of a given parent.
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    if (isEmptyScenario(request)) {
      return successResponse({
        data: [],
        message: 'No categories found.',
      });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const parentParam = searchParams.get('parent_id');

    let rows: CategoryRow[];
    if (parentParam === null) {
      // No filter — return everything active
      rows = db
        .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC')
        .all() as CategoryRow[];
    } else if (parentParam === '' || parentParam === 'null' || parentParam === 'root') {
      rows = db
        .prepare('SELECT * FROM categories WHERE is_active = 1 AND parent_id IS NULL ORDER BY sort_order ASC, name ASC')
        .all() as CategoryRow[];
    } else {
      rows = db
        .prepare('SELECT * FROM categories WHERE is_active = 1 AND parent_id = ? ORDER BY sort_order ASC, name ASC')
        .all(parentParam) as CategoryRow[];
    }

    const data = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      icon: r.icon,
      image_url: r.image_url,
      parent_id: r.parent_id,
      sort_order: r.sort_order,
      is_active: r.is_active === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return successResponse({ data, message: 'Categories retrieved.' });
  } catch (error) {
    console.error('Categories list error:', error);
    return Errors.internal();
  }
}
