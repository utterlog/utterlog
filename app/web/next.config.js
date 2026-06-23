/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained .next/standalone/ folder with only the files
  // actually used at runtime — smaller images, no need for full node_modules.
  output: 'standalone',
  serverExternalPackages: ['pixi.js'],
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  turbopack: {
    root: __dirname,
  },

  // v2.1.5 added explicit experimental.staleTimes.dynamic = 0 trying
  // to disable Router Cache for dynamic routes. v2.3.0 removed it: in
  // Next 16.2.4 that's already the default
  // (node_modules/next/dist/esm/server/config-shared.js:207), so
  // setting it explicitly is a no-op. Removed to keep the config
  // minimal — if Next ever changes the default, we'll add it back
  // with a real reason then.

  async rewrites() {
    const internalApi = process.env.INTERNAL_API_URL || 'http://127.0.0.1:8080/api/v1';
    const apiHost = internalApi.replace(/\/api\/v1\/?$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${apiHost}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiHost}/uploads/:path*`,
      },
      // /feed is handled by app/feed/route.ts — direct fetch of
      // INTERNAL_API_URL + pass-through XML. The earlier external
      // URL rewrite to the old split API container returned
      // 500 in prod for reasons that didn't reproduce locally, so
      // we moved back to an explicit route handler with clear error
      // surfacing.
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utterlog.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
};

module.exports = nextConfig;
