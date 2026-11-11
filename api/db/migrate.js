const crypto = require('crypto');
const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Migrasi satu kali: salin data dari penyimpanan lokal browser (localStorage)
 * ke database blob. Hanya berhasil jika database masih kosong — aman dipanggil
 * otomatis pada login pertama setelah fitur ini aktif.
 * Body: { database: { users, profiles } }
 */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const incoming = body.database || {};
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
    return res.status(200).json({ ok: true, migrated: { users: cleanUsers.length, profiles: cleanProfiles.length } });
  } catch (err) {
    console.error('[db-migrate]', err);
    return res.status(500).json({ error: 'Migrasi gagal: ' + (err.message || 'kesalahan server') });
  }
};
