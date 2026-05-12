# Mock API — Design Overview & Conventions

> Production-ready REST API specification for **MockApp** — a modern Flutter mobile application.
> This document is the single source of truth for response shape, status codes, naming, error
> codes, authentication flow, pagination, and edge-case handling. The companion `openapi.yaml`
> is the machine-readable contract derived from this design.

---

## 1. Design Goals

| Goal | How it shows up |
|---|---|
| **Predictable** for mobile clients | Single response envelope, fixed field positions, stable enum values |
| **Easy to mock** (Mockoon / Postman) | Rich `examples` per endpoint, deterministic seed data, no random surprises |
| **Easy to consume** in Flutter / Dio / Bloc | `snake_case` fields, HTTP status drives dispatch, `error_code` enables programmatic handling |
| **Versioned** & forward-compatible | Path-versioned (`/api/v1`), additive changes only within a major version |
| **Observable** | `request_id` in every error response, `X-Request-Id` echo header |
| **Edge-case ready** | `?scenario=` query simulator covers slow network, timeouts, 4xx/5xx |

---

## 2. Response Envelope

Every JSON response — success or failure — uses **one of two shapes**. Never mix.

### 2.1 Success envelope

```jsonc
{
  "success": true,
  "message": "Login successful",
  "data": { /* T | T[] | null */ }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `success` | `boolean` | yes | Always `true` for 2xx |
| `message` | `string` | yes | Human-readable. Safe to show in a snackbar. |
| `data` | `object \| array \| null` | yes | The payload. `null` allowed for 204-equivalent semantics. |
| `meta` | `object` | optional | Present only on paginated list responses (see §3) |

### 2.2 Error envelope

```jsonc
{
  "success": false,
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."],
    "password": ["The password must be at least 8 characters."]
  },
  "error_code": "VALIDATION_ERROR",
  "request_id": "req_01HF3XK2N7A8YBPQ4ZM"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `success` | `boolean` | yes | Always `false` for 4xx / 5xx |
| `message` | `string` | yes | Human-readable. Safe to show in a snackbar. |
| `errors` | `object \| null` | yes | Field-keyed map of `string[]` for `422 VALIDATION_ERROR`; `null` for all other error responses |
| `error_code` | `string` | yes | Programmatic identifier (see §6). Dio interceptors dispatch on this. |
| `request_id` | `string` | yes | Opaque correlation ID. Mobile logs this for support tickets. |

> **Why `error_code` in addition to HTTP status?** HTTP status answers *category* (401 = auth problem).
> `error_code` answers *which auth problem* (`AUTH_TOKEN_EXPIRED` triggers refresh, `AUTH_REFRESH_TOKEN_INVALID`
> forces logout). Dio interceptors need both.

---

## 3. Pagination

Every list endpoint is paginated. Mobile passes `page` and `limit` as query params.

### 3.1 Request

```
GET /api/v1/products?page=2&limit=20&sort=created_at&order=desc&search=phone
```

| Param | Type | Default | Bounds | Notes |
|---|---|---|---|---|
| `page` | int | `1` | `>= 1` | 1-indexed |
| `limit` | int | `20` | `1..100` | Server enforces max 100 |
| `sort` | string | endpoint-specific | allowlist | E.g. `name`, `price`, `created_at` |
| `order` | string | `desc` | `asc` \| `desc` | |
| `search` | string | — | — | Free-text search on supported fields |

### 3.2 Response `meta`

