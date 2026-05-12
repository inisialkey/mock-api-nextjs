# 🚀 Mock API — Next.js

Mock backend untuk kebutuhan tim mobile development.

## Tech Stack
- **Next.js 14** (App Router + Route Handlers)
- **TypeScript**
- **Socket.IO** (WebSocket real-time)
- **better-sqlite3** (lightweight database)
- **jsonwebtoken** (auth mock)
- **@faker-js/faker** (data generator)

## Quick Start

```bash
# Install dependencies
npm install

# Seed database dengan dummy data
npm run seed

# Jalankan development server
npm run dev

# REST API  → http://localhost:3000/api
# WebSocket → ws://localhost:3000
```

## Docker

```bash
docker-compose up -d
# API tersedia di http://localhost:3000/api
```

## Base URL

```
REST API   : http://localhost:3000/api
WebSocket  : ws://localhost:3000
```

## API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|---------------------|--------------------------|
| POST | /api/auth/register | Register user baru |
| POST | /api/auth/login | Login & dapat token |
| POST | /api/auth/refresh | Refresh access token |
| GET | /api/auth/me | Get current user profile |

### Users
| Method | Endpoint | Description |
|--------|------------------------|--------------------------|
| GET | /api/users | List users (paginated) |
| GET | /api/users/:id | Get user detail |
| PUT | /api/users/:id | Update user |
| DELETE | /api/users/:id | Delete user |

### Products
| Method | Endpoint | Description |
|--------|--------------------------|--------------------------|
| GET | /api/products | List products (paginated)|
| GET | /api/products/:id | Get product detail |
| POST | /api/products | Create product |
| PUT | /api/products/:id | Update product |
| DELETE | /api/products/:id | Delete product |

### Notifications
| Method | Endpoint | Description |
|--------|-------------------------------|--------------------------|
| GET | /api/notifications | List notifications |
| PUT | /api/notifications/:id/read | Mark as read |
| PUT | /api/notifications/read-all | Mark all as read |

### File Upload
| Method | Endpoint | Description |
|--------|----------------------|--------------------------|
| POST | /api/upload | Upload file |

### Chat (REST)
| Method | Endpoint | Description |
|--------|--------------------------------------|--------------------------|
| GET | /api/chat/rooms | List user's chat rooms |
| POST | /api/chat/rooms | Create chat room |
| GET | /api/chat/rooms/:id/messages | Get chat history |

### WebSocket Trigger (REST → WS)
| Method | Endpoint | Description |
|--------|----------------------|--------------------------------------|
| POST | /api/ws/emit | Trigger WS events from REST/Postman |

### App Config / Remote Config
| Method | Endpoint | Description |
|--------|--------------------------------------|----------------------------------------------|
| GET | /api/config | Get all config (configs + flags + update + maintenance) |
| PUT | /api/config | Update a config key-value (admin) |
| GET | /api/config/feature-flags | List all feature flags detail (admin) |
| POST | /api/config/feature-flags | Create/update feature flag (admin) |
| DELETE | /api/config/feature-flags | Delete feature flag (admin) |
| GET | /api/config/force-update | Check if app needs update (public) |
| PUT | /api/config/force-update | Update force-update config (admin) |
| GET | /api/config/maintenance | Check maintenance mode (public) |
| PUT | /api/config/maintenance | Toggle maintenance mode (admin) |

### Config Query Parameters
```
# Get all config for Android, app version 2.0.0
GET /api/config?platform=android&app_version=2.0.0

# Check force update
GET /api/config/force-update?platform=ios&app_version=1.0.0

# Check maintenance with version bypass
GET /api/config/maintenance?app_version=2.1.0
```

### Feature Flag Capabilities
- **Platform targeting**: `all`, `ios`, `android`
- **Version gating**: `min_version` / `max_version`
- **Percentage rollout**: `user_percentage` (0-100%)
- **User whitelist**: specific user IDs always get the flag
- Flags are evaluated per-user deterministically (same user always gets same result)

## WebSocket Events

### Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: '<access_token>' }
});
```

### Chat
| Event | Direction | Payload |
|-------|-----------|---------|
| chat:join | Client → Server | `{ room_id }` |
| chat:leave | Client → Server | `{ room_id }` |
| chat:send | Client → Server | `{ room_id, content, type? }` |
| chat:typing | Client → Server | `{ room_id, is_typing }` |
| chat:read | Client → Server | `{ room_id, last_read_message_id }` |
| chat:message | Server → Client | `{ id, room_id, sender_id, content, ... }` |
| chat:history | Server → Client | `{ room_id, messages[] }` |
| chat:typing | Server → Client | `{ room_id, user_id, is_typing }` |
| chat:read_receipt | Server → Client | `{ room_id, user_id, last_read_message_id }` |
| chat:user_joined | Server → Client | `{ room_id, user_id, user_name }` |
| chat:user_left | Server → Client | `{ room_id, user_id, user_name }` |

### Notifications (Real-time)
| Event | Direction | Payload |
|-------|-----------|---------|
| notification:subscribe | Client → Server | `{ channels: ['promo','order',...] }` |
| notification:new | Server → Client | `{ id, title, body, type, data }` |

### Presence (Online/Offline)
| Event | Direction | Payload |
|-------|-----------|---------|
| presence:get_online | Client → Server | — |
| presence:ping | Client → Server | — |
| presence:update | Server → Client | `{ user_id, status, online_users[] }` |
| presence:online_list | Server → Client | `{ online_users[], count }` |

### Live Location
| Event | Direction | Payload |
|-------|-----------|---------|
| location:update | Client → Server | `{ latitude, longitude }` |
| location:track | Client → Server | `{ user_id }` |
| location:untrack | Client → Server | `{ user_id }` |
| location:updated | Server → Client | `{ user_id, latitude, longitude, timestamp }` |

### Order Tracking
| Event | Direction | Payload |
|-------|-----------|---------|
| order:subscribe | Client → Server | `{ order_id }` |
| order:unsubscribe | Client → Server | `{ order_id }` |
| order:status_update | Server → Client | `{ order_id, status, message, timestamp }` |

### Auto Simulators
- Mock notification dikirim setiap **30 detik** ke subscribed channels
- Order status berubah otomatis setiap **45 detik** untuk subscribed orders

## Query Parameters

### Pagination
```
GET /api/products?page=1&limit=10
```

### Search
```
GET /api/products?search=sepatu
```

### Sort
```
GET /api/products?sort=price&order=asc
```

### Filter
```
GET /api/products?category=electronics&min_price=100&max_price=500
```

### Scenario Testing
```
GET /api/products?scenario=error     → 500 Internal Server Error
GET /api/products?scenario=empty     → Empty data []
GET /api/products?scenario=slow      → 3 second delay
GET /api/products?scenario=unauthorized → 401 Unauthorized
```

## Authentication Flow

```
1. POST /api/auth/register → register user
2. POST /api/auth/login    → dapat access_token + refresh_token
3. Kirim header: Authorization: Bearer <access_token>
4. POST /api/auth/refresh  → kirim refresh_token, dapat access_token baru
```

## Standard Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "total_pages": 10
  }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": { ... }
  }
}
```

## Environment Variables

```env
JWT_SECRET=mock-secret-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
PORT=3000
MOCK_DELAY=0
```

## Folder Structure

```
mock-api-nextjs/
├── app/
│   └── api/
│       ├── auth/
│       │   ├── register/route.ts
│       │   ├── login/route.ts
│       │   ├── refresh/route.ts
│       │   └── me/route.ts
│       ├── users/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── products/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── notifications/
│       │   ├── route.ts
│       │   ├── [id]/read/route.ts
│       │   └── read-all/route.ts
│       └── upload/route.ts
├── lib/
│   ├── db.ts              ← database connection & init
│   ├── auth.ts            ← JWT helpers
│   ├── response.ts        ← standard response helpers
│   ├── middleware.ts       ← auth middleware
│   └── scenario.ts        ← scenario simulator
├── scripts/
│   └── seed.ts            ← database seeder
├── data/
│   └── mock.db            ← SQLite database (auto-generated)
└── uploads/               ← uploaded files
```
