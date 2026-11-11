/**
 * Upload satu file ke FTP/SFTP.
 *
 * Cara pakai (dari klien):
 *   POST /api/ftp/upload?dest=/tujuan&name=namafile.txt
 *   Header: x-ftp-config: <base64(JSON config)>
 *   Body  : raw bytes file
 *
 * Catatan: Vercel membatasi body request ~4.5MB per request,
 * jadi file besar sebaiknya dipecah atau di-upload dari koneksi lokal.
 */
const { Readable } = require('stream');
const { guardRequest } = require('../_lib/security');
const { withConnection, normalizeConfig, normalizePath, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await guardRequest(req, res, null);
  if (!user) return;
  try {
    const cfgHeader = req.headers['x-ftp-config'];
    if (!cfgHeader) return res.status(400).json({ error: 'Header x-ftp-config wajib ada.' });
    const config = JSON.parse(Buffer.from(cfgHeader, 'base64').toString('utf8'));
    const cfg = normalizeConfig(config);

    const name = String(req.query.name || 'unnamed').replace(/[\\/:*?"<>|]/g, '_');
    const dest = normalizePath(req.query.dest || '/');
    const target = dest === '/' ? `/${name}` : `${dest.replace(/\/+$/, '')}/${name}`;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) return res.status(400).json({ error: 'Body file kosong.' });

    await withConnection(cfg, async (conn) => {
      if (conn.type === 'ftp') {
        await conn.client.uploadFrom(Readable.from(buffer), target);
      } else {
        await conn.client.put(buffer, target);
      }
      return { success: true, path: target, size: buffer.length };
    });

    res.status(200).json({ success: true, path: target, size: buffer.length, name });
  } catch (err) {
    sendError(res, err, 500);
  }
};

// Vercel: matikan body parser bawaan agar byte mentah diterima utuh
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
