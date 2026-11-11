const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, '../data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

// Default home folder on user's PC
const defaultPcFolder = path.join(os.homedir(), 'Documents');

// NOTE: Jangan pernah menaruh kredensial FTP asli di sini (repo ini publik).
// Contoh profil hanya placeholder — kredensial nyata disimpan via aplikasi
// (data/profiles.json yang di-gitignore atau cloud store seperti Firebase).
const defaultProfiles = [];

async function ensureDataFile() {
  await fs.ensureDir(DATA_DIR);
  if (!(await fs.pathExists(PROFILES_FILE))) {
    await fs.writeJson(PROFILES_FILE, defaultProfiles, { spaces: 2 });
  }
}

async function getProfiles() {
  await ensureDataFile();
  try {
    return await fs.readJson(PROFILES_FILE);
  } catch (err) {
    console.error('Error reading profiles:', err);
    return defaultProfiles;
  }
}

async function saveProfile(profileData) {
  await ensureDataFile();
  const profiles = await getProfiles();
  const id = profileData.id || `prof-${Date.now()}`;
  
  const newProfile = {
    ...profileData,
    id,
    pcFolder: profileData.pcFolder || defaultPcFolder,
    port: Number(profileData.port) || (profileData.protocol === 'sftp' ? 22 : 21),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = profiles.findIndex(p => p.id === id);
  if (existingIndex >= 0) {
    profiles[existingIndex] = { ...profiles[existingIndex], ...newProfile };
  } else {
    profiles.push(newProfile);
  }

  await fs.writeJson(PROFILES_FILE, profiles, { spaces: 2 });
  return newProfile;
}

async function deleteProfile(id) {
  await ensureDataFile();
  let profiles = await getProfiles();
  profiles = profiles.filter(p => p.id !== id);
  await fs.writeJson(PROFILES_FILE, profiles, { spaces: 2 });
  return { success: true };
}

module.exports = {
  getProfiles,
  saveProfile,
  deleteProfile,
  defaultPcFolder
};
