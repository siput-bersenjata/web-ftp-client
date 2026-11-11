/**
 * Keamanan bersama untuk semua serverless functions.
 *
 * - CORS allow-list (bukan lagi "*")
 * - SSRF guard: tolak host privat/loopback/link-local/reserved
 * - Autentikasi token (HMAC) untuk endpoint FTP — tidak bisa lagi dipakai
 *   sebagai relay terbuka ke sembarang server FTP
 */
const db = require('./db');

// ---------------------------------------------------------------------------
// CORS — hanya origin kita sendiri
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://web-ftp-client-five.vercel.app',
  'https://web-ftp-client-salshya.vercel.app',
  'http://localhost:5173',
  'http://localhost:5077',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
];

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // preview deployments Vercel (*.vercel.app milik proyek kita)
  if (/^https:\/\/web-ftp-client-[a-z0-9]+-salshya\.vercel\.app$/.test(origin)) return true;
  return false;
}

/** Set header CORS ketat + tangani preflight. Mengembalikan true jika request OPTIONS (langsung selesai). */
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ftp-config, x-db-token');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(origin && originAllowed(origin) ? 204 : 403).end();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SSRF guard — tolak host privat / loopback / link-local / reserved
// ---------------------------------------------------------------------------
const PRIVATE_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/,  // CGN 100.64/10
  /^::1$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /^\[?::ffff:127\./i,
  /^\[?::ffff:10\./i,
  /^\[?::ffff:192\.168\./i,
  /\.(local|internal|lan|home|corp)$/i,
];

function isPrivateHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return true;
  return PRIVATE_PATTERNS.some((re) => re.test(h));
}

// ---------------------------------------------------------------------------
// Autentikasi token (dari header x-db-token atau body.token)
// ---------------------------------------------------------------------------
const { rateLimit, clientIp } = require('./ratelimit');

async function authenticateRequest(req, body) {
  const token = req.headers['x-db-token'] || (body && body.token) || (req.query && req.query.token);
  if (!token) return null;
  if (!db.isConfigured()) return null;
  const data = await db.readDb();
  if (!data) return null;
  return db.verifyToken(data, token);
}

/** Guard untuk endpoint FTP: rate-limit per IP + autentikasi wajib. */
async function guardRequest(req, res, body) {
  // Rate limit: 120 request/menit per IP untuk operasi FTP
  const rl = rateLimit('ftp:' + clientIp(req), 120, 60 * 1000);
  if (!rl.ok) {
    res.status(429).json({ error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfter} detik.` });
    return null;
  }
  const user = await authenticateRequest(req, body);
  if (!user) {
    res.status(401).json({ error: 'Otentikasi diperlukan. Silakan login kembali.' });
    return null;
  }
  return user;
}

module.exports = { setCors, isPrivateHost, originAllowed, authenticateRequest, guardRequest };
