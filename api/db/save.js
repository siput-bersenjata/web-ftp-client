const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/**
 * Simpan database dari klien.
 * - Admin  : database dipercaya sepenuhnya (tetap divalidasi minimal).
 * - User   : hanya profil miliknya sendiri yang dipakai; dokumen akun lain
 *            tidak bisa diubah, dan peran/masa aktif miliknya tidak bisa diubah.
 * Body: { token, database: { users, profiles } }
 */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { token, database } = body;
    if (!db.isConfigured()) return res.status(503).json({ error: 'Database blob belum dikonfigurasi.' });
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
        .map((u) => ({
          ...u,
          id: db.userKey(u),
          usernameLower: db.userKey(u),
        }));
      if (!users.some((u) => u.role === 'admin')) {
        return res.status(400).json({ error: 'Harus ada minimal satu akun admin.' });
      }
      const profiles = inProfiles
        .filter((p) => p && p.id && p.host)
        .map((p) => ({ ...p, ownerId: String(p.ownerId || '').toLowerCase() || db.userKey(user) }));
      merged = { ...data, users, profiles };
    } else {
      const selfKey = db.userKey(user);
      // Akun: tidak ada yang berubah untuk siapa pun.
      // Profil: sisakan milik orang lain + ambil versi klien untuk milik sendiri.
      const profiles = [
        ...data.profiles.filter((p) => String(p.ownerId || '').toLowerCase() !== selfKey),
        ...inProfiles
          .filter((p) => p && p.id && p.host && String(p.ownerId || '').toLowerCase() === selfKey)
          .map((p) => ({ ...p, ownerId: selfKey })),
      ];
      merged = { ...data, profiles };
    }

    await db.writeDb(merged);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[db-save]', err);
    return res.status(500).json({ error: 'Gagal menyimpan: ' + (err.message || 'kesalahan server') });
  }
};
