/**
 * Sistem autentikasi & manajemen akun.
 *
 * Akun disimpan di collection `users` (Firestore atau localStorage).
 * - Password disimpan sebagai SHA-256(salt + password) — tidak pernah plaintext.
 * - Role: 'admin' (kelola akun) | 'gate' (akun bersama untuk akses aplikasi) | 'user' (akun terdaftar).
 * - expiresAt: ISO date; null = permanen. Akun kedaluwarsa tidak bisa login.
 *
 * PENTING (setup awal): gunakan initializeIfEmpty() dari layar Setup
 * untuk membuat akun admin & gate pertama. Kredensial TIDAK ditulis di kode
 * agar repo publik tetap aman.
 */
import * as store from './store';
import { storageMode } from './store';
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

const USERS = 'users';
const SESSION_KEY = 'ftp_session_v1';          // localStorage — diingat 30 hari
const SESSION_TAB_KEY = 'ftp_session_tab_v1';  // sessionStorage — hanya selama tab terbuka
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

function readSessionFrom(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Sesi terlalu tua — anggap kedaluwarsa
    if (session.loggedAt) {
      const age = Date.now() - new Date(session.loggedAt).getTime();
      if (Number.isFinite(age) && age > SESSION_MAX_AGE_MS) {
        storage.removeItem(key);
        return null;
      }
    }
    // Sesi tanpa token pada mode cloud (dibuat sebelum fitur database bersama) tidak bisa
    // membaca/menyimpan — paksa login ulang sekali.
    if (isCloudRuntime && !FIREBASE_CONFIG && !session.token) {
      storage.removeItem(key);
      return null;
    }
    // Sesi admin/gate (expiresAt null) selalu aktif; user cek kedaluwarsa di sini
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      storage.removeItem(key);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password hashing (Web Crypto)
// ---------------------------------------------------------------------------
async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function makeSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Mode database bersama (Vercel Blob) — lewat /api/db/*
// ---------------------------------------------------------------------------
const isCloudRuntime = (() => {
  const h = window.location.hostname;
  return !['localhost', '127.0.0.1', '[::1]'].includes(h) && !h.endsWith('.local');
})();

async function sharedStorageReady() {
  if (!isCloudRuntime) return false;
  const st = await store.getStatus();
  return st.storage === 'blob';
}

export function getCurrentUser() {
  // Cek sesi persisten (localStorage) lebih dulu, lalu sesi tab (sessionStorage)
  const persistent = readSessionFrom(localStorage, SESSION_KEY);
  if (persistent) return persistent;
  return readSessionFrom(sessionStorage, SESSION_TAB_KEY);
}

export function saveSession(user, token, rememberMe = true) {
  const session = {
    id: user.id,
    username: user.username,
    role: user.role,
    expiresAt: user.expiresAt || null,
    token: token || user.token || null,
    loggedAt: new Date().toISOString(),
  };
  if (rememberMe) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.removeItem(SESSION_TAB_KEY);
  } else {
    sessionStorage.setItem(SESSION_TAB_KEY, JSON.stringify(session));
    localStorage.removeItem(SESSION_KEY);
  }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_TAB_KEY);
  store.invalidateCache();
}

// ---------------------------------------------------------------------------
// Akun
// ---------------------------------------------------------------------------
export async function isInitialized() {
  const shared = await sharedStorageReady();
  if (shared) {
    const st = await store.getStatus();
    if (st.initialized) return true;
    // Database server kosong tapi perangkat ini punya data lokal → arahkan ke login
    // (login akan memigrasikannya secara otomatis)
    const local = store.readLocalRaw();
    return (local.users || []).length > 0;
  }
  const users = await store.listCollection(USERS);
  return users.length > 0;
}

/**
 * Setup awal: membuat akun admin pertama jika database masih kosong.
 * Dipanggil dari layar Setup (hanya muncul saat database kosong).
 */
export async function initializeIfEmpty({ adminUsername, adminPassword }) {
  const shared = await sharedStorageReady();
  if (shared) {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup', username: adminUsername, password: adminPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Setup gagal.');
    store.invalidateCache();
    return { created: 1, names: [adminUsername] };
  }
  const users = await store.listCollection(USERS);
  if (users.length > 0) return { created: 0 };

  const created = [];
  if (adminUsername && adminPassword) {
    await createUserInternal({
      username: adminUsername.trim(),
      password: adminPassword,
      role: 'admin',
      expiresAt: null,
    });
    created.push(adminUsername.trim());
  }
  return { created: created.length, names: created };
}

