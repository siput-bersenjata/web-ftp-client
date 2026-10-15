const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const mime = require('mime-types');

function getFileType(filename, isDir) {
  if (isDir) return 'File Folder';
  const ext = path.extname(filename).toLowerCase();
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return 'Microsoft Excel Worksheet';
  if (['.docx', '.doc'].includes(ext)) return 'Microsoft Word Document';
  if (['.pptx', '.ppt'].includes(ext)) return 'Microsoft PowerPoint Presentation';
  if (['.pdf'].includes(ext)) return 'PDF Document';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'Compressed Archive';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'Image File';
  if (['.txt', '.md', '.log', '.json', '.js', '.ts', '.html', '.css'].includes(ext)) return 'Text Document';
  if (['.exe', '.msi', '.bat', '.cmd'].includes(ext)) return 'Application';
  return mime.lookup(filename) || 'File';
}

function getAvailableDrives() {
  if (os.platform() === 'win32') {
    const drives = [];
    // Check common drive letters
    const letters = ['C', 'D', 'E', 'F', 'G', 'H'];
    for (const l of letters) {
      const rootPath = `${l}:\\`;
      if (fs.existsSync(rootPath)) {
        drives.push({ name: `${l}:`, path: rootPath, isDrive: true });
      }
    }
    return drives;
  }
  return [{ name: '/', path: '/', isDrive: true }];
}

async function listLocalDirectory(targetPath) {
  let resolvedPath = targetPath ? path.resolve(targetPath) : path.join(os.homedir(), 'Documents');

  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = os.homedir();
  }

  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    // Skip hidden/system files if desired, or include them
    const fullPath = path.join(resolvedPath, entry.name);
    try {
      const stats = await fs.stat(fullPath);
      const isDir = entry.isDirectory();
      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        size: isDir ? null : stats.size,
        modifiedDate: stats.mtime.toISOString(),
        type: getFileType(entry.name, isDir),
        extension: path.extname(entry.name).toLowerCase()
      });
    } catch {
      // In case of permission errors on specific system files
      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        size: null,
        modifiedDate: new Date().toISOString(),
        type: entry.isDirectory() ? 'File Folder' : 'File',
        extension: path.extname(entry.name).toLowerCase()
      });
    }
  }

  // Sort: folders first, then files alphabetically
  items.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
    return a.isDirectory ? -1 : 1;
  });

  const parentPath = path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null;

  return {
    currentPath: resolvedPath,
    parentPath,
    drives: getAvailableDrives(),
    items,
    totalItems: items.length
  };
}

async function createLocalDirectory(parentPath, folderName) {
  const target = path.join(parentPath, folderName);
  await fs.ensureDir(target);
  return { success: true, path: target };
}

async function deleteLocalItem(itemPath) {
  await fs.remove(itemPath);
  return { success: true };
}

async function renameLocalItem(oldPath, newPath) {
  await fs.rename(oldPath, newPath);
  return { success: true };
}

function getLocalShortcuts() {
  const home = os.homedir();
  const shortcuts = [
    { name: 'Documents', path: path.join(home, 'Documents') },
    { name: 'Downloads', path: path.join(home, 'Downloads') },
    { name: 'Desktop', path: path.join(home, 'Desktop') }
  ];
  return shortcuts.filter(s => fs.existsSync(s.path));
}

module.exports = {
  listLocalDirectory,
  createLocalDirectory,
  deleteLocalItem,
  renameLocalItem,
  getFileType,
  getAvailableDrives,
  getLocalShortcuts
};

