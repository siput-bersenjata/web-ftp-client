const { withConnection, normalizeConfig, normalizePath, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cfg = normalizeConfig(body.config);
    const parent = normalizePath(body.parentPath || '/');
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nama folder wajib diisi.' });
    if (/[\\/]/.test(name)) return res.status(400).json({ error: 'Nama folder tidak boleh mengandung / atau \\' });

    const target = parent === '/' ? `/${name}` : `${parent.replace(/\/+$/, '')}/${name}`;
    await withConnection(cfg, async (conn) => {
      if (conn.type === 'ftp') {
        await conn.client.ensureDir(target);
      } else {
        await conn.client.mkdir(target, true);
      }
      return { success: true, path: target };
    });
    res.status(200).json({ success: true, path: target });
  } catch (err) {
    sendError(res, err, 500);
  }
};
