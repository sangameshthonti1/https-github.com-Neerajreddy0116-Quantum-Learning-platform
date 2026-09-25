// Vercel evaluates this file at build time. Set the public backend origin only
// after Render reports a healthy /api/health.
const rawOrigin = process.env.QLP_BACKEND_ORIGIN;

if (!rawOrigin) {
  throw new Error('Set QLP_BACKEND_ORIGIN to the healthy public FastAPI HTTPS origin before deploying Vercel.');
}

let backend;
try {
  backend = new URL(rawOrigin);
} catch {
  throw new Error('QLP_BACKEND_ORIGIN must be a valid HTTPS origin, for example https://your-service.onrender.com.');
}

if (backend.protocol !== 'https:' || backend.username || backend.password ||
    backend.pathname !== '/' || backend.search || backend.hash ||
    rawOrigin !== backend.origin && rawOrigin !== `${backend.origin}/`) {
  throw new Error('QLP_BACKEND_ORIGIN must be an HTTPS origin without a path, query, fragment, or credentials.');
}

export const config = {
  installCommand: 'npm ci',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
};
