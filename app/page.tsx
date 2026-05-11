export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🚀 Mock API Server</h1>
      <p>API is running. Use the endpoints below:</p>
      <pre>
        {`
Base URL: http://localhost:3000/api

Endpoints:
  GET  /api/health              → Health check
  POST /api/auth/register       → Register
  POST /api/auth/login          → Login
  POST /api/auth/refresh        → Refresh token
  GET  /api/auth/me             → Current user
  GET  /api/users               → List users
  GET  /api/users/:id           → User detail
  GET  /api/products            → List products
  GET  /api/products/:id        → Product detail
  POST /api/products            → Create product
  GET  /api/notifications       → List notifications
  POST /api/upload              → Upload file

Test Accounts:
  Admin: admin@mock.com / password123
  User:  user@mock.com  / password123

Scenario Testing:
  Add ?scenario=error|empty|slow|unauthorized|maintenance|rate_limit
        `}
      </pre>
    </main>
  );
}
