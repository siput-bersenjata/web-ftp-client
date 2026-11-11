const db = require('../_lib/db');
const { setCors } = require('../_lib/ftp');

/** Status storage untuk klien: blob (sinkron antar perangkat) atau local fallback. */
module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!db.isConfigured()) {
      return res.status(200).json({ storage: 'local', initialized: true });
    }
    const data = await db.readDb();
    const initialized = !!(data && data.users && data.users.length > 0);
    return res.status(200).json({ storage: 'blob', initialized });
  } catch (err) {
    console.error('[db-status]', err);
    // Jangan gagalkan klien — fallback ke penyimpanan lokal
    return res.status(200).json({ storage: 'local', initialized: true, degraded: true });
  }
};
