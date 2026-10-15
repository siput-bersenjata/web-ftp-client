const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, '../data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

// Default home folder on user's PC
const defaultPcFolder = path.join(os.homedir(), 'Documents');

// Initial seed profiles matching typical setup
const defaultProfiles = [
  {
    id: 'prof-hasil-ekstrak',
    name: 'Hasil ekstrak',
    pcFolder: defaultPcFolder,
    host: 'ftp.example.com',
    username: 'ftp-user-1',
    password: '',
    protocol: 'ftp',
    port: 21,
    passive: true,
    homeFolder: '/HotelMercure',
    isAnonymous: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prof-harris',
    name: 'Harris',
    pcFolder: defaultPcFolder,
    host: 'ftp.example.com',
    username: 'harris-user',
    password: '',
    protocol: 'ftp',
    port: 21,
    passive: true,
    homeFolder: '/Harris',
    isAnonymous: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prof-mercure',
    name: 'Mercure',
    pcFolder: defaultPcFolder,
    host: 'ftp.example.com',
    username: 'ftp-user-1',
    password: '',
    protocol: 'ftp',
    port: 21,
    passive: true,
    homeFolder: '/Mercure',
    isAnonymous: false,
    createdAt: new Date().toISOString()
  }
];

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
