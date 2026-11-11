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

const USERS = 'users';
const SESSION_KEY = 'ftp_session_v1';

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
// Session
// ---------------------------------------------------------------------------
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Sesi admin/gate (expiresAt null) selalu aktif; user cek kedaluwarsa di sini
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      logout();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(user) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      expiresAt: user.expiresAt || null,
      loggedAt: new Date().toISOString(),
    })
  );
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Akun
// ---------------------------------------------------------------------------
export async function isInitialized() {
  const users = await store.listCollection(USERS);
  return users.length > 0;
}

/**
 * Setup awal: membuat akun admin & gate pertama jika database masih kosong.
 * Dipanggil dari layar Setup (hanya muncul saat database kosong).
 */
export async function initializeIfEmpty({ adminUsername, adminPassword, gateUsername, gatePassword }) {
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
  if (gateUsername && gatePassword) {
    await createUserInternal({
      username: gateUsername.trim(),
      password: gatePassword,
      role: 'gate',
      expiresAt: null,
    });
    created.push(gateUsername.trim());
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
  return createUserInternal({ username, password, role: 'user' });
}

/** Login — memvalidasi kredensial & masa aktif akun. */
export async function login({ username, password }) {
  const clean = String(username).trim();
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

  saveSession(user);
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

/** Admin: buat akun dengan masa aktif tertentu. */
export async function createUserByAdmin({ username, password, role = 'user', durationDays = null }) {
  return createUserInternal({ username, password, role, durationDays });
}

export { storageMode };
