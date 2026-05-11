# 🚀 Mock API — Next.js

Mock backend untuk kebutuhan tim mobile development.

## Tech Stack
- **Next.js 14** (App Router + Route Handlers)
- **TypeScript**
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

# API tersedia di http://localhost:3000/api
```

## Docker

```bash
docker-compose up -d
# API tersedia di http://localhost:3000/api
```

## Base URL

```
Development : http://localhost:3000/api
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
