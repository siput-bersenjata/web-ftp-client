const { withConnection, normalizeConfig, sendError, setCors } = require('../_lib/ftp');

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const cfg = normalizeConfig(body.config);
    await withConnection(cfg, async (conn) => {
      let greeting = '';
      if (conn.type === 'ftp' && conn.client.ftp) {
        // basic-ftp menyimpan banner server pada welcome message
        greeting = (conn.client.ftp.availableExtensions || []).join(', ');
      }
      res.status(200).json({
        success: true,
        protocol: conn.type,
        greeting: greeting || 'Terhubung',
      });
    });
  } catch (err) {
    sendError(res, err, 400);
  }
};
