const API_BASE = '/api';

// ---------------------------------------------------------------------------
// MODE CLOUD (Vercel Serverless) — FTP stateless, config dikirim per-request
// ---------------------------------------------------------------------------
export const isCloudMode = (() => {
  const h = window.location.hostname;
  return !['localhost', '127.0.0.1', '[::1]'].includes(h) && !h.endsWith('.local');
})();

async function cloudCall(endpoint, payload) {
  const res = await fetch(`/api/ftp/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Upload satu file via XHR agar bisa memantau progress. */
export function cloudUpload(config, destinationPath, file, onProgress = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/ftp/upload?dest=${encodeURIComponent(destinationPath || '/')}&name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('x-ftp-config', btoa(unescape(encodeURIComponent(JSON.stringify(config)))));
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({ success: true }); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Koneksi ke server upload terputus.')));
    xhr.send(file);
  });
}

/** Download satu file dari FTP ke browser. */
export async function cloudDownload(config, remotePath) {
  const res = await fetch('/api/ftp/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, path: remotePath })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const name = remotePath.split('/').filter(Boolean).pop() || 'file';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Status + statistik penggunaan website (tanpa data sensitif). */
export async function dbStats() {
  try {
    const res = await fetch('/api/db?action=status', { cache: 'no-store' });
    if (!res.ok) throw new Error('status error');
    const data = await res.json();
    return { logins: Number(data.logins) || 0 };
  } catch {
    return { logins: 0 };
  }
}

/** Heartbeat kehadiran — dipanggil berkala oleh aplikasi & layar login. */
export async function dbHeartbeat() {
  let token = null;
  for (const [key, storage] of [['ftp_session_v1', localStorage], ['ftp_session_tab_v1', sessionStorage]]) {
    try {
      const s = JSON.parse(storage.getItem(key) || 'null');
      if (s && s.token) { token = s.token; break; }
    } catch { /* abaikan */ }
  }
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'beat', token })
    });
    const data = await res.json().catch(() => ({}));
    return Number(data.active) || 0;
  } catch {
    return 0;
  }
}

export const api = {
  // --- Cloud (serverless) FTP operations: config dikirim per-request ---
  async ftpList(config, path) {
    return cloudCall('list', { config, path: path || '/' });
  },
  async ftpMkdir(config, parentPath, name) {
    return cloudCall('mkdir', { config, parentPath, name });
  },
  async ftpDelete(config, path, isDir) {
    return cloudCall('delete', { config, path, isDir });
  },
  async ftpRename(config, oldPath, newPath) {
    return cloudCall('rename', { config, oldPath, newPath });
  },

  // Profiles
  async getProfiles() {
    const res = await fetch(`${API_BASE}/profiles`);
    if (!res.ok) throw new Error('Failed to fetch profiles');
    return res.json();
  },

  async saveProfile(profile) {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save profile');
    }
    return res.json();
  },

  async deleteProfile(id) {
    const res = await fetch(`${API_BASE}/profiles/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete profile');
    return res.json();
  },

  // Local Files
  async listLocal(path) {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetch(`${API_BASE}/local/list${query}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to list local directory');
    }
    return res.json();
  },

  async getLocalShortcuts() {
    const res = await fetch(`${API_BASE}/local/shortcuts`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  },

  async createLocalFolder(parentPath, name) {
    const res = await fetch(`${API_BASE}/local/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath, name })
    });
    if (!res.ok) throw new Error('Failed to create folder');
    return res.json();
  },

  async deleteLocalItem(path) {
    const res = await fetch(`${API_BASE}/local/item`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error('Failed to delete item');
    return res.json();
  },

  async renameLocalItem(oldPath, newPath) {
    const res = await fetch(`${API_BASE}/local/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath })
    });
    if (!res.ok) throw new Error('Gagal mengganti nama file lokal');
    return res.json();
  },

  // FTP
  async testFtpConnection(config) {
    const res = await fetch(`${API_BASE}/ftp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Serverless (cloud): membaca body.config; server lokal: memakai body sebagai config langsung
      body: JSON.stringify(isCloudMode ? { config } : config)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection test failed');
    return data;
  },

  async connectFtp(sessionId, config) {
    const res = await fetch(`${API_BASE}/ftp/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, config })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection failed');
    return data;
  },

  async listFtp(sessionId, path) {
    const query = new URLSearchParams({ sessionId, path: path || '' });
    const res = await fetch(`${API_BASE}/ftp/list?${query.toString()}&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to list remote folder');
    return data;
  },

  async createFtpFolder(sessionId, parentPath, name) {
    const res = await fetch(`${API_BASE}/ftp/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, parentPath, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create remote directory');
    return data;
  },

  async deleteFtpItem(sessionId, path, isDir) {
    const res = await fetch(`${API_BASE}/ftp/item`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, path, isDir })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete remote item');
    return data;
  },

  async renameFtpItem(sessionId, oldPath, newPath) {
    const res = await fetch(`${API_BASE}/ftp/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, oldPath, newPath })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengganti nama file remote');
    return data;
  },

  async disconnectFtp(sessionId) {
    const res = await fetch(`${API_BASE}/ftp/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    return res.json();
  },

  // Direct upload from browser via FormData (file input or drag from desktop)
  async uploadDirect(sessionId, destinationPath, files) {
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('destinationPath', destinationPath || '/');
    const meta = [];
    for (const file of files) {
      formData.append('files', file);
      meta.push({ name: file.name, lastModified: file.lastModified });
    }
    formData.append('fileMeta', JSON.stringify(meta));
    const res = await fetch(`${API_BASE}/ftp/upload-direct`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Gagal mengunggah file langsung');
    return data;
  },

  // Transfer Queue
  async getQueue() {
    const res = await fetch(`${API_BASE}/queue`, { cache: 'no-store' });
    return res.json();
  },

  async addToQueue(tasks) {
    const res = await fetch(`${API_BASE}/queue/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(tasks) ? { tasks } : tasks)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  async removeFromQueue(id) {
    const res = await fetch(`${API_BASE}/queue/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async moveQueueItem(id, direction) {
    const res = await fetch(`${API_BASE}/queue/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, direction })
    });
    return res.json();
  },

  async clearFinishedQueue() {
    const res = await fetch(`${API_BASE}/queue/clear-finished`, {
      method: 'POST'
    });
    return res.json();
  }
};
