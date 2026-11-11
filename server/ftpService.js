const ftp = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs-extra');
const { getFileType } = require('./localService');

function formatPermissions(perms, isDir) {
  if (!perms) return isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  if (typeof perms === 'string') return perms;
  if (typeof perms === 'object') {
    const numToRwx = (n) => {
      const num = typeof n === 'number' ? n : parseInt(n, 10) || 0;
      const r = (num & 4) ? 'r' : '-';
      const w = (num & 2) ? 'w' : '-';
      const x = (num & 1) ? 'x' : '-';
      return `${r}${w}${x}`;
    };
    const prefix = isDir ? 'd' : '-';
    const u = numToRwx(perms.user ?? 6);
    const g = numToRwx(perms.group ?? 4);
    const o = numToRwx(perms.world ?? perms.other ?? 4);
    return `${prefix}${u}${g}${o}`;
  }
}

function parseFtpDate(item) {
  if (!item) return new Date().toISOString();

  // 1. If basic-ftp or driver already provides a valid Date object with non-2001 year
  if (item.modifiedAt instanceof Date && !isNaN(item.modifiedAt.getTime())) {
    if (item.modifiedAt.getFullYear() !== 2001) {
      return item.modifiedAt.toISOString();
    }
  }

  // 2. Pick the raw string (rawModifiedAt or date)
  const raw = item.rawModifiedAt || item.date;
  if (!raw || typeof raw !== 'string') {
    return new Date().toISOString();
  }

  const trimmed = raw.trim().replace(/\s+/g, ' ');
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  // Case A: UNIX ls format with time: "May 13 12:42" or "Oct 15 15:11"
  const timeMatch = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const monStr = timeMatch[1].toLowerCase();
    const day = parseInt(timeMatch[2], 10);
    const hour = parseInt(timeMatch[3], 10);
    const min = parseInt(timeMatch[4], 10);

    if (months[monStr] !== undefined) {
      const now = new Date();
      const currentYear = now.getFullYear();
      let candidate = new Date(currentYear, months[monStr], day, hour, min, 0);

      // In unix ls, time without year means within past 6 months.
      // If candidate is > 2 days in the future, it must be from the previous year.
      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      if (candidate > twoDaysFromNow) {
        candidate = new Date(currentYear - 1, months[monStr], day, hour, min, 0);
      }
      return candidate.toISOString();
    }
  }

  // Case B: UNIX ls format with year: "Sep 18 2024" or "Apr 9 2025"
  const yearMatch = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (yearMatch) {
    const monStr = yearMatch[1].toLowerCase();
    const day = parseInt(yearMatch[2], 10);
    const year = parseInt(yearMatch[3], 10);

    if (months[monStr] !== undefined) {
      const candidate = new Date(year, months[monStr], day, 0, 0, 0);
      return candidate.toISOString();
    }
  }

  // Case C: Standard parse fallback (e.g. ISO or Windows format: "05-13-26 12:42PM")
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      if (d.getFullYear() === 2001 && !trimmed.includes('2001')) {
        d.setFullYear(new Date().getFullYear());
      }
      return d.toISOString();
    }
  } catch {}

  return new Date().toISOString();
}

class FTPService {
  constructor() {
    // Map of active client sessions: sessionId -> { client, type: 'ftp'|'sftp', config, currentPath, lastActive }
    this.sessions = new Map();
  }

  // Create a logger callback wrapper
  createLogger(sessionId, onLog) {
    return (message) => {
      if (typeof onLog === 'function') {
        onLog({
          sessionId,
          timestamp: new Date().toLocaleTimeString(),
          message: typeof message === 'string' ? message : JSON.stringify(message)
        });
      }
    };
  }

  async testConnection(config, onLog = () => {}) {
    const log = this.createLogger('test', onLog);
    log(`Connecting to ${config.host}:${config.port || 21} (${config.protocol || 'FTP'})...`);

    if (config.protocol === 'sftp') {
      const sftp = new SftpClient();
      try {
        await sftp.connect({
          host: config.host,
          port: config.port || 22,
          username: config.isAnonymous ? 'anonymous' : config.username,
          password: config.password || undefined,
          readyTimeout: 8000
        });
        log(`220 SFTP Authentication successful for ${config.username || 'anonymous'}`);
        await sftp.end();
        return { success: true, message: 'SFTP Connection successful!' };
      } catch (err) {
        log(`530 Connection failed: ${err.message}`);
        throw new Error(err.message);
      }
    } else {
      const client = new ftp.Client(8000);
      client.ftp.verbose = false;
      try {
        await client.access({
          host: config.host,
          port: config.port || 21,
          user: config.isAnonymous ? 'anonymous' : config.username,
          password: config.password || (config.isAnonymous ? 'anonymous@example.com' : ''),
          secure: config.protocol === 'ftps'
        });
        log(`230 User ${config.username || 'anonymous'} logged in successfully.`);
        client.close();
        return { success: true, message: 'FTP Connection successful!' };
      } catch (err) {
        log(`530 Connection error: ${err.message}`);
        throw new Error(err.message);
      }
    }
  }

