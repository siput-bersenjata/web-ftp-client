/**
 * Lapisan penyimpanan data (akun & profil FTP).
 *
 * - Mode 'vercel'    : produksi di Vercel — database bersama disimpan di Vercel Blob
 *                      (privat), diakses lewat /api/db/* dengan token HMAC.
 *                      Sinkron otomatis antar perangkat/browser.
 * - Mode 'firestore' : jika FIREBASE_CONFIG diisi → Firestore REST API (antar perangkat)
 * - Mode 'local'     : fallback localStorage (per perangkat, dipakai saat dev lokal)
 *
 * Interface dipakai oleh services/auth.js — jangan memakai langsung dari komponen.
 */
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

const LS_KEY = 'ftp_cloud_db_v1';
const SESSION_KEY = 'ftp_session_v1';

const isCloudRuntime = (() => {
  const h = window.location.hostname;
  return !['localhost', '127.0.0.1', '[::1]'].includes(h) && !h.endsWith('.local');
})();

// Mode statis untuk tampilan UI; mode efektif diputuskan setelah /api/db/status terbaca.
export const storageMode = FIREBASE_CONFIG ? 'firestore' : (isCloudRuntime ? 'vercel' : 'local');

let modeCache = null;        // hasil final: 'vercel' | 'local' | 'firestore'
let statusCache = null;      // { storage, initialized }
let cacheDb = null;          // mirror database di memori

// ---------------------------------------------------------------------------
// Helper localStorage
// ---------------------------------------------------------------------------
function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/** Isi localStorage apa adanya (dipakai migrasi ke database bersama). */
export function readLocalRaw() {
  return readLocal();
}

function getSessionToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && s.token ? s.token : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Status / mode efektif
// ---------------------------------------------------------------------------
export async function getStatus() {
  if (statusCache) return statusCache;
  if (storageMode === 'firestore') {
    statusCache = { storage: 'firestore', initialized: true };
    return statusCache;
  }
  if (storageMode === 'local') {
    statusCache = { storage: 'local', initialized: (readLocal().users || []).length > 0 };
    return statusCache;
  }
  try {
    const res = await fetch('/api/db/status', { cache: 'no-store' });
    if (!res.ok) throw new Error('status error');
    statusCache = await res.json();
  } catch {
    statusCache = { storage: 'local', initialized: (readLocal().users || []).length > 0, degraded: true };
  }
  modeCache = statusCache.storage === 'blob' ? 'vercel' : 'local';
  return statusCache;
}

async function effectiveMode() {
  if (modeCache) return modeCache;
  const st = await getStatus();
  modeCache = st.storage === 'blob' ? 'vercel' : 'local';
  return modeCache;
}

/** Paksa pembacaan ulang dari server pada operasi berikutnya. */
export function invalidateCache() {
  cacheDb = null;
}

// ---------------------------------------------------------------------------
// Mode 'vercel' — database bersama lewat /api/db/*
// ---------------------------------------------------------------------------
async function ensureRemoteCache() {
  const token = getSessionToken();
  if (!token) return readLocal(); // belum login (mis. butuh daftar akun dulu)
  if (cacheDb) return cacheDb;
  const res = await fetch('/api/db/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (res.status === 401 || res.status === 409) {
    // Token basi / database belum ada — mulai dari mirror lokal
    if (res.status === 401) localStorage.removeItem(SESSION_KEY);
    cacheDb = readLocal();
    return cacheDb;
  }
  if (!res.ok) throw new Error('Gagal memuat database dari server.');
  const data = await res.json();
  cacheDb = data.database || { users: [], profiles: [] };
  writeLocal(cacheDb);
  return cacheDb;
}

async function persistRemote() {
  writeLocal(cacheDb);
  const token = getSessionToken();
  if (!token) return; // belum login — cukup tersimpan lokal
  const res = await fetch('/api/db/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, database: cacheDb }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Gagal menyimpan ke database server.');
  }
}

// ---------------------------------------------------------------------------
// Helper Firestore REST
// ---------------------------------------------------------------------------
const FS_BASE = FIREBASE_CONFIG
  ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`
  : null;

function fsUrl(path = '', params = {}) {
  const qs = new URLSearchParams({ key: FIREBASE_CONFIG.apiKey, ...params });
  return `${FS_BASE}${path}?${qs.toString()}`;
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function fromFsValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  return undefined;
}

function toFsFields(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFsValue(v);
  return fields;
}

function fromFsDoc(doc) {
  const data = { id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) {
    const parsed = fromFsValue(v);
    if (parsed !== undefined) data[k] = parsed;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Mode-aware helpers
// ---------------------------------------------------------------------------
async function listLocalish(name) {
  const m = await effectiveMode();
  const db = m === 'vercel' ? await ensureRemoteCache() : readLocal();
  return db[name] || [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Ambil semua dokumen dari sebuah collection. */
export async function listCollection(name) {
  const m = await effectiveMode();
  if (m !== 'firestore') {
    return listLocalish(name);
  }
  try {
    const res = await fetch(fsUrl(`/${encodeURIComponent(name)}`), { method: 'GET' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Firestore error ${res.status}`);
    }
    const data = await res.json();
    return (data.documents || []).map(fromFsDoc);
  } catch (err) {
    console.error('listCollection error:', err);
    throw err;
  }
}

/** Simpan (upsert) satu dokumen dengan ID tertentu. */
export async function setDoc(name, id, data) {
  const m = await effectiveMode();
  if (m !== 'firestore') {
    const db = m === 'vercel' ? await ensureRemoteCache() : readLocal();
    const list = db[name] || [];
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...data, id };
    else list.push({ ...data, id });
    db[name] = list;
    if (m === 'vercel') {
      cacheDb = db;
      await persistRemote();
    } else {
      writeLocal(db);
    }
    return { ...data, id };
  }
  const res = await fetch(fsUrl(`/${encodeURIComponent(name)}/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Firestore error ${res.status}`);
  }
  return fromFsDoc(await res.json());
}

/** Hapus satu dokumen berdasarkan ID. */
export async function deleteDoc(name, id) {
  const m = await effectiveMode();
  if (m !== 'firestore') {
    const db = m === 'vercel' ? await ensureRemoteCache() : readLocal();
    db[name] = (db[name] || []).filter((d) => d.id !== id);
    if (m === 'vercel') {
      cacheDb = db;
      await persistRemote();
    } else {
      writeLocal(db);
    }
    return true;
  }
  const res = await fetch(fsUrl(`/${encodeURIComponent(name)}/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Firestore error ${res.status}`);
  }
  return true;
}

/** Ambil satu dokumen, atau null jika tidak ada. */
export async function getDoc(name, id) {
  const m = await effectiveMode();
  if (m !== 'firestore') {
    const db = m === 'vercel' ? await ensureRemoteCache() : readLocal();
    return (db[name] || []).find((d) => d.id === id) || null;
  }
  const res = await fetch(fsUrl(`/${encodeURIComponent(name)}/${encodeURIComponent(id)}`), {
    method: 'GET',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Firestore error ${res.status}`);
  }
  return fromFsDoc(await res.json());
}