async function createUserInternal({ username, password, role, expiresAt, durationDays = null }) {
  const clean = String(username).trim();
  if (!clean || clean.includes('/')) throw new Error('Username tidak valid.');
  if (!password || password.length < 4) throw new Error('Password minimal 4 karakter.');

  const id = clean.toLowerCase();
  const existing = await store.getDoc(USERS, id);
  if (existing) throw new Error(`Username "${clean}" sudah dipakai.`);

  const salt = makeSalt();
  const hash = await hashPassword(salt, password);
  const user = {
    username: clean,
    usernameLower: id,
    salt,
    hash,
    role: role || 'user',
    expiresAt: expiresAt || (durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null),
    createdAt: new Date().toISOString(),
  };
  await store.setDoc(USERS, id, user);
  return user;
}

/** Daftar akun baru (tombol "Daftar" di layar login). */
export async function register({ username, password }) {
  const shared = await sharedStorageReady();
  if (shared) {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Pendaftaran gagal.');
    store.invalidateCache();
    return data.user;
  }
  return createUserInternal({ username, password, role: 'user', durationDays: 30 });
}

/** Login — memvalidasi kredensial & masa aktif akun. */
export async function login({ username, password, rememberMe = true }) {
  const clean = String(username).trim();
  const shared = await sharedStorageReady();
  if (shared) {
    // Migrasi otomatis dari penyimpanan lokal perangkat ini (jika database masih kosong)
    let st = await store.getStatus();
    if (!st.initialized) {
      const local = store.readLocalRaw();
      if ((local.users || []).length > 0) {
        const mig = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'migrate', database: local }),
        });
        const migData = await mig.json().catch(() => ({}));
        if (!mig.ok) throw new Error(migData.error || 'Migrasi data lokal gagal.');
        store.invalidateCache();
      }
    }

    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: clean, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || (data.empty ? 'Belum ada akun — gunakan Setup Awal.' : 'Login gagal.'));
    }
    store.invalidateCache();
    saveSession({ ...data.user, token: data.token }, data.token, !!rememberMe);
    return data.user;
  }

  const id = clean.toLowerCase();
  const user = await store.getDoc(USERS, id);
  if (!user) throw new Error('Username tidak ditemukan.');

  const hash = await hashPassword(user.salt || '', password);
  if (hash !== user.hash) throw new Error('Password salah.');

  if (user.expiresAt) {
    const exp = new Date(user.expiresAt).getTime();
    if (!isNaN(exp) && exp < Date.now()) {
      throw new Error(`Akun kedaluwarsa sejak ${new Date(user.expiresAt).toLocaleString('id-ID')}. Hubungi admin.`);
    }
  }

  saveSession(user, undefined, !!rememberMe);
  return user;
}

/** Semua akun — hanya boleh dipakai admin. */
export async function listUsers() {
  const users = await store.listCollection(USERS);
  return users
    .map((u) => ({ id: u.id, username: u.username, role: u.role, expiresAt: u.expiresAt || null, createdAt: u.createdAt }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/** Admin: hapus akun. */
export async function deleteUser(id) {
  return store.deleteDoc(USERS, id);
}

/** Admin: atur masa aktif akun. days = null → permanen. */
export async function setUserExpiry(id, days) {
  const user = await store.getDoc(USERS, id);
  if (!user) throw new Error('Akun tidak ditemukan.');
  user.expiresAt = days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
  await store.setDoc(USERS, id, user);
  return user;
}

/** Admin: edit detail akun — peran, masa aktif, reset password. */
export async function updateUserDetails(id, patch = {}) {
  const user = await store.getDoc(USERS, id);
  if (!user) throw new Error('Akun tidak ditemukan.');

  const all = await store.listCollection(USERS);

  // Jangan menurunkan admin terakhir menjadi bukan admin
  if (patch.role && user.role === 'admin' && patch.role !== 'admin') {
    const adminCount = all.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) throw new Error('Tidak boleh menurunkan satu-satunya akun admin.');
  }

  const merged = { ...user };
  if (patch.role) merged.role = patch.role;
  if (patch.expiresAt !== undefined) merged.expiresAt = patch.expiresAt;
  if (patch.password) {
    if (String(patch.password).length < 4) throw new Error('Password minimal 4 karakter.');
    const salt = makeSalt();
    merged.salt = salt;
    merged.hash = await hashPassword(salt, patch.password);
  }
  await store.setDoc(USERS, id, merged);
  return merged;
}

/** Admin: buat akun dengan masa aktif tertentu. */
export async function createUserByAdmin({ username, password, role = 'user', durationDays = null }) {
  return createUserInternal({ username, password, role, durationDays });
}

export { storageMode };
