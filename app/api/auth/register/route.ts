import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import {
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  TOKEN_TYPE,
  ACCESS_TOKEN_LIFETIME_SECONDS,
} from '@/lib/auth';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const body = await request.json();
    const { name, email, password, phone } = body;

    // Validation
    if (!name || !email || !password) {
      return Errors.validation('The given data was invalid.', {
        name:     !name     ? ['The name field is required.']     : undefined,
        email:    !email    ? ['The email field is required.']    : undefined,
        password: !password ? ['The password field is required.'] : undefined,
      });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return Errors.validation('The given data was invalid.', {
        password: ['The password must be at least 6 characters.'],
      });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return Errors.conflict('Email already registered.');
    }

    const id = uuid();
    const hashedPassword = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password, phone, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, email, hashedPassword, phone || null, null);

    const tokenPayload = { id, email, role: 'user' };
    const access_token = generateAccessToken(tokenPayload);
    const refresh_token = generateRefreshToken(tokenPayload);

    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, datetime('now', '+30 days'))
    `).run(uuid(), id, refresh_token);

    const user = db.prepare(`
      SELECT id, name, email, phone, avatar_url, role, is_active, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id);

    return successResponse({
      data: {
        user,
        access_token,
        refresh_token,
        token_type: TOKEN_TYPE,
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
      },
      message: 'Registration successful.',
      status: 201,
    });
  } catch (error) {
    console.error('Register error:', error);
    return Errors.internal();
  }
}
