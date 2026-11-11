/**
 * Database bersama di Vercel Blob (privat) — satu file JSON:
 *   ftp-db/cloud_db.json  →  { _secret, users: [...], profiles: [...] }
 *
 * Akses selalu lewat endpoint /api/db/* dengan token HMAC yang ditandatangani
 * oleh _secret milik database itu sendiri — kredensial tidak pernah bocor ke
 * klien lain, dan akun non-admin hanya melihat data miliknya sendiri.
 */
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

const DB_PATH = 'ftp-db/cloud_db.json';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

function isConfigured() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function userKey(u) {
  return (u && (u.usernameLower || u.username || u.id || '')).toString().trim().toLowerCase();
}

function makeSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/** Baca database. Mengembalikan null jika belum ada isi. */
async function readDb() {
  if (!isConfigured()) return null;
  const res = await get(DB_PATH, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  const db = JSON.parse(text);
  return normalizeDb(db);
}

/** Tulis database (menimpa). */
async function writeDb(db) {
  const payload = JSON.stringify(normalizeDb(db));
  await put(DB_PATH, payload, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  return true;
}

function normalizeDb(db) {
  const out = db && typeof db === 'object' ? db : {};
  out.users = Array.isArray(out.users) ? out.users : [];
  out.profiles = Array.isArray(out.profiles) ? out.profiles : [];
  out.stats = out.stats && typeof out.stats === 'object' ? out.stats : {};
  if (typeof out.stats.loginCount !== 'number') out.stats.loginCount = 0;
  if (!out._secret) out._secret = makeSecret();
  return out;
}

function getUserByName(db, username) {
  const key = String(username || '').trim().toLowerCase();
  return db.users.find((u) => userKey(u) === key) || null;
}

function verifyUserPassword(user, password) {
  if (!user) return false;
  const hash = sha256Hex(`${user.salt || ''}::${password}`);
  return safeEqual(hash, user.hash || '');
}

// ---------------------------------------------------------------------------
// Token (HMAC) — dibawa klien di header x-db-token
// ---------------------------------------------------------------------------
function makeToken(db, user) {
  const key = userKey(user);
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${key}.${exp}`;
  const sig = crypto
    .createHmac('sha256', db._secret)
    .update(`${payload}.${user.hash}`)
    .digest('hex')
    .slice(0, 48);
  return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
}

function verifyToken(db, token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [key, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    const user = db.users.find((u) => userKey(u) === key);
    if (!user) return null;
    const expect = crypto
      .createHmac('sha256', db._secret)
      .update(`${key}.${expStr}.${user.hash}`)
      .digest('hex')
      .slice(0, 48);
    if (!safeEqual(sig, expect)) return null;
    return user;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Proyeksi database sesuai peran pemanggil
// ---------------------------------------------------------------------------
function projectFor(db, user) {
  const key = userKey(user);
  if (user.role === 'admin') return db;
  return {
    users: db.users.filter((u) => userKey(u) === key),
    profiles: db.profiles.filter((p) => String(p.ownerId || '').toLowerCase() === key),
  };
}

function publicUser(u) {
  const { id, username, role, expiresAt, createdAt } = u;
  return { id: u.id || userKey(u), username: u.username, role: u.role || 'user', expiresAt: u.expiresAt || null, createdAt: u.createdAt || null };
}

module.exports = {
  isConfigured,
  readDb,
  writeDb,
  getUserByName,
  verifyUserPassword,
  makeToken,
  verifyToken,
  projectFor,
  publicUser,
  makeSecret,
  sha256Hex,
  userKey,
};
