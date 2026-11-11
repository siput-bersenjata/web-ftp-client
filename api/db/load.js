const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Muat ulang database dengan token (dipakai setiap aplikasi dibuka).
 * Body: { token } → { user, database }
 */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { token } = body;
    if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });

    const data = await db.readDb();
    if (!data) return res.status(409).json({ error: 'Database belum diinisialisasi.' });

    const user = db.verifyToken(data, token);
    if (!user) return res.status(401).json({ error: 'Sesi tidak valid atau sudah kedaluwarsa — silakan login kembali.' });

    return res.status(200).json({
      user: db.publicUser(user),
      database: db.projectFor(data, user),
    });
  } catch (err) {
    console.error('[db-load]', err);
    return res.status(500).json({ error: 'Gagal memuat data: ' + (err.message || 'kesalahan server') });
  }
};
