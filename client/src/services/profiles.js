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
// Profil FTP default untuk admin & Cartenz
// (tanpa password — masukkan password lewat Edit Profil saat konek pertama)
// ---------------------------------------------------------------------------
export function shouldSeedDefaults(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return String(user.username || '').trim().toLowerCase() === 'cartenz';
}

export async function seedDefaultProfiles(user) {
  const defaults = [
    { name: 'Hasil ekstrak', username: 'ftp-user-1', homeFolder: '/' },
    { name: 'Harris', username: 'harris-user', homeFolder: '/Harris' },
    { name: 'Mercure', username: 'ftp-user-1', homeFolder: '/Mercure' },
  ];
  for (const d of defaults) {
    await saveProfile(user, {
      name: d.name,
      pcFolder: '',
      host: 'ftp.example.com',
      username: d.username,
      password: '',
      protocol: 'ftp',
      port: 21,
      passive: true,
      homeFolder: d.homeFolder,
      isAnonymous: false,
    });
  }
}
