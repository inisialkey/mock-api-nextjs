import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  TOKEN_TYPE,
  ACCESS_TOKEN_LIFETIME_SECONDS,
} from '@/lib/auth';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return Errors.validation('The given data was invalid.', {
        email:    !email    ? ['The email field is required.']    : undefined,
        password: !password ? ['The password field is required.'] : undefined,
      });
    }

    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined;

    if (!user || !verifyPassword(password, user.password)) {
      return Errors.invalidCredentials();
    }

    if (!user.is_active) {
      return Errors.accountDisabled();
    }

    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const access_token = generateAccessToken(tokenPayload);
    const refresh_token = generateRefreshToken(tokenPayload);

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, datetime('now', '+30 days'))
    `).run(uuid(), user.id, refresh_token);

    const { password: _, ...userWithoutPassword } = user;

    return successResponse({
      data: {
        user: userWithoutPassword,
        access_token,
        refresh_token,
        token_type: TOKEN_TYPE,
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      },
      message: 'Login successful.',
    });
  } catch (error) {
    console.error('Login error:', error);
    return Errors.internal();
  }
}
