const crypto = require('crypto');
const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Setup awal via server (dipakai saat database benar-benar kosong):
 * membuat akun admin pertama. Kredensial tidak ditulis di kode;
 * password di-hash di sisi server.
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
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[db-setup]', err);
    return res.status(500).json({ error: 'Setup gagal: ' + (err.message || 'kesalahan server') });
  }
};
