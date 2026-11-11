const { withConnection, normalizeConfig, normalizePath, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cfg = normalizeConfig(body.config);
    const from = normalizePath(body.oldPath);
    const to = normalizePath(body.newPath);
    if (!from || !to) return res.status(400).json({ error: 'Path lama & baru wajib diisi.' });

    await withConnection(cfg, async (conn) => {
      if (conn.type === 'ftp') {
        await conn.client.rename(from, to);
      } else {
        await conn.client.rename(from, to);
      }
      return { success: true };
    });
    res.status(200).json({ success: true });
  } catch (err) {
    sendError(res, err, 500);
  }
};
