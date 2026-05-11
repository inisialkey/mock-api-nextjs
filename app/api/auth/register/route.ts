import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { hashPassword, generateAccessToken, generateRefreshToken } from '@/lib/auth';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

export async function POST(request: NextRequest) {
  // Check scenario
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const body = await request.json();
    const { name, email, password, phone } = body;

    // Validation
    if (!name || !email || !password) {
      return Errors.validation('Missing required fields', {
        name: !name ? 'Name is required' : undefined,
        email: !email ? 'Email is required' : undefined,
        password: !password ? 'Password is required' : undefined,
      });
    }

    if (password.length < 6) {
      return Errors.validation('Password must be at least 6 characters');
    }

    const db = getDb();

    // Check duplicate email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return Errors.conflict('Email already registered');
    }

    // Create user
    const id = uuid();
    const hashedPassword = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password, phone, avatar)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, email, hashedPassword, phone || null, null);

    // Generate tokens
    const tokenPayload = { id, email, role: 'user' };
    const access_token = generateAccessToken(tokenPayload);
    const refresh_token = generateRefreshToken(tokenPayload);

    // Store refresh token
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, datetime('now', '+30 days'))
    `).run(uuid(), id, refresh_token);

    // Fetch created user (without password)
    const user = db.prepare(`
      SELECT id, name, email, phone, avatar, role, created_at
      FROM users WHERE id = ?
    `).get(id);

    return successResponse({
      data: {
        user,
        access_token,
        refresh_token,
      },
      message: 'Registration successful',
      status: 201,
    });
  } catch (error) {
    console.error('Register error:', error);
    return Errors.internal();
  }
}
