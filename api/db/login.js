const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Login / ambil proyeksi database sesuai peran.
 * Body: { username, password }
 * → { token, user, database }
 */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { username, password } = body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });

    const data = await db.readDb();
    if (!data || data.users.length === 0) {
      return res.status(404).json({ empty: true, error: 'Database belum diinisialisasi.' });
    }

    const user = db.getUserByName(data, username);
    if (!user) return res.status(401).json({ error: 'Username tidak ditemukan.' });
    if (!db.verifyUserPassword(user, password)) return res.status(401).json({ error: 'Password salah.' });

    if (user.expiresAt) {
      const exp = new Date(user.expiresAt).getTime();
      if (!Number.isNaN(exp) && exp < Date.now()) {
        return res.status(403).json({ error: `Akun kedaluwarsa sejak ${new Date(user.expiresAt).toLocaleString('id-ID')}. Hubungi admin.` });
      }
    }

    const token = db.makeToken(data, user);
    return res.status(200).json({
      token,
      user: db.publicUser(user),
      database: db.projectFor(data, user),
    });
  } catch (err) {
    console.error('[db-login]', err);
    return res.status(500).json({ error: 'Login gagal: ' + (err.message || 'kesalahan server') });
  }
};
