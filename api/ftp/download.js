/**
 * Download satu file dari FTP/SFTP ke browser klien.
 *   POST /api/ftp/download
 *   Body: { config, path }
 *   Response: file bytes (Content-Disposition: attachment)
 */
const { Writable } = require('stream');
const { guardRequest } = require('../_lib/security');
const { withConnection, normalizeConfig, normalizePath, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const user = await guardRequest(req, res, body);
    if (!user) return;
    const cfg = normalizeConfig(body.config);
    const target = normalizePath(body.path);
    if (!target || target === '/') return res.status(400).json({ error: 'Path tidak valid.' });

    const name = target.split('/').filter(Boolean).pop() || 'file';

    const buffer = await withConnection(cfg, async (conn) => {
      const chunks = [];
      const sink = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(chunk);
          cb();
        },
      });
      if (conn.type === 'ftp') {
        await conn.client.downloadTo(sink, target);
      } else {
        await conn.client.get(target, sink);
      }
      return Buffer.concat(chunks);
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    sendError(res, err, 500);
  }
};

module.exports.config = {
  api: {
    bodyParser: true,
    sizeLimit: '10mb',
  },
};