  async connect(sessionId, config, onLog = () => {}, { skipDisconnect = false } = {}) {
    const log = this.createLogger(sessionId, onLog);
    log(`Initializing connection to ${config.host}...`);

    if (!skipDisconnect) {
      // Wait for any running transfer on this session before replacing it
      const existing = this.sessions.get(sessionId);
      if (existing && existing.lock) await existing.lock.catch(() => {});
      await this.disconnect(sessionId);
    }

    if (config.protocol === 'sftp') {
      const sftp = new SftpClient();
      try {
        await sftp.connect({
          host: config.host,
          port: config.port || 22,
          username: config.isAnonymous ? 'anonymous' : config.username,
          password: config.password || undefined,
          readyTimeout: 10000
        });
        log(`220 Connected to ${config.host} via SFTP.`);
        
        let initialPath = config.homeFolder || '/';
        try {
          await sftp.cwd();
        } catch {
          initialPath = '/';
        }

        const sessionData = {
          client: sftp,
          type: 'sftp',
          config,
          currentPath: initialPath,
          lastActive: Date.now()
        };
        this.sessions.set(sessionId, sessionData);

        return {
          sessionId,
          connected: true,
          type: 'sftp',
          currentPath: initialPath,
          host: config.host,
          username: config.username
        };
      } catch (err) {
        log(`530 SFTP Error: ${err.message}`);
        throw err;
      }
    } else {
      const client = new ftp.Client(15000);
      client.ftp.verbose = false;

      try {
        await client.access({
          host: config.host,
          port: config.port || 21,
          user: config.isAnonymous ? 'anonymous' : config.username,
          password: config.password || (config.isAnonymous ? 'anonymous@example.com' : ''),
          secure: config.protocol === 'ftps',
          pasv: config.passive !== false
        });

        log(`230 Logged on to ${config.host}`);
        let initialPath = '/';
        if (config.homeFolder && config.homeFolder !== '/') {
          try {
            await client.cd(config.homeFolder);
            initialPath = config.homeFolder;
            log(`250 CWD command successful. "${initialPath}" is current directory.`);
          } catch {
            initialPath = '/';
          }
        }

        const sessionData = {
          client,
          type: 'ftp',
          config,
          currentPath: initialPath,
          lastActive: Date.now()
        };
        this.sessions.set(sessionId, sessionData);

        return {
          sessionId,
          connected: true,
          type: 'ftp',
          currentPath: initialPath,
          host: config.host,
          username: config.username
        };
      } catch (err) {
        log(`Connection failed: ${err.message}`);
        throw err;
      }
    }
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found or disconnected.`);
    }
    session.lastActive = Date.now();
    return session;
  }

  // basic-ftp (and one SFTP channel) can only run one command at a time.
  // Every operation on a session goes through this chain so a LIST issued
  // while an upload is running waits instead of killing the connection.
  // A dropped connection (idle timeout, server reset) is reopened once.
  async withSession(sessionId, onLog, fn) {
    const session = this.getSession(sessionId);
    const prev = session.lock || Promise.resolve();
    let release;
    session.lock = new Promise(r => (release = r));
    try {
      await prev.catch(() => {});
      let current = this.sessions.get(sessionId) || session;
      if (current.type === 'ftp' && current.client.closed) {
        current = await this.reopen(sessionId, current, onLog);
      }
      try {
        return await fn(current);
      } catch (err) {
        if (!isConnectionError(err, current)) throw err;
        current = await this.reopen(sessionId, current, onLog);
        return await fn(current);
      }
    } finally {
      release();
    }
  }

  async reopen(sessionId, session, onLog) {
    const log = this.createLogger(sessionId, onLog);
    log('Connection lost, reconnecting...');
    const lock = session.lock;
    try { session.type === 'sftp' ? await session.client.end() : session.client.close(); } catch {}
    this.sessions.delete(sessionId);
    await this.connect(sessionId, session.config, onLog, { skipDisconnect: true });
    const fresh = this.sessions.get(sessionId);
    fresh.lock = lock;
    return fresh;
  }

  list(sessionId, remotePath, onLog = () => {}) {
    return this.withSession(sessionId, onLog, s => this._list(s, sessionId, remotePath, onLog));
  }

  async _list(session, sessionId, remotePath, onLog) {
    const log = this.createLogger(sessionId, onLog);

    const targetPath = remotePath || session.currentPath || '/';
    log(`LIST ${targetPath}`);

    if (session.type === 'sftp') {
      const list = await session.client.list(targetPath);
      const items = list.map(item => {
        const isDir = item.type === 'd';
        const fullItemPath = path.posix.join(targetPath, item.name);
        return {
          name: item.name,
          path: fullItemPath,
          isDirectory: isDir,
          size: isDir ? null : item.size,
          modifiedDate: new Date(item.modifyTime).toISOString(),
          type: getFileType(item.name, isDir),
          attribute: item.rights ? `${isDir ? 'd' : '-'}${item.rights.user || 'rw-'}${item.rights.group || 'r--'}${item.rights.other || 'r--'}` : (isDir ? 'drwxr-xr-x' : '-rw-r--r--')
        };
      });

      // Sort folders first
      items.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        return a.isDirectory ? -1 : 1;
      });

      session.currentPath = targetPath;
      log(`226 Directory send OK (${items.length} items).`);

      return {
        currentPath: targetPath,
        parentPath: targetPath === '/' ? null : path.posix.dirname(targetPath),
        items,
        totalItems: items.length
      };
    } else {
      await session.client.cd(targetPath);
      const list = await session.client.list();
      const items = list.map(item => {
        const isDir = item.isDirectory;
        const fullItemPath = path.posix.join(targetPath, item.name);
        const modDate = parseFtpDate(item);

        return {
          name: item.name,
          path: fullItemPath,
          isDirectory: isDir,
          size: isDir ? null : item.size,
          modifiedDate: modDate,
          type: getFileType(item.name, isDir),
          attribute: formatPermissions(item.permissions, isDir)
        };
      });

      items.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        return a.isDirectory ? -1 : 1;
      });

      session.currentPath = targetPath;
      log(`226 Transfer complete (${items.length} files/dirs).`);

      return {
        currentPath: targetPath,
        parentPath: targetPath === '/' ? null : path.posix.dirname(targetPath),
        items,
        totalItems: items.length
      };
    }
  }

  uploadFile(sessionId, localPath, remoteDirPath, onProgress = () => {}, onLog = () => {}, targetName = null) {
    return this.withSession(sessionId, onLog, s => this._upload(s, sessionId, localPath, remoteDirPath, onProgress, onLog, targetName));
  }

  async _upload(session, sessionId, localPath, remoteDirPath, onProgress, onLog, targetName = null) {
    const log = this.createLogger(sessionId, onLog);
    const name = targetName || path.basename(localPath);
    const remotePath = path.posix.join(remoteDirPath || '/', name);
    const stats = await fs.stat(localPath);
    const total = stats.isDirectory() ? await dirSize(localPath) : stats.size;
    const report = (done) => onProgress({
      transferred: done,
      total,
      percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100
    });

    log(stats.isDirectory() ? `MKD + STOR ${remotePath}/ (folder)` : `STOR ${remotePath}`);

    if (session.type === 'sftp') {
      if (stats.isDirectory()) {
        await session.client.uploadDir(localPath, remotePath);
      } else {
        await session.client.fastPut(localPath, remotePath, {
          step: (transferred) => report(transferred)
        });
      }
    } else {
      session.client.trackProgress(info => report(info.bytesOverall));
      try {
        if (stats.isDirectory()) {
          await session.client.ensureDir(remotePath);
          await session.client.uploadFromDir(localPath);
        } else {
          await session.client.uploadFrom(localPath, remotePath);
        }
      } finally {
        session.client.trackProgress();
      }
    }
    report(total);

    // Preserve modification time on remote file if available
    try {
      if (!stats.isDirectory() && stats.mtime) {
        if (session.type === 'ftp') {
          const d = stats.mtime;
          const pad = (n) => String(n).padStart(2, '0');
          const timeStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
          await session.client.send(`MDTM ${timeStr} ${remotePath}`);
        } else if (session.type === 'sftp') {
          const atimeSec = Math.floor(stats.atimeMs / 1000);
          const mtimeSec = Math.floor(stats.mtimeMs / 1000);
          await session.client.utimes(remotePath, atimeSec, mtimeSec);
        }
      }
    } catch {}

    log(`226 Upload complete: ${name}`);
    return { success: true, remotePath };
  }

  downloadFile(sessionId, remotePath, localDirPath, onProgress = () => {}, onLog = () => {}, opts = {}) {
    return this.withSession(sessionId, onLog, s => this._download(s, sessionId, remotePath, localDirPath, onProgress, onLog, opts));
  }

  async _download(session, sessionId, remotePath, localDirPath, onProgress, onLog, { isDirectory, size } = {}) {
    const log = this.createLogger(sessionId, onLog);
    const name = path.posix.basename(remotePath);
    const localPath = path.join(localDirPath, name);
    const total = size || 0;
    const report = (done) => onProgress({
      transferred: done,
      total,
      percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
    });

    log(isDirectory ? `RETR ${remotePath}/ (folder)` : `RETR ${remotePath}`);
    await fs.ensureDir(localDirPath);

    if (session.type === 'sftp') {
      if (isDirectory) {
        await session.client.downloadDir(remotePath, localPath);
      } else {
        await session.client.fastGet(remotePath, localPath, {
          step: (transferred) => report(transferred)
        });
      }
    } else {
      session.client.trackProgress(info => report(info.bytesOverall));
      try {
        if (isDirectory) {
          await session.client.downloadToDir(localPath, remotePath);
        } else {
          await session.client.downloadTo(localPath, remotePath);
        }
      } finally {
        session.client.trackProgress();
      }
    }
    onProgress({ transferred: total, total, percent: 100 });

    // Preserve original remote modification timestamp on downloaded local file
    if (opts && opts.modifiedDate) {
      try {
        const mDate = new Date(opts.modifiedDate);
        if (!isNaN(mDate.getTime())) {
          await fs.utimes(localPath, mDate, mDate);
        }
      } catch {}
    }

    log(`226 Download complete: ${name}`);
    return { success: true, localPath };
  }

  createDirectory(sessionId, parentRemotePath, folderName, onLog = () => {}) {
    return this.withSession(sessionId, onLog, s => this._mkdir(s, sessionId, parentRemotePath, folderName, onLog));
  }

  async _mkdir(session, sessionId, parentRemotePath, folderName, onLog) {
    const log = this.createLogger(sessionId, onLog);
    const newPath = path.posix.join(parentRemotePath, folderName);
    log(`MKD ${newPath}`);

    if (session.type === 'sftp') {
      await session.client.mkdir(newPath, true);
    } else {
      await session.client.ensureDir(newPath);
      await session.client.cd('/');
    }
    log(`257 "${newPath}" created successfully.`);
    return { success: true, path: newPath };
  }

  deleteItem(sessionId, remotePath, isDir, onLog = () => {}) {
    return this.withSession(sessionId, onLog, s => this._delete(s, sessionId, remotePath, isDir, onLog));
  }

  async _delete(session, sessionId, remotePath, isDir, onLog) {
    const log = this.createLogger(sessionId, onLog);
    log(isDir ? `RMD ${remotePath}` : `DELE ${remotePath}`);

    if (session.type === 'sftp') {
      if (isDir) {
        await session.client.rmdir(remotePath, true);
      } else {
        await session.client.delete(remotePath);
      }
    } else {
      if (isDir) {
        await session.client.removeDir(remotePath);
      } else {
        await session.client.remove(remotePath);
      }
    }
    log(`250 Item ${remotePath} removed.`);
    return { success: true };
  }

  renameItem(sessionId, oldPath, newPath, onLog = () => {}) {
    return this.withSession(sessionId, onLog, s => this._rename(s, sessionId, oldPath, newPath, onLog));
  }

  async _rename(session, sessionId, oldPath, newPath, onLog) {
    const log = this.createLogger(sessionId, onLog);
    log(`RNFR ${oldPath} -> RNTO ${newPath}`);

    if (session.type === 'sftp') {
      await session.client.rename(oldPath, newPath);
    } else {
      await session.client.rename(oldPath, newPath);
    }
    log(`250 Rename successful.`);
    return { success: true };
  }

  async disconnect(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        if (session.type === 'sftp') {
          await session.client.end();
        } else {
          session.client.close();
        }
      } catch (err) {
        console.error(`Error closing session ${sessionId}:`, err);
      }
      this.sessions.delete(sessionId);
    }
    return { success: true };
  }
}

function isConnectionError(err, session) {
  if (session.type === 'ftp' && session.client.closed) return true;
  const msg = String((err && (err.message || err.code)) || '');
  return /ECONNRESET|EPIPE|ETIMEDOUT|ECONNABORTED|closed|Not connected|No SFTP connection|socket hang up|421/i.test(msg);
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += await dirSize(full);
      else total += (await fs.stat(full)).size;
    } catch {}
  }
  return total;
}

module.exports = new FTPService();
