import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { emitToUser, emitToChannel, emitOrderUpdate } from '@/lib/socket';
import { successResponse, Errors } from '@/lib/response';
import { authenticate, isAuthError } from '@/lib/middleware';

/**
 * POST /api/ws/emit
 *
 * REST endpoint to manually trigger WebSocket events.
 * Useful for testing real-time features from Postman or curl.
 *
 * Body:
 * {
 *   "event_type": "notification" | "order_update" | "user_message",
 *   "target_user_id": "user-uuid",         // for notification & user_message
 *   "channel": "promo" | "order" | ...,     // for notification channel broadcast
 *   "order_id": "order-uuid",               // for order_update
 *   "data": { ... }                         // event payload
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = authenticate(request);
    if (isAuthError(auth)) return auth;

    const body = await request.json();
    const { event_type, target_user_id, channel, order_id, data } = body;

    if (!event_type) {
      return Errors.validation('event_type is required');
    }

    switch (event_type) {
      case 'notification': {
        const notification = {
          id: uuid(),
          title: data?.title || 'Test Notification',
          body: data?.body || 'This is a test notification from REST',
          type: data?.type || 'general',
          data: data?.payload || {},
          created_at: new Date().toISOString(),
        };

        if (target_user_id) {
          emitToUser(target_user_id, 'notification:new', notification);
        } else if (channel) {
          emitToChannel(channel, 'notification:new', notification);
        } else {
          return Errors.validation('target_user_id or channel is required');
        }

        return successResponse({
          data: notification,
          message: 'Notification emitted via WebSocket',
        });
      }

      case 'order_update': {
        if (!order_id) {
          return Errors.validation('order_id is required for order_update');
        }

        const status = data?.status || 'processing';
        const message = data?.message || `Order status changed to: ${status}`;

        emitOrderUpdate(order_id, status, message);

        return successResponse({
          data: { order_id, status, message },
          message: 'Order update emitted via WebSocket',
        });
      }

      case 'user_message': {
        if (!target_user_id) {
          return Errors.validation('target_user_id is required for user_message');
        }

        const msg = {
          id: uuid(),
          from: auth.id,
          content: data?.content || 'Hello from REST API!',
          created_at: new Date().toISOString(),
        };

        emitToUser(target_user_id, 'chat:direct_message', msg);

        return successResponse({
          data: msg,
          message: 'Message emitted via WebSocket',
        });
      }

      default:
        return Errors.validation(
          `Unknown event_type: "${event_type}". Use: notification, order_update, user_message`
        );
    }
  } catch (error) {
    console.error('WS emit error:', error);
    return Errors.internal();
  }
}
