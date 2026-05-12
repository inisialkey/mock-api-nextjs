# Mockoon Setup

Mockoon is the recommended **deterministic** mock server for Flutter integration tests.
The Next.js mock in this repo is great for development with seeded data + a real DB +
WebSocket. Mockoon is better for CI because every response is fixed.

---

## 1. Install

```bash
# macOS
brew install --cask mockoon

# Or download from https://mockoon.com/download/
```

Or use the CLI in CI:

```bash
npm install -g @mockoon/cli
```

---

## 2. Import the OpenAPI spec (recommended)

Mockoon has first-class OpenAPI 3.x import. **You do not need a separate Mockoon environment file.**

### GUI

1. Open Mockoon → **File → Import / export → OpenAPI specification (import)**
2. Select `docs/api/openapi.yaml` from this repo
3. Mockoon generates routes from the `paths` section
4. **Examples** in the spec become served response bodies
5. Set **Environment → Port** to `3001`
6. Click **Start server**

Done. Mockoon now serves the API at `http://localhost:3001/api/v1`.

### CLI

```bash
mockoon-cli start --data docs/api/openapi.yaml --port 3001
```

This is what your CI pipeline should run.

---

## 3. Point Flutter at the Mockoon mock

In `config/env/env.dev.dart`:

```dart
class DevEnv implements Env {
  // iOS simulator
  @override final apiBaseUrl = 'http://localhost:3001/api/v1';
  // Android emulator (special host alias for the dev machine)
  // @override final apiBaseUrl = 'http://10.0.2.2:3001/api/v1';
  // Physical device on same LAN
  // @override final apiBaseUrl = 'http://192.168.1.42:3001/api/v1';
  // …
}
```

---

## 4. Scenario simulation in Mockoon

Mockoon's **response rules** can match on query parameters. To replicate the `?scenario=…`
behavior from the Next.js mock:

1. Open the route in Mockoon (e.g., `GET /products`)
2. Add a new **Response** for each scenario you care about (`error`, `validation`, `empty`, `slow`, etc.)
3. Set the response **Rules** tab:
   - Condition: **Query string** → param `scenario` → equals → e.g. `empty`
4. Mockoon picks the matching response when the request comes in

Or, simpler: import once, then duplicate the route per scenario and rename it
`/products (scenario=empty)`, etc. Either approach works for Flutter QA.

> The `00-overview.md §9` table lists every scenario. Add response variants for each.

---

## 5. CI integration (Flutter integration tests)

`.github/workflows/flutter.yml`:

```yaml
- name: Start Mockoon
  run: mockoon-cli start --data docs/api/openapi.yaml --port 3001 --daemon-off &

- name: Wait for Mockoon
  run: |
    for i in {1..30}; do
      curl -fs http://localhost:3001/api/v1/health && break
      sleep 1
    done

- name: Run Flutter integration tests
  env:
    API_BASE_URL: http://localhost:3001/api/v1
  run: flutter test integration_test/
```

---

## 6. When to use which mock

| You need… | Use |
|---|---|
| Realistic seeded data, JWT, WebSocket, server-side logic | **Next.js mock** (`npm run dev` on port 3000) |
| Deterministic responses for CI integration tests | **Mockoon** (port 3001) |
| Visual exploration / Postman runner | **Postman** with `postman_collection.json` |
| OpenAPI documentation viewer | Any Swagger UI pointing at `openapi.yaml` |

All three consume the **same** OpenAPI spec, so they stay in sync.
