/**
 * Lapisan penyimpanan data (akun & profil FTP).
 *
 * - Mode 'firestore' : jika FIREBASE_CONFIG diisi → Firestore REST API (antar perangkat)
 * - Mode 'local'     : fallback localStorage (per perangkat)
 *
 * Interface dipakai oleh services/auth.js — jangan memakai langsung dari komponen.
 */
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

const LS_KEY = 'ftp_cloud_db_v1';

export const storageMode = FIREBASE_CONFIG ? 'firestore' : 'local';

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
// Public API
// ---------------------------------------------------------------------------

/** Ambil semua dokumen dari sebuah collection. */
export async function listCollection(name) {
  if (storageMode === 'local') {
    const db = readLocal();
    return db[name] || [];
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
  if (storageMode === 'local') {
    const db = readLocal();
    const list = db[name] || [];
    const idx = list.findIndex((d) => d.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...data, id };
    else list.push({ ...data, id });
    db[name] = list;
    writeLocal(db);
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
  if (storageMode === 'local') {
    const db = readLocal();
    db[name] = (db[name] || []).filter((d) => d.id !== id);
    writeLocal(db);
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
  if (storageMode === 'local') {
    const db = readLocal();
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

// ---------------------------------------------------------------------------
// Local fallback
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
