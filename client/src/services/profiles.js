/**
 * Manajemen profil koneksi FTP milik user.
 * Tersimpan di store (localStorage / Firestore) dengan `ownerId`.
 * Admin dapat melihat semua profil; user biasa hanya profil miliknya sendiri.
 */
import * as store from './store';

const PROFILES = 'profiles';

export async function listProfiles(user) {
  const all = await store.listCollection(PROFILES);
  if (user?.role === 'admin') return all;
  return all.filter((p) => !p.ownerId || p.ownerId === user?.id);
}

export async function listProfilesOf(user) {
  const all = await store.listCollection(PROFILES);
  return all.filter((p) => p.ownerId === user?.id);
}

export async function saveProfile(user, profileData) {
  const id = profileData.id || `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const doc = {
    ...profileData,
    id,
    ownerId: profileData.ownerId || user?.id,
    port: Number(profileData.port) || (profileData.protocol === 'sftp' ? 22 : 21),
    updatedAt: new Date().toISOString(),
    createdAt: profileData.createdAt || new Date().toISOString(),
  };
  await store.setDoc(PROFILES, id, doc);
  return doc;
}

export async function deleteProfile(id) {
  return store.deleteDoc(PROFILES, id);
}

// ---------------------------------------------------------------------------

// Profil FTP bawaan tidak lagi dikodekan di source (lihat CATATAN-SETUP.md).
export function shouldSeedDefaults(_user) { return false; }
export async function seedDefaultProfiles(_user) { return; }
export async function syncDefaultProfiles(_user) { return false; }