```jsonc
{
  "success": true,
  "message": "Products retrieved",
  "data": [ /* … 20 items … */ ],
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 153,
    "total_pages": 8,
    "has_next": true,
    "has_prev": true
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `page` | int | Echo of request `page` |
| `limit` | int | Echo of request `limit` (after clamping) |
| `total` | int | Total matching records across all pages |
| `total_pages` | int | `ceil(total / limit)` |
| `has_next` | boolean | `page < total_pages` |
| `has_prev` | boolean | `page > 1` |

---

## 4. HTTP Status Code Map

The server uses **only** these status codes. Mobile interceptors should switch on this set.

| Code | Name | When | Body |
|---|---|---|---|
| **200** | OK | Successful `GET` / `PUT` / `PATCH` | Success envelope |
| **201** | Created | Successful `POST` that created a resource | Success envelope with `data = createdResource` |
| **204** | No Content | Successful `DELETE` | **No body** |
| **400** | Bad Request | Malformed JSON, missing required query param, bad enum | Error envelope, `error_code: BAD_REQUEST` |
| **401** | Unauthorized | Missing / invalid / expired token | Error envelope, `error_code: AUTH_*` |
| **403** | Forbidden | Authenticated but lacks permission | Error envelope, `error_code: AUTHORIZATION_FORBIDDEN` |
| **404** | Not Found | Resource doesn't exist or is hidden from this user | Error envelope, `error_code: RESOURCE_NOT_FOUND` |
| **409** | Conflict | Duplicate resource (email taken, etc.) | Error envelope, `error_code: RESOURCE_ALREADY_EXISTS` |
| **413** | Payload Too Large | File upload exceeds limit | Error envelope, `error_code: FILE_TOO_LARGE` |
| **415** | Unsupported Media Type | Wrong `Content-Type` on upload | Error envelope, `error_code: UNSUPPORTED_MEDIA_TYPE` |
| **422** | Unprocessable Entity | **Validation** failure (with field-level details) | Error envelope, `errors` populated, `error_code: VALIDATION_ERROR` |
| **426** | Upgrade Required | Mobile app version below force-update minimum | Error envelope, `error_code: FORCE_UPDATE_REQUIRED` |
| **429** | Too Many Requests | Rate limit exceeded | Error envelope, `error_code: RATE_LIMIT_EXCEEDED`, `Retry-After` header |
| **500** | Internal Server Error | Unhandled server fault | Error envelope, `error_code: INTERNAL_SERVER_ERROR` |
| **503** | Service Unavailable | Maintenance mode | Error envelope, `error_code: MAINTENANCE_MODE` |

> 400 vs 422: **400** is "I can't even parse your request." **422** is "I parsed it but field rules failed." Mobile shows field-level errors only for 422.

---

## 5. Authentication Flow

### 5.1 Token model

| Token | Lifetime (prod) | Lifetime (mock) | Where it lives on mobile |
|---|---|---|---|
| **access_token** | 15 minutes | 7 days *(current mock)* | RAM + `flutter_secure_storage` |
| **refresh_token** | 30 days | 30 days | `flutter_secure_storage` only |

> The current mock issues 7-day access tokens for development convenience. The spec
> documents 15 minutes as the production target. Mobile should not assume token lifetime —
> rely on `401 AUTH_TOKEN_EXPIRED` to trigger refresh.

### 5.2 Happy path

```
┌─────────┐                                    ┌─────────┐
│ Mobile  │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │  POST /api/v1/auth/login                     │
     │  { email, password }                         │
     ├─────────────────────────────────────────────►│
     │                                              │
     │  201 { access_token, refresh_token, user }   │
     │◄─────────────────────────────────────────────┤
     │                                              │
     │  GET /api/v1/products                        │
     │  Authorization: Bearer <access_token>        │
     ├─────────────────────────────────────────────►│
     │                                              │
     │  200 { products … }                          │
     │◄─────────────────────────────────────────────┤
```

### 5.3 Refresh flow (Dio interceptor)

```
     │  GET /api/v1/orders   (access_token expired)
     ├─────────────────────────────────────────────►│
     │  401 error_code=AUTH_TOKEN_EXPIRED            │
     │◄─────────────────────────────────────────────┤
     │                                              │
     │  POST /api/v1/auth/refresh                   │
     │  { refresh_token }                           │
     ├─────────────────────────────────────────────►│
     │  200 { access_token, refresh_token }         │
     │◄─────────────────────────────────────────────┤
     │                                              │
     │  GET /api/v1/orders    [retry, new token]    │
     ├─────────────────────────────────────────────►│
     │  200 { orders … }                            │
     │◄─────────────────────────────────────────────┤
