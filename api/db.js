/**
 * Endpoint tunggal database bersama (Vercel Hobby: hemat serverless function).
 * Routing berdasarkan field `action` di body (POST) atau query string (GET status).
 *
 * POST { action: 'status'   }                    → { storage, initialized }
 * POST { action: 'login',    username, password} → { token, user, database }
 * POST { action: 'load',     token             } → { user, database }
 * POST { action: 'save',     token, database   } → { ok: true }
 * POST { action: 'setup',    username, password} → { ok: true }   (database kosong)
 * POST { action: 'register', username, password} → { ok, user }
 * POST { action: 'migrate',  database           } → { ok, migrated } (database kosong)
 */
const crypto = require('crypto');
const db = require('./_lib/db');
const { setCors } = require('./_lib/ftp');

function body(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function ok(res, obj) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(obj);
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  let action;
  try {
    if (req.method === 'GET') action = (req.query && req.query.action) || 'status';
    else if (req.method === 'POST') action = body(req).action;
    else return res.status(405).json({ error: 'Method not allowed' });

    const b = req.method === 'POST' ? body(req) : {};

    switch (action) {
      case 'beat': {
        // Heartbeat kehadiran: hitung user aktif dalam 5 menit terakhir.
        // Tanpa token → hanya balas jumlah (tidak membocorkan nama user).
        if (!db.isConfigured()) return ok(res, { active: 0 });
        const data = await db.readDb();
        if (!data) return ok(res, { active: 0 });
        const now = Date.now();
        const TTL = 5 * 60 * 1000;
        data.active = (Array.isArray(data.active) ? data.active : []).filter(
          (a) => a && a.ts && now - new Date(a.ts).getTime() < TTL
        );
        const token = b.token;
        if (token) {
          const user = db.verifyToken(data, token);
          if (user) {
            const key = db.userKey(user);
            data.active = data.active.filter((a) => a.key !== key);
            data.active.push({ key, name: user.username, role: user.role || 'user', ts: now });
            if (data.active.length > 500) data.active = data.active.slice(-500);
            await db.writeDb(data);
          }
        }
        return ok(res, { active: data.active.length });
      }

      case 'status': {
        if (!db.isConfigured()) return ok(res, { storage: 'local', initialized: true, logins: 0 });
        const data = await db.readDb();
        const initialized = !!(data && data.users && data.users.length > 0);
        return ok(res, { storage: 'blob', initialized, logins: (data && data.stats && data.stats.loginCount) || 0 });
      }

      case 'setup': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const { username, password } = b;
        if (!username || !password || String(password).length < 4) {
          return res.status(400).json({ error: 'Password admin minimal 4 karakter.' });
        }
        const existing = await db.readDb();
        if (existing && existing.users.length > 0) {
          return res.status(409).json({ error: 'Database sudah diinisialisasi.' });
        }
        const key = String(username).trim().toLowerCase();
        const salt = crypto.randomBytes(12).toString('hex');
        const hash = db.sha256Hex(`${salt}::${password}`);
        await db.writeDb({
          _secret: crypto.randomBytes(32).toString('hex'),
          users: [{
            id: key,
            username: String(username).trim(),
            usernameLower: key,
            salt,
            hash,
            role: 'admin',
            expiresAt: null,
            createdAt: new Date().toISOString(),
          }],
          profiles: [],
        });
        return ok(res, { ok: true });
      }

      case 'register': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const { username, password } = b;
        const clean = String(username || '').trim();
        if (!clean || clean.includes('/') || clean.length > 40) {
          return res.status(400).json({ error: 'Username tidak valid.' });
        }
        if (!password || String(password).length < 4) {
          return res.status(400).json({ error: 'Password minimal 4 karakter.' });
        }
        const data = await db.readDb();
        if (!data) return res.status(409).json({ error: 'Database belum diinisialisasi — gunakan Setup Awal.' });
        const key = clean.toLowerCase();
        if (data.users.some((u) => db.userKey(u) === key)) {
          return res.status(409).json({ error: `Username "${clean}" sudah dipakai.` });
        }
        const salt = crypto.randomBytes(12).toString('hex');
        const hash = db.sha256Hex(`${salt}::${password}`);
        const user = {
          id: key,
          username: clean,
          usernameLower: key,
          salt,
          hash,
          role: 'user',
          expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 hari default
          createdAt: new Date().toISOString(),
        };
        data.users.push(user);
        await db.writeDb(data);
        return ok(res, { ok: true, user: db.publicUser(user) });
      }

      case 'login': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const { username, password } = b;
        if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });
        const data = await db.readDb();
        if (!data || data.users.length === 0) {
          return res.status(404).json({ empty: true, error: 'Database belum diinisialisasi.' });
        }
        const user = db.getUserByName(data, username);
        if (!user) return res.status(401).json({ error: 'Username tidak ditemukan.' });
        if (!db.verifyUserPassword(user, password)) return res.status(401).json({ error: 'Password salah.' });

        // Hitung setiap login sukses sebagai 1 penggunaan website
        data.stats.loginCount = (data.stats.loginCount || 0) + 1;
        await db.writeDb(data);
        if (user.expiresAt) {
          const exp = new Date(user.expiresAt).getTime();
          if (!Number.isNaN(exp) && exp < Date.now()) {
            return res.status(403).json({ error: `Akun kedaluwarsa sejak ${new Date(user.expiresAt).toLocaleString('id-ID')}. Hubungi admin.` });
          }
        }
        const token = db.makeToken(data, user);
        return ok(res, { token, user: db.publicUser(user), database: db.projectFor(data, user) });
      }

      case 'load': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const { token } = b;
        const data = await db.readDb();
        if (!data) return res.status(409).json({ error: 'Database belum diinisialisasi.' });
        const user = db.verifyToken(data, token);
        if (!user) return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa — silakan login kembali.' });
        return ok(res, { user: db.publicUser(user), database: db.projectFor(data, user) });
      }

      case 'save': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const { token, database } = b;
        if (!database || typeof database !== 'object') return res.status(400).json({ error: 'Payload database tidak valid.' });
        const data = await db.readDb();
        if (!data) return res.status(409).json({ error: 'Database belum diinisialisasi.' });
        const user = db.verifyToken(data, token);
        if (!user) return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa — silakan login kembali.' });

        const inUsers = Array.isArray(database.users) ? database.users : [];
        const inProfiles = Array.isArray(database.profiles) ? database.profiles : [];
        if (inUsers.length > 1000 || inProfiles.length > 1000) {
          return res.status(400).json({ error: 'Database terlalu besar.' });
        }

        let merged;
        if (user.role === 'admin') {
          const users = inUsers
            .filter((u) => u && u.username)
            .map((u) => ({ ...u, id: db.userKey(u), usernameLower: db.userKey(u) }));
          if (!users.some((u) => u.role === 'admin')) {
            return res.status(400).json({ error: 'Harus ada minimal satu akun admin.' });
          }
          const profiles = inProfiles
            .filter((p) => p && p.id && p.host)
            .map((p) => ({ ...p, ownerId: String(p.ownerId || '').toLowerCase() || db.userKey(user) }));
          merged = { ...data, users, profiles };
        } else {
          const selfKey = db.userKey(user);
          const profiles = [
            ...data.profiles.filter((p) => String(p.ownerId || '').toLowerCase() !== selfKey),
            ...inProfiles
              .filter((p) => p && p.id && p.host && String(p.ownerId || '').toLowerCase() === selfKey)
              .map((p) => ({ ...p, ownerId: selfKey })),
          ];
          merged = { ...data, profiles };
        }
        await db.writeDb(merged);
        return ok(res, { ok: true });
      }

      case 'migrate': {
        if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
        const incoming = b.database || {};
        const users = Array.isArray(incoming.users) ? incoming.users : [];
        const profiles = Array.isArray(incoming.profiles) ? incoming.profiles : [];
        const existing = await db.readDb();
        if (existing && existing.users.length > 0) {
          return res.status(409).json({ error: 'Database sudah berisi data — migrasi dibatalkan.' });
        }
        const cleanUsers = users
          .filter((u) => u && u.username && u.hash && u.salt)
          .map((u) => ({
            ...u,
            id: db.userKey(u),
            usernameLower: db.userKey(u),
            role: u.role === 'admin' ? 'admin' : (u.role === 'gate' ? 'gate' : 'user'),
          }));
        if (!cleanUsers.some((u) => u.role === 'admin')) {
          return res.status(400).json({ error: 'Data lokal tidak memiliki akun admin — migrasi dibatalkan.' });
        }
        const cleanProfiles = profiles
          .filter((p) => p && p.id && p.host)
          .map((p) => ({ ...p, ownerId: String(p.ownerId || '').toLowerCase() || 'admin' }));
        await db.writeDb({
          _secret: crypto.randomBytes(32).toString('hex'),
          users: cleanUsers,
          profiles: cleanProfiles,
        });
        return ok(res, { ok: true, migrated: { users: cleanUsers.length, profiles: cleanProfiles.length } });
      }

      default:
        return res.status(400).json({ error: `Action tidak dikenal: ${action}` });
    }
  } catch (err) {
    console.error('[db]', action, err);
    return res.status(500).json({ error: 'Kesalahan server: ' + (err.message || 'unknown') });
  }
};
