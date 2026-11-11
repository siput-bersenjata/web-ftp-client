const crypto = require('crypto');
const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Daftar akun baru (role 'user', masa aktif 30 hari secara default aplikasi —
 * admin dapat mengubahnya di Panel Admin). Menolak jika database belum ada.
 * Body: { username, password }
 */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { username, password } = body;
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
    return res.status(200).json({ ok: true, user: db.publicUser(user) });
  } catch (err) {
    console.error('[db-register]', err);
    return res.status(500).json({ error: 'Pendaftaran gagal: ' + (err.message || 'kesalahan server') });
  }
};