```

### 5.4 Force-logout triggers

Mobile **must** clear tokens and route to login on any of:

| Trigger | Server response |
|---|---|
| Refresh token invalid/expired | `401 AUTH_REFRESH_TOKEN_INVALID` |
| Account deactivated | `403 AUTH_ACCOUNT_DISABLED` |
| User-initiated logout | `204` from `POST /auth/logout` |

### 5.5 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | none | Create account; returns user + tokens |
| `POST` | `/auth/login` | none | Exchange credentials for tokens |
| `POST` | `/auth/refresh` | refresh_token in body | Rotate access (+ refresh) token |
| `POST` | `/auth/logout` | access_token | Revoke refresh token (current device) |
| `GET` | `/auth/me` | access_token | Current user profile |

---

## 6. Error Code Registry

Bloc / Dio dispatch on `error_code`. Codes are stable across versions — never repurposed.

| Code | HTTP | When | Mobile action |
|---|---|---|---|
| `BAD_REQUEST` | 400 | Malformed JSON, bad enum | Show "Something went wrong"; log |
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email/password on login | Show inline form error |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token expired | Trigger refresh flow |
| `AUTH_TOKEN_INVALID` | 401 | Access token malformed/forged | Force logout |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | Refresh failed | Force logout |
| `AUTH_ACCOUNT_DISABLED` | 403 | `is_active = false` | Force logout, show "Account suspended" |
| `AUTHORIZATION_FORBIDDEN` | 403 | Authenticated but lacks role/permission | Show "You don't have access" |
| `RESOURCE_NOT_FOUND` | 404 | Resource missing | Show 404 page or empty state |
| `RESOURCE_ALREADY_EXISTS` | 409 | Duplicate (e.g., email registered) | Show inline form error |
| `FILE_TOO_LARGE` | 413 | Upload over `max_upload_size` | Show "File too large" |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Bad `Content-Type` | Show "Unsupported file type" |
| `VALIDATION_ERROR` | 422 | Field-level validation failed | Render `errors` map on form |
| `FORCE_UPDATE_REQUIRED` | 426 | App below `min_version` | Block UI, show update prompt |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Honor `Retry-After`, queue or back off |
| `MAINTENANCE_MODE` | 503 | Maintenance toggle on | Show maintenance screen |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled | Show generic error; log `request_id` |

Add codes as new domains land. **Never rename** an existing code.

---

## 7. Naming Conventions

### 7.1 Resources & paths

| Rule | Example |
|---|---|
| Resources are **plural nouns** | `/products`, `/users`, `/orders` |
| Path segments use **kebab-case** | `/feature-flags`, `/force-update` |
| Nested resources via path nesting | `/chat/rooms/{id}/messages` |
| Actions on resources via sub-path verbs (sparingly) | `/notifications/{id}/read`, `/notifications/read-all` |
| Filtering via **query params**, not path | `/products?category=electronics`, not `/products/electronics` |
| **Avoid** verbs in resource paths | `/users` ✓ — `/get-users` ✗ |

### 7.2 Fields

| Rule | Example |
|---|---|
| Field names use **snake_case** | `first_name`, `created_at` |
| Booleans use `is_` / `has_` / `can_` prefix | `is_active`, `has_unread`, `can_edit` |
| Timestamps named `*_at` (ISO 8601 UTC) | `created_at`, `updated_at`, `deleted_at`, `read_at` |
| Counts named `*_count` | `view_count`, `unread_count`, `rating_count` |
| IDs named `id` for self, `{noun}_id` for foreign | `id`, `user_id`, `product_id` |
| URLs named `*_url` | `avatar_url`, `image_url`, `support_whatsapp_url` |
| Enums are **lowercase snake_case** | `pending`, `in_transit`, `out_for_delivery` |

### 7.3 Money

```jsonc
{
  "price": 1500000,
  "discount_price": 1200000,
  "currency": "IDR"
}
```

- `price` / `discount_price` are integers in the **smallest currency unit** (no decimals for IDR).
- For decimal currencies (USD, EUR), use integer cents (`299` = `$2.99`).
- Always include `currency` (ISO 4217) on any money field.

> The current mock uses decimal `price` (e.g., `1500000.50` for IDR). The spec recommends migrating to integer-cents; until then, decimals are tolerated.

### 7.4 Identifiers

- All IDs are **UUID v4** strings (`9c858901-8a57-4791-81fe-4c455b099bc9`).
- Public-facing IDs (e.g., order number shown to user) use a separate `reference` field (`ORD-2026-00153`).

### 7.5 Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <token>` | request | Auth |
| `X-Request-Id` | request (optional) / response (echo) | Client-supplied correlation ID; server generates if missing |
| `X-App-Version` | request | E.g. `2.1.0` — enables version-gated feature flags & force update |
| `X-App-Platform` | request | `ios` \| `android` |
| `X-Device-Id` | request (optional) | Anonymous device identifier for analytics |
| `Accept-Language` | request | E.g. `id-ID`, `en-US` — drives `message` localization |
| `Retry-After` | response (429, 503) | Seconds until client should retry |

