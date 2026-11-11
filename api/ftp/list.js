const { withConnection, normalizeConfig, normalizePath, mapItem, parentOf, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cfg = normalizeConfig(body.config);
    const remotePath = normalizePath(body.path || cfg.homeFolder || '/');

    const data = await withConnection(cfg, async (conn) => {
      let items = [];
      if (conn.type === 'ftp') {
        const list = await conn.client.list(remotePath);
        items = list.map((info) => mapItem(info.name, info, remotePath));
      } else {
        const list = await conn.client.list(remotePath);
        items = list.map((info) => mapItem(info.name, info, remotePath));
      }
      // Buang entri . dan ..
      items = items.filter((i) => i.name !== '.' && i.name !== '..');
      return {
        currentPath: remotePath,
        parentPath: parentOf(remotePath),
        items,
        totalItems: items.length,
      };
    });

    res.status(200).json(data);
  } catch (err) {
    sendError(res, err, 500);
  }
};
