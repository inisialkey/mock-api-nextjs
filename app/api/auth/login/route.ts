import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
} from '@/lib/auth';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  is_active: number;
  created_at: string;
}

export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return Errors.validation('Email and password are required');
    }

    const db = getDb();

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined;

    if (!user || !verifyPassword(password, user.password)) {
      return Errors.unauthorized('Invalid email or password');
    }

    if (!user.is_active) {
      return Errors.forbidden('Account is deactivated');
    }

    // Generate tokens
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const access_token = generateAccessToken(tokenPayload);
    const refresh_token = generateRefreshToken(tokenPayload);

    // Store refresh token
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, datetime('now', '+30 days'))
    `).run(uuid(), user.id, refresh_token);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return successResponse({
      data: {
        user: userWithoutPassword,
        access_token,
        refresh_token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    return Errors.internal();
  }
}
