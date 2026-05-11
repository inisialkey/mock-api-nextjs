import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { verifyToken, JwtPayload } from './auth';
import { getDb } from './db';

// ─── Types ────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  type: 'text' | 'image' | 'file';
  created_at: string;
}

interface LocationUpdate {
  user_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface TypingEvent {
  room_id: string;
  user_id: string;
  user_name: string;
  is_typing: boolean;
}

// ─── In-memory stores ─────────────────────────────────

// Track online users: userId -> Set<socketId>
const onlineUsers = new Map<string, Set<string>>();

// Track user locations
const userLocations = new Map<string, LocationUpdate>();

// Chat message history per room (in-memory for mock)
const chatHistory = new Map<string, ChatMessage[]>();

// ─── Helpers ──────────────────────────────────────────

function getUserName(userId: string): string {
  try {
    const db = getDb();
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as
      | { name: string }
      | undefined;
    return user?.name || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function setUserOnline(userId: string, socketId: string) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socketId);
}

function setUserOffline(userId: string, socketId: string) {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }
}

function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
}

// ─── Setup ────────────────────────────────────────────

export function setupSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    // Transports supported by mobile SDKs
    transports: ['websocket', 'polling'],
  });

  // ─── Auth Middleware ─────────────────────────────────
  // Authenticate via token in handshake query or auth header
  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token as string;

    if (!token) {
      return next(new Error('AUTH_ERROR: Token is required'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('AUTH_ERROR: Invalid or expired token'));
    }

    socket.user = payload;
    next();
  });

  // ─── Connection Handler ──────────────────────────────
  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    console.log(`🟢 Connected: ${user.email} (${socket.id})`);

    // Track online status
    setUserOnline(user.id, socket.id);

    // Join personal room for targeted events
    socket.join(`user:${user.id}`);

    // Broadcast online status to everyone
    io.emit('presence:update', {
      user_id: user.id,
      status: 'online',
      online_users: getOnlineUserIds(),
    });

    // ─── CHAT ─────────────────────────────────────────

    /**
     * Join a chat room
     * Event: chat:join
     * Payload: { room_id: string }
     */
    socket.on('chat:join', (data: { room_id: string }) => {
      const { room_id } = data;
      socket.join(`room:${room_id}`);

      // Send chat history
      const history = chatHistory.get(room_id) || [];
      socket.emit('chat:history', {
        room_id,
        messages: history.slice(-50), // Last 50 messages
      });

      // Notify room
      socket.to(`room:${room_id}`).emit('chat:user_joined', {
        room_id,
        user_id: user.id,
        user_name: getUserName(user.id),
        timestamp: new Date().toISOString(),
      });

      console.log(`   💬 ${user.email} joined room: ${room_id}`);
    });

    /**
     * Leave a chat room
     * Event: chat:leave
     * Payload: { room_id: string }
     */
    socket.on('chat:leave', (data: { room_id: string }) => {
      const { room_id } = data;
      socket.leave(`room:${room_id}`);

      socket.to(`room:${room_id}`).emit('chat:user_left', {
        room_id,
        user_id: user.id,
        user_name: getUserName(user.id),
        timestamp: new Date().toISOString(),
      });
    });

    /**
     * Send a chat message
     * Event: chat:send
     * Payload: { room_id: string, content: string, type?: 'text' | 'image' | 'file' }
     */
    socket.on(
      'chat:send',
      (data: { room_id: string; content: string; type?: string }, ack?: Function) => {
        const { room_id, content, type = 'text' } = data;

        const message: ChatMessage = {
          id: uuid(),
          room_id,
          sender_id: user.id,
          sender_name: getUserName(user.id),
          content,
          type: type as ChatMessage['type'],
          created_at: new Date().toISOString(),
        };

        // Store in history
        if (!chatHistory.has(room_id)) {
          chatHistory.set(room_id, []);
        }
        const history = chatHistory.get(room_id)!;
        history.push(message);

        // Keep only last 200 messages per room
        if (history.length > 200) {
          history.splice(0, history.length - 200);
        }

        // Broadcast to room (including sender)
        io.to(`room:${room_id}`).emit('chat:message', message);

        // Acknowledge receipt
        if (ack) ack({ success: true, message_id: message.id });
      }
    );

    /**
     * Typing indicator
     * Event: chat:typing
     * Payload: { room_id: string, is_typing: boolean }
     */
    socket.on('chat:typing', (data: { room_id: string; is_typing: boolean }) => {
      const { room_id, is_typing } = data;

      const event: TypingEvent = {
        room_id,
        user_id: user.id,
        user_name: getUserName(user.id),
        is_typing,
      };

      // Broadcast to room except sender
      socket.to(`room:${room_id}`).emit('chat:typing', event);
    });

    /**
     * Mark messages as read
     * Event: chat:read
     * Payload: { room_id: string, last_read_message_id: string }
     */
    socket.on(
      'chat:read',
      (data: { room_id: string; last_read_message_id: string }) => {
        socket.to(`room:${data.room_id}`).emit('chat:read_receipt', {
          room_id: data.room_id,
          user_id: user.id,
          last_read_message_id: data.last_read_message_id,
          timestamp: new Date().toISOString(),
        });
      }
    );

    // ─── NOTIFICATIONS (Real-time Push) ────────────────

    /**
     * Subscribe to notification channels
     * Event: notification:subscribe
     * Payload: { channels: string[] }
     * Channels: 'promo', 'order', 'system', 'general'
     */
    socket.on('notification:subscribe', (data: { channels: string[] }) => {
      for (const channel of data.channels) {
        socket.join(`notif:${channel}`);
      }
      socket.emit('notification:subscribed', {
        channels: data.channels,
      });
    });

    // ─── LIVE LOCATION ─────────────────────────────────

    /**
     * Start sharing location
     * Event: location:update
     * Payload: { latitude: number, longitude: number }
     */
    socket.on('location:update', (data: { latitude: number; longitude: number }) => {
      const update: LocationUpdate = {
        user_id: user.id,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date().toISOString(),
      };

      userLocations.set(user.id, update);

      // Broadcast to anyone tracking this user
      io.to(`tracking:${user.id}`).emit('location:updated', update);
    });

    /**
     * Start tracking another user's location
     * Event: location:track
     * Payload: { user_id: string }
     */
    socket.on('location:track', (data: { user_id: string }) => {
      socket.join(`tracking:${data.user_id}`);

      // Send last known location immediately
      const lastLocation = userLocations.get(data.user_id);
      if (lastLocation) {
        socket.emit('location:updated', lastLocation);
      }
    });

    /**
     * Stop tracking
     * Event: location:untrack
     * Payload: { user_id: string }
     */
    socket.on('location:untrack', (data: { user_id: string }) => {
      socket.leave(`tracking:${data.user_id}`);
    });

    // ─── PRESENCE ──────────────────────────────────────

    /**
     * Get online users list
     * Event: presence:get_online
     */
    socket.on('presence:get_online', (ack?: Function) => {
      const onlineIds = getOnlineUserIds();
      const response = {
        online_users: onlineIds,
        count: onlineIds.length,
      };

      if (ack) {
        ack(response);
      } else {
        socket.emit('presence:online_list', response);
      }
    });

    /**
     * Ping to keep alive / update activity
     * Event: presence:ping
     */
    socket.on('presence:ping', (ack?: Function) => {
      if (ack) ack({ status: 'pong', timestamp: new Date().toISOString() });
    });

    // ─── ORDER STATUS (Live Updates) ──────────────────

    /**
     * Subscribe to order status updates
     * Event: order:subscribe
     * Payload: { order_id: string }
     */
    socket.on('order:subscribe', (data: { order_id: string }) => {
      socket.join(`order:${data.order_id}`);
      socket.emit('order:subscribed', { order_id: data.order_id });
    });

    /**
     * Unsubscribe from order updates
     * Event: order:unsubscribe
     * Payload: { order_id: string }
     */
    socket.on('order:unsubscribe', (data: { order_id: string }) => {
      socket.leave(`order:${data.order_id}`);
    });

    // ─── DISCONNECT ────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`🔴 Disconnected: ${user.email} (${reason})`);

      setUserOffline(user.id, socket.id);
      userLocations.delete(user.id);

      // Only broadcast offline if user has no more active sockets
      if (!isUserOnline(user.id)) {
        io.emit('presence:update', {
          user_id: user.id,
          status: 'offline',
          online_users: getOnlineUserIds(),
        });
      }
    });

    // ─── ERROR HANDLING ────────────────────────────────

    socket.on('error', (err) => {
      console.error(`Socket error for ${user.email}:`, err);
    });
  });

  // ─── Mock Event Simulators ──────────────────────────
  // These run periodically to simulate real-time events
  // so mobile team can test without manual triggering

  // Simulate random notifications every 30 seconds
  setInterval(() => {
    const mockNotifications = [
      { title: '🔥 Flash Sale!', body: 'Diskon 50% untuk semua elektronik', type: 'promo' },
      { title: '📦 Order Update', body: 'Pesanan kamu sedang dikirim', type: 'order' },
      { title: '🔔 New Message', body: 'Kamu punya pesan baru', type: 'general' },
      { title: '⚙️ System Update', body: 'Maintenance terjadwal malam ini', type: 'system' },
    ];

    const notif = mockNotifications[Math.floor(Math.random() * mockNotifications.length)];

    io.to(`notif:${notif.type}`).emit('notification:new', {
      id: uuid(),
      ...notif,
      data: { mock: true },
      created_at: new Date().toISOString(),
    });
  }, 30000);

  // Simulate order status changes every 45 seconds
  const orderStatuses = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
  const orderStatusIndex = new Map<string, number>();

  setInterval(() => {
    // Find rooms that start with "order:"
    const rooms = io.sockets.adapter.rooms;
    for (const [roomName] of rooms) {
      if (roomName.startsWith('order:')) {
        const orderId = roomName.replace('order:', '');
        const currentIndex = orderStatusIndex.get(orderId) || 0;

        if (currentIndex < orderStatuses.length) {
          io.to(roomName).emit('order:status_update', {
            order_id: orderId,
            status: orderStatuses[currentIndex],
            message: `Order is now: ${orderStatuses[currentIndex]}`,
            timestamp: new Date().toISOString(),
          });

          orderStatusIndex.set(orderId, currentIndex + 1);
        }
      }
    }
  }, 45000);

  return io;
}

// ─── Utility: Emit from REST API ───────────────────────
// Use this in REST route handlers to push real-time events

export function getIO(): Server | null {
  return (global as any).__io || null;
}

/**
 * Send notification to specific user via WebSocket
 */
export function emitToUser(userId: string, event: string, data: any) {
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Broadcast to a notification channel
 */
export function emitToChannel(channel: string, event: string, data: any) {
  const io = getIO();
  if (io) {
    io.to(`notif:${channel}`).emit(event, data);
  }
}

/**
 * Emit order status update
 */
export function emitOrderUpdate(orderId: string, status: string, message: string) {
  const io = getIO();
  if (io) {
    io.to(`order:${orderId}`).emit('order:status_update', {
      order_id: orderId,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
