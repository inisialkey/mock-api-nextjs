import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

// GET /api/chat/rooms — list user's chat rooms
export async function GET(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();

    const rooms = db
      .prepare(
        `SELECT cr.id, cr.name, cr.type, cr.created_at,
                GROUP_CONCAT(u.name, ', ') as members
         FROM chat_rooms cr
         JOIN chat_room_members crm ON cr.id = crm.room_id
         JOIN users u ON crm.user_id = u.id
         WHERE cr.id IN (
           SELECT room_id FROM chat_room_members WHERE user_id = ?
         )
         GROUP BY cr.id
         ORDER BY cr.created_at DESC`
      )
      .all(auth.id);

    return successResponse({ data: rooms });
  } catch (error) {
    console.error('Chat rooms error:', error);
    return Errors.internal();
  }
}

// POST /api/chat/rooms — create a chat room
export async function POST(request: NextRequest) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { name, type = 'private', member_ids = [] } = body;

    if (!member_ids.length) {
      return Errors.validation('member_ids is required (at least 1 other user)');
    }

    const db = getDb();
    const roomId = uuid();

    // Create room
    db.prepare('INSERT INTO chat_rooms (id, name, type) VALUES (?, ?, ?)').run(
      roomId,
      name || null,
      type
    );

    // Add creator
    db.prepare('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)').run(
      roomId,
      auth.id
    );

    // Add members
    const insertMember = db.prepare(
      'INSERT OR IGNORE INTO chat_room_members (room_id, user_id) VALUES (?, ?)'
    );
    for (const memberId of member_ids) {
      insertMember.run(roomId, memberId);
    }

    const room = db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(roomId);

    return successResponse({
      data: room,
      message: 'Chat room created',
      status: 201,
    });
  } catch (error) {
    console.error('Create room error:', error);
    return Errors.internal();
  }
}
