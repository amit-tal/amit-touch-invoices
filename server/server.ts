import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { documentServerMiddleware } from './documentServerMiddleware.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
};

const apiHandler = documentServerMiddleware();

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const rawUrl = req.url || '/';
  const urlPath = rawUrl.split('?')[0];

  // Base security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Route API requests to API middleware
  if (urlPath.startsWith('/api/')) {
    apiHandler(req, res, () => {
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    });
    return;
  }

  // Ensure production dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Application build not found. Please run "pnpm build" first.');
    return;
  }

  // Static file serving with path traversal protection
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  // Security check: ensure path is inside DIST_DIR
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  let fileStat: fs.Stats | null = null;
  try {
    fileStat = fs.statSync(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      fileStat = fs.statSync(filePath);
    }
  } catch {
    // File not found; fallback to SPA index.html
    filePath = path.join(DIST_DIR, 'index.html');
    try {
      fileStat = fs.statSync(filePath);
    } catch {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  // Cache policy
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error('File stream error:', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[AMIT TOUCH] Production server listening at http://${HOST}:${PORT}`);
  console.log(`[AMIT TOUCH] Static files served from: ${DIST_DIR}`);
});

const handleShutdown = (signal: string) => {
  console.log(`[AMIT TOUCH] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[AMIT TOUCH] HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[AMIT TOUCH] Force shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