---

## 8. Versioning Strategy

- **Path-based major version**: `/api/v1/*`
- Within `v1`, **only additive** changes are made (new endpoints, new optional fields).
- Breaking changes (renaming a field, removing an enum, changing semantics) ship as `/api/v2/*`.
- The previous version is supported for **at least 6 months** after the next is released.
- Mobile reads the supported versions from `GET /api/v1/config` (`supported_api_versions` field).

> **Current state:** the existing code uses `/api/*` (no `/v1`). The spec targets `/api/v1/*`.
> Migration is a Next.js `rewrites` change in `next.config.js` plus updating the OpenAPI base path.

---

## 9. Edge-Case Simulation (`?scenario=`)

Append `?scenario=<name>` to **any** endpoint to force an edge-case response. Combine with `&` if multiple query params.

| Scenario | Effect | Use case |
|---|---|---|
| `error` | `500 INTERNAL_SERVER_ERROR` | Verify 5xx error UI |
| `validation` | `422 VALIDATION_ERROR` with example `errors` map | Verify form error rendering |
| `unauthorized` | `401 AUTH_TOKEN_EXPIRED` | Verify Dio refresh interceptor |
| `forbidden` | `403 AUTHORIZATION_FORBIDDEN` | Verify role-gated UI |
| `not_found` | `404 RESOURCE_NOT_FOUND` | Verify empty / 404 state |
| `maintenance` | `503 MAINTENANCE_MODE` | Verify maintenance screen |
| `rate_limit` | `429 RATE_LIMIT_EXCEEDED` with `Retry-After: 30` | Verify backoff |
| `force_update` | `426 FORCE_UPDATE_REQUIRED` | Verify update-required screen |
| `empty` | `200` with `data: []` and `meta.total: 0` | Verify empty list state |
| `slow` | 3-second delay, then normal response | Verify spinner & cancel |
| `very_slow` | 10-second delay | Stress test |
| `timeout` | Server holds connection open until client times out | Verify Dio `receiveTimeout` handling |

Mobile QA can drive a full edge-case test suite without server-side changes.

---

## 10. Localization

- `Accept-Language` request header drives `message` text. Supported: `id-ID` (default), `en-US`.
- `data` payload values (e.g., product names) are **not** translated server-side — they are stored as-is.
- `error_code` is **never** translated; `message` is.

---

## 11. Idempotency

`POST` requests that create resources accept an optional `Idempotency-Key` header (UUID). Repeated calls with the same key within 24 hours return the original response, preventing duplicate orders on flaky networks.

> **Current state:** not implemented in the mock. The spec documents it as the target. Mobile can send the header today; the mock will ignore it gracefully.

---

## 12. Realistic Dummy Data

The seed (`scripts/seed.ts`) produces:

- 32 users (1 admin, 1 fixed test user, 30 faker-generated)
- 50 products across 7 categories
- ~50 notifications across 4 channels
- 2 chat rooms (1 private, 1 group with 7 members) with seeded messages
- 17 app config entries, 12 feature flags, force-update entries for iOS + Android

**Fixed test accounts** (stable across reseeds — safe to reference in mobile tests):

```
admin@mock.com / password123
user@mock.com  / password123
```

---

## 13. What This Spec Does Not Do

- **No real auth** — passwords are SHA256 (mock-only). The spec assumes bcrypt or Argon2 in production.
- **No real rate-limiting** — `429` only via `?scenario=rate_limit`.
- **No real file storage** — `/upload` saves to local disk; production should swap for S3 / GCS.
- **No real payment processing** — out of scope. The Payments domain is a future addition.

---

## See Also

- `openapi.yaml` — Machine-readable OpenAPI 3.1 spec
- `flutter-integration-guide.md` — Clean Architecture + Bloc + Dio integration
- `postman_collection.json` — Importable Postman collection
- `mockoon-environment.json` — Importable Mockoon environment
