import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/health
export async function GET() {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as {
      count: number;
    };

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      data: {
        users: userCount.count,
        products: productCount.count,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      },
      { status: 500 }
    );
  }
}
