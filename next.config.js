/** @type {import('next').NextConfig} */
const nextConfig = {
  // Path-versioned routing: /api/v1/* transparently maps to /api/*.
  // The same Route Handlers serve both prefixes, so callers can use
  // the versioned path (per the API spec) without code changes here.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: '/api/:path*',
      },
    ];
  },

  // Allow all origins for mobile development.
  // The rule matches `/api/:path*`, which also covers `/api/v1/...`.
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-App-Version, X-App-Platform, X-Request-Id, Accept-Language' },
          { key: 'Access-Control-Expose-Headers', value: 'X-Request-Id, Retry-After' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
