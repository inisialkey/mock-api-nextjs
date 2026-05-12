# MockApp API — Specification Package

Production-ready mock API for the **MockApp** Flutter mobile application.

## What's in this directory

| File | What it is | Audience |
|---|---|---|
| **[`00-overview.md`](./00-overview.md)** | Design rationale, response envelope, status codes, error code registry, naming conventions, auth flow, edge cases | Everyone — read this first |
| **[`openapi.yaml`](./openapi.yaml)** | OpenAPI 3.1 spec, machine-readable, with rich examples per response | Tooling (Swagger UI, Mockoon, code generators) |
| **[`flutter-integration-guide.md`](./flutter-integration-guide.md)** | Clean Architecture folder structure, Dio interceptor patterns, Bloc patterns, repository, error mapping, pagination, WebSocket | Flutter team |
| **[`postman_collection.json`](./postman_collection.json)** | Postman v2.1 collection — every endpoint, scenarios folder, auto-captures tokens | Backend / QA |
| **[`postman_environment.json`](./postman_environment.json)** | Companion environment file for the Postman collection | Postman users |
| **[`mockoon-setup.md`](./mockoon-setup.md)** | How to point Mockoon at the OpenAPI spec for deterministic mocking in CI | QA / DevOps |

## Reading order

1. **[`00-overview.md`](./00-overview.md)** — design contract
2. **[`openapi.yaml`](./openapi.yaml)** — exact endpoint shapes
3. **[`flutter-integration-guide.md`](./flutter-integration-guide.md)** — mobile-side patterns
4. **[`postman_collection.json`](./postman_collection.json)** — explore endpoints interactively
5. **[`mockoon-setup.md`](./mockoon-setup.md)** — set up a deterministic mock for CI

## Quick start

### Run the live Next.js mock (this repo)

```bash
npm run seed     # populate SQLite with deterministic seed data
npm run dev      # http://localhost:3000/api
```

### Run a deterministic Mockoon mock

```bash
npm i -g @mockoon/cli
mockoon-cli start --data docs/api/openapi.yaml --port 3001
# Now serves http://localhost:3001/api/v1
```

### Explore in Postman

1. Postman → **Import** → drop `postman_collection.json` and `postman_environment.json`
2. Select **MockApp (Local)** environment
3. Run **Auth → Login (admin)** — the token is captured into the environment
4. Every other request is now authorized via the collection's Bearer auth

### View the spec in Swagger UI

```bash
npx swagger-ui-watcher docs/api/openapi.yaml
# Open the printed URL
```

## Key contracts at a glance

### Response envelope

```jsonc
// Success
{
  "success": true,
  "message": "Login successful.",
  "data": { /* … */ },
  "meta": { /* present on paginated lists */ }
}

// Error
{
  "success": false,
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."]
  },
  "error_code": "VALIDATION_ERROR",
  "request_id": "req_01HF3XK2N7A8YBPQ4ZM"
}
```

### Pagination

```
GET /products?page=2&limit=20&sort=created_at&order=desc&search=phone
```

```jsonc
"meta": {
  "page": 2, "limit": 20, "total": 153, "total_pages": 8,
  "has_next": true, "has_prev": true
}
```

### Auth flow

1. `POST /auth/login` → `{access_token, refresh_token, user}`
2. Subsequent requests: `Authorization: Bearer <access_token>`
3. On `401 AUTH_TOKEN_EXPIRED` → `POST /auth/refresh` → retry original
4. On `401 AUTH_REFRESH_TOKEN_INVALID` → force logout

### Edge case scenarios

Append `?scenario=<name>` to any endpoint:
`error` `validation` `unauthorized` `forbidden` `not_found` `maintenance`
`rate_limit` `force_update` `empty` `slow` `very_slow` `timeout`

### Test accounts

```
admin@mock.com / password123    (role: admin)
user@mock.com  / password123    (role: user)
```

### Domains at a glance

| Domain | Endpoints | Notes |
|---|---|---|
| Auth | register, login, refresh, logout, me | dual-token JWT, rotation, 401-on-revoked-refresh |
| Users | list, get, update, delete | public list/detail; auth required for mutations |
| Products | list, get, create, update, delete | rich filtering, sort, pagination, scenario sim |
| Notifications | list, mark-read, mark-all-read | unread_count in meta |
| Chat | rooms list/create, messages | history via REST; live events via Socket.IO |
| Categories | list, get-by-slug | parent_id filter for tree navigation |
| Addresses | list, create, get, update, delete, set-default | atomic default swap |
| Cart | get (with summary), add, update qty, remove, clear | upserts on add, stock-aware |
| Orders | list (filterable), create-from-cart, get (by id or reference), cancel | address snapshot, status transitions, payment_status tracking |
| Config | bundle, feature flags, force-update, maintenance | per-platform, per-version, percentage-rollout flags |
| Upload | upload file | multipart, size-limited |
| System | health | uptime + version |
| WebSocket | emit via REST | chat / notifications / order tracking / presence / location |

## Spec ↔ Code Alignment

The Next.js implementation and the OpenAPI spec now agree. Both serve the same
response envelope, pagination shape, error codes, and endpoints. The dev server
(`npm run dev`, port 3000) and Mockoon (`docs/api/openapi.yaml`, port 3001) are
interchangeable for client testing.

| Concern | Both spec and code now do |
|---|---|
| Path prefix | `/api/*` and `/api/v1/*` both work (rewrite in `next.config.js`) |
| Error envelope | `{success, message, errors, error_code, request_id}` |
| Pagination | `{page, limit, total, total_pages, has_next, has_prev}` |
| `avatar_url` | top-level on user payload |
| Logout | `POST /auth/logout` returns `204 No Content` |
| Access token TTL | exposed via `expires_in` (seconds) — configurable via `JWT_EXPIRES_IN` |
| E-commerce domains | categories, addresses, cart, orders all implemented |

The Next.js mock is suitable as both a reference implementation and a working
backend for Flutter integration.
- Mobile clients should code against the **spec** and rely on Mockoon in CI; the live Next.js server is for ad-hoc exploration only.
