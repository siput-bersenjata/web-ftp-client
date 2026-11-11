const { withConnection, normalizeConfig, normalizePath, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cfg = normalizeConfig(body.config);
    const target = normalizePath(body.path);
    if (!target || target === '/') return res.status(400).json({ error: 'Path tidak valid untuk dihapus.' });

    await withConnection(cfg, async (conn) => {
      if (conn.type === 'ftp') {
        if (body.isDirectory) {
          await conn.client.removeDir(target);
        } else {
          await conn.client.remove(target);
        }
      } else {
        if (body.isDirectory) {
          // Hapus isi folder dulu (SFTP rmdir menolak folder yang berisi file)
          const entries = await conn.client.list(target);
          for (const entry of entries) {
            if (entry.name === '.' || entry.name === '..') continue;
            const childPath = target.replace(/\/+$/, '') + '/' + entry.name;
            if (entry.isDirectory) {
              await conn.client.rmdir(childPath, true);
            } else {
              await conn.client.delete(childPath);
            }
          }
          await conn.client.rmdir(target);
        } else {
          await conn.client.delete(target);
        }
      }
      return { success: true };
    });
    res.status(200).json({ success: true });
  } catch (err) {
    sendError(res, err, 500);
  }
};
