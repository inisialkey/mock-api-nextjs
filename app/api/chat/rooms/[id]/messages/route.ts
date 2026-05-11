import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticate, isAuthError } from '@/lib/middleware';
import { successResponse, buildPagination, Errors } from '@/lib/response';
import { handleScenario } from '@/lib/scenario';

interface CountRow {
  count: number;
}

interface Params {
  params: { id: string };
}

// GET /api/chat/rooms/:id/messages — get chat history
export async function GET(request: NextRequest, { params }: Params) {
  const scenarioResponse = await handleScenario(request);
  if (scenarioResponse) return scenarioResponse;

  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const db = getDb();
    const roomId = params.id;

    // Verify user is member of this room
    const membership = db
      .prepare('SELECT room_id FROM chat_room_members WHERE room_id = ? AND user_id = ?')
      .get(roomId, auth.id);

    if (!membership) {
      return Errors.forbidden('You are not a member of this chat room');
    }

    const { searchParams } = new URL(request.url);

    // Count total messages
    const countRow = db
      .prepare('SELECT COUNT(*) as count FROM chat_messages WHERE room_id = ?')
      .get(roomId) as CountRow;

    const meta = buildPagination(searchParams, countRow.count);
    const offset = (meta.page - 1) * meta.limit;

    // Fetch messages with sender info
    const messages = db
      .prepare(
        `SELECT cm.id, cm.room_id, cm.sender_id, u.name as sender_name,
                u.avatar as sender_avatar, cm.content, cm.type, cm.created_at
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.room_id = ?
         ORDER BY cm.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(roomId, meta.limit, offset);

    return successResponse({ data: messages, meta });
  } catch (error) {
    console.error('Chat messages error:', error);
    return Errors.internal();
  }
}
