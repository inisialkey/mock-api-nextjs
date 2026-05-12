# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A mock API backend (Next.js 14 App Router) for mobile team development. Provides REST endpoints, real-time WebSocket features via Socket.IO, SQLite persistence, and JWT auth. Designed to simulate a production-like backend with built-in scenario testing.

## Commands

```bash
npm run dev        # Start dev server (custom HTTP server with Socket.IO on port 3000)
npm run build      # Build Next.js app
npm run start      # Start production server
npm run seed       # Populate database with faker-generated dummy data
npm run reset      # Drop all data and re-seed
```

No test framework is configured. No linter is configured.

## Architecture

### Custom Server (`server.ts`)

Next.js runs behind a custom HTTP server that attaches Socket.IO to the same port. The IO instance is stored on `(global as any).__io` and accessed via `getIO()` from `lib/socket.ts`. This is required because Next.js Route Handlers can't natively host WebSocket connections.

### API Route Handlers (`app/api/`)

All endpoints use Next.js App Router Route Handlers (not Pages Router). Each route file exports named HTTP method functions (`GET`, `POST`, `PUT`, `DELETE`).

**Standard response format** — all endpoints use helpers from `lib/response.ts`:
- Success: `{ success: true, data, meta? }` where meta includes pagination
- Error: `{ success: false, error: { code, message, details? } }`

**Scenario simulator** — any endpoint can accept `?scenario=error|empty|slow|unauthorized|forbidden|not_found|validation|maintenance|rate_limit` to return canned responses for mobile testing. Check scenarios early in handlers via `lib/scenario.ts`.

### Auth (`lib/auth.ts`, `lib/middleware.ts`)

JWT with access token (7d) + refresh token (30d). Passwords hashed with SHA256 (intentionally simplified for mock use). The `withAuth` middleware extracts user from the Bearer token and passes it to the handler. Admin-only routes check `user.role === 'admin'`.

### Database (`lib/db.ts`)

Raw SQL with `better-sqlite3` (synchronous). No ORM. Schema is created inline via `CREATE TABLE IF NOT EXISTS` on first import. Database file lives at `data/mock.db`. Tables: users, refresh_tokens, products, notifications, uploads, chat_rooms, chat_room_members, chat_messages, app_config, feature_flags, force_update, maintenance.

### WebSocket (`lib/socket.ts`)

Socket.IO handles: chat (rooms, messaging, typing indicators), notifications (auto-broadcast every 30s), presence (online/offline tracking), live location sharing, and order status tracking (auto-simulated every 45s). All real-time state is in-memory only.

### Remote Configuration (`app/api/config/`)

Feature flags with platform targeting (ios/android/all), semantic version gating, percentage rollout (deterministic hash), and user whitelists. Plus force-update and maintenance mode endpoints.

## Key Patterns

- **Path alias**: `@/*` maps to project root in imports
- **CORS**: Wide-open (all origins) configured in `next.config.js` for mobile dev
- **Pagination**: Default 10 items, max 100; returned in `meta` field
- **IDs**: Generated with `uuid`
- **REST → WebSocket bridge**: `POST /api/ws/emit` triggers Socket.IO events from REST calls; route handlers can also emit directly via `getIO()`
- **Seed data**: Admin user is `admin@mock.com` / `password123`, regular user is `user@mock.com` / `password123`
