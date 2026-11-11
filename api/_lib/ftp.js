/**
 * Helper FTP/SFTP stateless untuk Vercel Serverless Functions.
 *
 * Kredensial koneksi TIDAK pernah disimpan di server — dikirim dari klien
 * pada setiap request (HTTPS), dipakai untuk membuka koneksi sekali,
 * menjalankan operasi, lalu koneksi ditutup.
 *
 * Format config:
 * {
 *   host, port, protocol: 'ftp' | 'sftp',
 *   username, password,
 *   secure?: boolean (ftps / implicit TLS untuk ftp),
 *   secureVerbose?: boolean,
 * }
 */

const ftp = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');

function normalizeConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Konfigurasi koneksi FTP tidak valid.');
  }
  const protocol = (config.protocol || 'ftp').toLowerCase();
  if (!['ftp', 'sftp', 'ftps'].includes(protocol)) {
    throw new Error(`Protokol tidak didukung: ${protocol}`);
  }
  return {
    host: String(config.host || '').trim(),
    port: Number(config.port) || (protocol === 'sftp' ? 22 : 21),
    protocol: protocol === 'ftps' ? 'ftp' : protocol,
    secure: protocol === 'ftps' || !!config.secure,
    username: config.username || 'anonymous',
    password: config.password || '',
    homeFolder: config.homeFolder || '/',
  };
}

async function openFtp(cfg, log = () => {}) {
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  const conn = {
    type: 'ftp',
    client,
    async close() {
      try { client.close(); } catch {}
    },
  };
  await client.access({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    secure: cfg.secure,
    secureOptions: { rejectUnauthorized: false },
    passive: true,
  });
  log(`Terhubung ke ${cfg.host}:${cfg.port}`);
  return conn;
}

async function openSftp(cfg, log = () => {}) {
  const client = new SftpClient();
  const conn = {
    type: 'sftp',
    client,
    async close() {
      try { await client.end(); } catch {}
    },
  };
  await client.connect({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
    readyTimeout: 30000,
    tryKeyboard: false,
  });
  log(`Terhubung (SFTP) ke ${cfg.host}:${cfg.port}`);
  return conn;
}

/** Buka koneksi sekali, jalankan fn(conn), lalu tutup. */
async function withConnection(config, fn, log = () => {}) {
  const cfg = normalizeConfig(config);
  let conn;
  try {
    conn = cfg.protocol === 'sftp' ? await openSftp(cfg, log) : await openFtp(cfg, log);
    return await fn(conn, cfg);
  } finally {
    if (conn) {
      try { await conn.close(); } catch {}
    }
  }
}

function normalizePath(p) {
  const path = (p || '/').trim();
  if (!path.startsWith('/')) return '/' + path;
  return path;
}

/** Map item remote ke format standar yang dipakai FilePane. */
function mapItem(name, info, currentPath) {
  const isDir = !!(info.isDirectory || (info.stats && info.stats.isDirectory && info.stats.isDirectory()));
  const fullPath = currentPath === '/' ? `/${name}` : `${currentPath.replace(/\/+$/, '')}/${name}`;
  const size = isDir ? 0 : Number(info.size || (info.stats && info.stats.size) || 0);
  const mtime = info.modifiedAt || (info.stats && info.stats.mtime) || null;
  return {
    name,
    path: fullPath,
    size,
    isDirectory: isDir,
    type: isDir ? 'Folder' : 'File',
    modifiedDate: mtime ? new Date(mtime).toISOString() : '',
    attribute: isDir ? 'drwxr-xr-x' : '-rw-r--r--',
  };
}

function parentOf(p) {
  const path = normalizePath(p);
  if (path === '/') return null;
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

function sendError(res, err, status = 500) {
  const message = (err && err.message) || 'Operasi FTP gagal.';
  console.error('[ftp-api]', message);
  res.status(status).json({ error: message });
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ftp-config');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { withConnection, normalizeConfig, normalizePath, mapItem, parentOf, sendError, setCors };
