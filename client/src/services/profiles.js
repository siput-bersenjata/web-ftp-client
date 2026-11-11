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
  const defaults = getDefaultProfiles();
  for (const d of defaults) {
    await saveProfile(user, {
      name: d.name,
      pcFolder: '',
      host: d.host,
      username: d.username,
      password: '',
      protocol: 'ftp',
      port: 21,
      passive: true,
      homeFolder: d.homeFolder,
      isAnonymous: false,
      isDefault: true,
    });
  }
}

function getDefaultProfiles() {
  return [
    { name: 'Hasil ekstrak', host: 'ftp.example.com', username: 'ftp-user-1', homeFolder: '/' },
    { name: 'Harris', host: 'ftp.example.com', username: 'ftp-user-harris', homeFolder: '/' },
    { name: 'Mercure', host: 'ftp.example.com', username: 'ftp-user-mercure', homeFolder: '/' },
  ];
}

/**
 * Sinkronkan profil default yang sudah ada di perangkat user
 * (mis. dibuat oleh versi lama dengan username salah / host berubah).
 * Hanya memperbarui profil yang ditandai `isDefault` dan yang password-nya
 * masih kosong — password yang sudah diisi user tidak pernah ditimpa.
 */
export async function syncDefaultProfiles(user) {
  const all = await listProfilesOf(user);
  const defaults = getDefaultProfiles();
  let changed = false;
  for (const p of all) {
    const d = defaults.find((x) => x.name === p.name);
    if (!d) continue;
    // Profil default baru, atau profil warisan hasil seed versi lama
    // (host cocok + password masih kosong)
    const isLegacyDefault = !p.password && p.host === d.host && p.ownerId === user?.id;
    if (!p.isDefault && !isLegacyDefault) continue;
    if (p.username !== d.username || p.host !== d.host || p.homeFolder !== d.homeFolder) {
      if (p.password) continue; // sudah dipakai user — jangan diubah
      await saveProfile(user, {
        ...p,
        host: d.host,
        username: d.username,
        homeFolder: d.homeFolder,
        isDefault: true,
      });
      changed = true;
    } else if (!p.isDefault) {
      await saveProfile(user, { ...p, isDefault: true });
      changed = true;
    }
  }
  return changed;
}
