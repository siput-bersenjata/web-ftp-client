import React, { useState, useEffect, useRef } from 'react';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import FilePane from './components/FilePane';
import TransferBar from './components/TransferBar';
import BottomDock from './components/BottomDock';
import CreateProfileModal from './components/CreateProfileModal';
import LoginScreen from './components/LoginScreen';
import AdminPanel from './components/AdminPanel';
import { api, isCloudMode, cloudUpload, cloudDownload, dbHeartbeat } from './services/api';
import { wsClient } from './services/ws';
import * as authService from './services/auth';
import * as profilesService from './services/profiles';
import * as store from './services/store';

export default function App() {
  // ---------------------------------------------------------------
  // Sesi pengguna (gate login + akun terdaftar)
  // ---------------------------------------------------------------
  const [user, setUser] = useState(() => authService.getCurrentUser());
  const isAdmin = user?.role === 'admin';
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  // Theme state: 'light' (putih) default; 'dark' (AMOLED) jika user memilih sebelumya
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('ftp_theme') || 'light';
  });

  // Mode aplikasi: cloud (Vercel) vs server lokal (Node di PC sendiri)
  const isCloud = isCloudMode;

  // Saved profiles list
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);

  // Tabs state
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  // Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  // Left Pane: PC Local (server mode) atau Staging File Browser (cloud mode)
  const [localPath, setLocalPath] = useState('');
  const [localParent, setLocalParent] = useState(null);
  const [localItems, setLocalItems] = useState([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState([]);
  const [stagedFiles, setStagedFiles] = useState([]); // File objects (cloud mode)

  // Right Pane: Remote FTP
  const [remotePath, setRemotePath] = useState('/');
  const [remoteItems, setRemoteItems] = useState([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState([]);
  const [ftpConnected, setFtpConnected] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [queue, setQueue] = useState([]); // server mode: dari WS; cloud mode: client-side
  const [toast, setToast] = useState(null);
  const [recentlyTransferred, setRecentlyTransferred] = useState([]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Latest values for the WebSocket handler, which is registered once
  const liveRef = useRef({});
  liveRef.current = { activeTabId, remotePath, localPath, profiles };
  const profilesRef = useRef([]);
  profilesRef.current = profiles;
  const refreshTimer = useRef(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ftp_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Heartbeat: tandai sesi online & baca jumlah user aktif (setiap 30 detik)
  useEffect(() => {
    if (!user || !isCloud) return undefined;
    let cancelled = false;
    const beat = () => { dbHeartbeat().then((n) => { if (!cancelled) setActiveCount(n); }); };
    beat();
    const id = setInterval(beat, 30000);
    const onFocus = () => beat();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [user, isCloud]);

  // 1. Initial Load: Fetch profiles & Local directory
  useEffect(() => {
    if (!user) return;
    loadProfiles();
    if (!isCloud) loadLocalFiles();

    // Ambil ulang data saat jendela/tab difokuskan — agar perubahan dari perangkat
    // lain terlihat (database bersama)
    const onFocus = () => {
      store.invalidateCache();
      loadProfiles();
    };
    window.addEventListener('focus', onFocus);

    if (isCloud) {
      addLog('Mode Cloud aktif: FTP diakses melalui server aman (kredensial tersinkron antar perangkat).');
      return () => window.removeEventListener('focus', onFocus);
    }

    // Global keyboard shortcuts
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleOpenCreateModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Start WebSocket
    wsClient.connect();
    const unsubscribe = wsClient.subscribe((msg) => {
      if (msg.type === 'INIT') {
        if (msg.payload.queue) setQueue(msg.payload.queue);
      } else if (msg.type === 'QUEUE_UPDATE') {
        setQueue(msg.payload);
      } else if (msg.type === 'TASK_PROGRESS') {
        setQueue((prev) =>
          prev.map((t) => (t.id === msg.payload.id ? { ...t, ...msg.payload } : t))
        );
      } else if (msg.type === 'FTP_LOG') {
        setLogs((prev) => [...prev.slice(-200), msg.payload]);
      } else if (msg.type === 'TASK_DONE') {
        const t = msg.payload;
        if (t.status === 'Completed') {
          showToast(`Berhasil ${t.type === 'upload' ? 'Upload' : 'Download'}: ${t.name}`, 'success');
          setRecentlyTransferred((prev) => [...prev.filter((n) => n !== t.name), t.name]);
        } else if (t.status === 'Failed') {
          showToast(`Gagal: ${t.name} (${t.error || 'error'})`, 'error');
        }
        // Debounce so a batch of 50 files triggers one refresh, not 50
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          const { activeTabId: tab, remotePath: rp, localPath: lp } = liveRef.current;
          if (tab && tab === msg.payload.sessionId) loadRemoteFiles(tab, rp, { silent: true });
          if (lp) loadLocalFiles(lp);
        }, 300);
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [user]);

  // ---------------------------------------------------------------
  // Profil koneksi (store: localStorage / Firestore)
  // ---------------------------------------------------------------
  const loadProfiles = async () => {
    try {
      let userProfiles = await profilesService.listProfiles(user);

      setProfiles(userProfiles);
      localStorage.setItem('ftp_profiles', JSON.stringify(userProfiles));

      if (userProfiles.length > 0 && tabs.length === 0) {
        const defaultProf = userProfiles[0];
        handleOpenSession(defaultProf);
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
      const local = JSON.parse(localStorage.getItem('ftp_profiles') || '[]');
      if (local && local.length > 0) {
        setProfiles(local);
      }
    }
  };

  const handleSaveProfile = async (profilePayload) => {
    return profilesService.saveProfile(user, profilePayload);
  };

  const loadLocalFiles = async (targetPath) => {
    if (isCloud) return; // cloud: pane lokal = staging browser
    setLocalLoading(true);
    try {
      const data = await api.listLocal(targetPath);
      setLocalPath(data.currentPath);
      setLocalParent(data.parentPath || null);
      setLocalItems(data.items);
      setLocalTotal(data.totalItems);
      setSelectedLocal([]);
    } catch (err) {
      console.error('Error loading local files:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  // Keep tabs in sync with updated profile definitions
  useEffect(() => {
    if (profiles.length > 0 && tabs.length > 0) {
      setTabs((prevTabs) =>
        prevTabs.map((tab) => {
          const fresh = profiles.find((p) => p.id === tab.id);
          if (fresh) {
            return {
              ...tab,
              name: fresh.name || fresh.host,
              host: fresh.host,
              username: fresh.username,
              profile: fresh
            };
          }
          return tab;
        })
      );
    }
  }, [profiles]);

  // ---------------------------------------------------------------
  // Koneksi FTP
  // ---------------------------------------------------------------
  const handleOpenSession = async (profile) => {
    setActiveProfileId(profile.id);

    const newTab = {
      id: profile.id,
      name: profile.name || profile.host,
      host: profile.host,
      username: profile.username,
      profile
    };

    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === profile.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = newTab;
        return copy;
      }
      return [...prev, newTab];
    });

    setActiveTabId(profile.id);

    if (!isCloud && profile.pcFolder) {
      loadLocalFiles(profile.pcFolder);
    }

    connectToRemote(profile);
  };

  const connectToRemote = async (profile) => {
    if (!profile) return;
    setRemoteLoading(true);
    setRemoteError(null);
    const sessionId = profile.id;
    addLog(`Menghubungkan ke ${profile.host}:${profile.port || 21}...`);

    try {
      if (isCloud) {
        await api.testFtpConnection(profile);
      } else {
        await api.connectFtp(sessionId, profile);
      }
      setFtpConnected(true);
      setRemoteError(null);
      addLog(`230 Pengguna ${profile.username || 'anonymous'} berhasil login.`);
      loadRemoteFiles(sessionId, profile.homeFolder || '/');
    } catch (err) {
      // Gagal terkoneksi: Jangan tampilkan data dummy apapun!
      setFtpConnected(false);
      setRemoteItems([]);
      setRemoteTotal(0);
      setSelectedRemote([]);
      setRemoteError(err.message || 'Koneksi gagal terhubung.');
      addLog(`[Error] Gagal terhubung ke ${profile.host}: ${err.message}`);
    } finally {
      setRemoteLoading(false);
    }
  };

  const loadRemoteFiles = async (sessionId, path, { silent = false } = {}) => {
    if (!silent) setRemoteLoading(true);
    try {
      const data = isCloud
        ? await api.ftpList(getProfileById(sessionId), path)
        : await api.listFtp(sessionId, path);
      setRemotePath(data.currentPath);
      setRemoteItems(data.items || []);
      setRemoteTotal(data.totalItems || 0);
      setSelectedRemote([]);
      setRemoteError(null);
    } catch (err) {
      console.error('Remote list error:', err);
      setRemoteError(err.message || 'Gagal memuat direktori remote.');
      setRemoteItems([]);
      setRemoteTotal(0);
      setSelectedRemote([]);
      addLog(`[Error] Gagal membaca folder remote ${path}: ${err.message}`);
    } finally {
      setRemoteLoading(false);
    }
  };

  const getProfileById = (sessionId) => {
    return (
      profilesRef.current.find((p) => p.id === sessionId) ||
      liveRef.current.profiles?.find((p) => p.id === sessionId) ||
      profiles.find((p) => p.id === sessionId)
    );
  };

  const addLog = (message) => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toLocaleTimeString(), message }
    ]);
  };

  // ---------------------------------------------------------------
  // Cloud: antrian transfer client-side
  // ---------------------------------------------------------------
  const pushCloudTask = (task) => {
    setQueue((prev) => [task, ...prev]);
    return task.id;
  };

  const updateCloudTask = (id, patch) => {
    setQueue((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  // Staging file (mode cloud)
  const handleStageFiles = (files) => {
    const mapped = Array.from(files).map((f, i) => ({
      name: f.name,
      path: `__staged_${Date.now()}_${i}`,
      size: f.size,
      isDirectory: false,
      type: 'File',
      modifiedDate: new Date(f.lastModified || Date.now()).toISOString(),
      file: f
    }));
    setStagedFiles((prev) => [...prev, ...mapped]);
    setLocalItems((prev) => [...prev, ...mapped]);
    setLocalTotal((prev) => prev + mapped.length);
    addLog(`${mapped.length} file siap di-upload dari browser.`);
    showToast(`${mapped.length} file ditambahkan ke staging.`, 'info');
  };

  // Cloud upload helper
  const runCloudUpload = async (stagedItem, destPath) => {
    const profile = getProfileById(activeTabId);
    if (!profile) return;
    const taskId = pushCloudTask({
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: stagedItem.name,
      type: 'upload',
      status: 'Transferring',
      progress: 0,
      sourcePath: '[Browser]',
      destinationPath: destPath,
      size: stagedItem.size || 0
    });
    try {
      await cloudUpload(profile, destPath, stagedItem.file, (loaded, total) => {
        updateCloudTask(taskId, { progress: Math.round((loaded / total) * 100) });
      });
      updateCloudTask(taskId, { status: 'Completed', progress: 100 });
      showToast(`Upload berhasil: ${stagedItem.name}`, 'success');
      setRecentlyTransferred((prev) => [...prev.filter((n) => n !== stagedItem.name), stagedItem.name]);
      addLog(`226 Upload selesai: ${stagedItem.name} -> ${destPath}`);
    } catch (err) {
      updateCloudTask(taskId, { status: 'Failed', error: err.message });
      showToast(`Gagal upload: ${stagedItem.name} (${err.message})`, 'error');
      addLog(`[Error] Upload ${stagedItem.name}: ${err.message}`);
    }
  };

  const runCloudUploadsSequential = async (items, destPath) => {
    for (const item of items) {
      await runCloudUpload(item, destPath);
    }
    const profile = getProfileById(activeTabId);
    if (profile && ftpConnected) loadRemoteFiles(profile.id, remotePath, { silent: true });
  };

  // Cloud download helper
  const runCloudDownload = async (item) => {
    const profile = getProfileById(activeTabId);
    if (!profile) return;
    const taskId = pushCloudTask({
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      type: 'download',
      status: 'Transferring',
      progress: 50,
      sourcePath: item.path,
      destinationPath: 'Browser (perangkat ini)',
      size: item.size || 0
    });
    try {
      await cloudDownload(profile, item.path);
      updateCloudTask(taskId, { status: 'Completed', progress: 100 });
      showToast(`Download berhasil: ${item.name}`, 'success');
      addLog(`226 Download selesai: ${item.name}`);
    } catch (err) {
      updateCloudTask(taskId, { status: 'Failed', error: err.message });
      showToast(`Gagal download: ${item.name} (${err.message})`, 'error');
      addLog(`[Error] Download ${item.name}: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Local Pane Actions
  // ---------------------------------------------------------------
  const handleLocalNavigate = (newPath) => {
    if (isCloud) return;
    loadLocalFiles(newPath);
  };

  const handleLocalNavigateUp = () => {
    if (!localParent) return;
    loadLocalFiles(localParent);
  };

  const handleLocalCreateFolder = async (name) => {
    if (isCloud) return;
    try {
      await api.createLocalFolder(localPath, name);
      loadLocalFiles(localPath);
    } catch (err) {
      alert('Gagal membuat folder lokal: ' + err.message);
    }
  };

  const handleLocalDelete = async (items) => {
    if (isCloud) {
      // Hapus dari staging
      const ids = new Set(items.map((i) => i.path));
      setStagedFiles((prev) => prev.filter((f) => !ids.has(f.path)));
      setLocalItems((prev) => prev.filter((f) => !ids.has(f.path)));
      setLocalTotal((prev) => Math.max(0, prev - items.length));
      return;
    }
    try {
      for (const item of items) {
        await api.deleteLocalItem(item.path);
      }
      loadLocalFiles(localPath);
    } catch (err) {
      alert('Gagal menghapus item: ' + err.message);
    }
  };

  const handleLocalRename = async (item, newName) => {
    if (isCloud) {
      const idx = stagedFiles.findIndex((f) => f.path === item.path);
      if (idx < 0 || !newName || newName === item.name) return;
      const renamed = { ...stagedFiles[idx], name: newName };
      setStagedFiles((prev) => prev.map((f, i) => (i === idx ? renamed : f)));
      setLocalItems((prev) => prev.map((f, i) => (i === idx ? renamed : f)));
      showToast(`Nama file diubah menjadi ${newName}`, 'success');
      return;
    }
    if (!newName || newName === item.name) return;
    try {
      const parts = item.path.split(/[/\\]/);
      parts.pop();
      const parentDir = parts.join('\\');
      const newPath = `${parentDir}\\${newName}`;
      await api.renameLocalItem(item.path, newPath);
      showToast(`Nama file diubah menjadi ${newName}`, 'success');
      loadLocalFiles(localPath);
    } catch (err) {
      alert('Gagal mengganti nama file lokal: ' + err.message);
    }
  };

  // ---------------------------------------------------------------
  // Remote Pane Actions
  // ---------------------------------------------------------------
  const handleRemoteNavigate = (newPath) => {
    if (activeTabId) {
      loadRemoteFiles(activeTabId, newPath);
    }
  };

  const handleRemoteNavigateUp = () => {
    if (!remotePath || remotePath === '/') return;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    const parent = '/' + parts.join('/');
    handleRemoteNavigate(parent);
  };

  const handleRemoteCreateFolder = async (name) => {
    if (!activeTabId) return;
    try {
      if (isCloud) {
        await api.ftpMkdir(getProfileById(activeTabId), remotePath, name);
      } else {
        await api.createFtpFolder(activeTabId, remotePath, name);
      }
      loadRemoteFiles(activeTabId, remotePath);
    } catch (err) {
      alert('Gagal membuat folder remote: ' + err.message);
    }
  };

  const handleRemoteDelete = async (items) => {
    if (!activeTabId) return;
    try {
      for (const item of items) {
        if (isCloud) {
          await api.ftpDelete(getProfileById(activeTabId), item.path, item.isDirectory);
        } else {
          await api.deleteFtpItem(activeTabId, item.path, item.isDirectory);
        }
      }
      loadRemoteFiles(activeTabId, remotePath);
    } catch (err) {
      alert('Gagal menghapus item remote: ' + err.message);
    }
  };

  const handleRemoteRename = async (item, newName) => {
    if (!activeTabId || !newName || newName === item.name) return;
    try {
      const parentDir = remotePath === '/' ? '/' : remotePath;
      const newPath = parentDir.endsWith('/') ? `${parentDir}${newName}` : `${parentDir}/${newName}`;
      if (isCloud) {
        await api.ftpRename(getProfileById(activeTabId), item.path, newPath);
      } else {
        await api.renameFtpItem(activeTabId, item.path, newPath);
      }
      showToast(`Nama file diubah menjadi ${newName}`, 'success');
      loadRemoteFiles(activeTabId, remotePath);
    } catch (err) {
      alert('Gagal mengganti nama file remote: ' + err.message);
    }
  };

  // ---------------------------------------------------------------
  // Transfer Actions
  // ---------------------------------------------------------------
  const guardConnected = () => {
    if (!ftpConnected) {
      alert('Belum terhubung ke server FTP. Hubungkan dulu sebelum transfer.');
      return false;
    }
    return true;
  };

  const handleUploadSelected = async () => {
    if (selectedLocal.length === 0 || !activeTabId) return;
    if (!guardConnected()) return;

    if (isCloud) {
      await runCloudUploadsSequential(selectedLocal, remotePath);
      setSelectedLocal([]);
      return;
    }

    const tasks = selectedLocal.map((item) => ({
      name: item.name,
      type: 'upload',
      sourcePath: item.path,
      destinationPath: remotePath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      sessionId: activeTabId
    }));
    try {
      await api.addToQueue(tasks);
      addLog(`Menambahkan ${tasks.length} item ke antrian upload -> ${remotePath}`);
    } catch (err) {
      alert('Gagal menambah antrian transfer: ' + err.message);
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedRemote.length === 0 || !activeTabId) return;
    if (!guardConnected()) return;

    if (isCloud) {
      for (const item of selectedRemote) {
        await runCloudDownload(item);
      }
      setSelectedRemote([]);
      return;
    }

    const tasks = selectedRemote.map((item) => ({
      name: item.name,
      type: 'download',
      sourcePath: item.path,
      destinationPath: localPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      modifiedDate: item.modifiedDate,
      sessionId: activeTabId
    }));
    try {
      await api.addToQueue(tasks);
      addLog(`Menambahkan ${tasks.length} item ke antrian download -> ${localPath}`);
    } catch (err) {
      alert('Gagal menambah antrian transfer: ' + err.message);
    }
  };

  // Drag & drop cross-transfer
  const handleDropTransfer = async (items, targetDestPath) => {
    if (!items || items.length === 0 || !activeTabId) return;
    if (!guardConnected()) return;

    if (isCloud) {
      const fromStaged = !!items[0].file;
      if (fromStaged) {
        await runCloudUploadsSequential(items, targetDestPath);
      } else {
        for (const item of items) await runCloudDownload(item);
      }
      return;
    }

    const isUpload = !items[0].attribute;
    const tasks = items.map((item) => ({
      name: item.name,
      type: isUpload ? 'upload' : 'download',
      sourcePath: item.path,
      destinationPath: targetDestPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      modifiedDate: item.modifiedDate,
      sessionId: activeTabId
    }));
    showToast(`Mentransfer ${tasks.length} item via Drag & Drop...`, 'info');
    try {
      await api.addToQueue(tasks);
      addLog(`Menambahkan ${tasks.length} item via Drag & Drop`);
    } catch (err) {
      alert('Gagal menambah antrian transfer: ' + err.message);
    }
  };

  // Direct upload from browser (file input or dropped from desktop)
  const handleDirectUpload = async (files) => {
    if (!activeTabId || !ftpConnected) {
      alert('Belum terhubung ke server FTP. Silakan hubungkan dulu.');
      return;
    }
    showToast(`Mengunggah ${files.length} file ke FTP...`, 'info');

    if (isCloud) {
      const mapped = Array.from(files).map((f, i) => ({
        name: f.name,
        size: f.size,
        path: `__direct_${Date.now()}_${i}`,
        file: f
      }));
      await runCloudUploadsSequential(mapped, remotePath);
      return;
    }

    try {
      await api.uploadDirect(activeTabId, remotePath, files);
      addLog(`Mengunggah ${files.length} file langsung ke ${remotePath}`);
    } catch (err) {
      showToast(`Gagal: ${err.message}`, 'error');
      addLog(`[Error] Direct upload error: ${err.message}`);
      alert('Gagal mengunggah file: ' + err.message);
    }
  };

  // Transfer single item (double click or context menu)
  const handleTransferSingleItem = async (item, fromType) => {
    if (!activeTabId || !ftpConnected) {
      alert('Belum terhubung ke server FTP. Silakan hubungkan dulu.');
      return;
    }
    if (isCloud) {
      if (fromType === 'local') {
        await runCloudUpload(item, remotePath);
        const profile = getProfileById(activeTabId);
        if (profile) loadRemoteFiles(profile.id, remotePath, { silent: true });
      } else {
        await runCloudDownload(item);
      }
      return;
    }

    const isUpload = fromType === 'local';
    const task = {
      name: item.name,
      type: isUpload ? 'upload' : 'download',
      sourcePath: item.path,
      destinationPath: isUpload ? remotePath : localPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      modifiedDate: item.modifiedDate,
      sessionId: activeTabId
    };
    showToast(`Memulai ${isUpload ? 'Upload' : 'Download'}: ${item.name}`, 'info');
    try {
      await api.addToQueue([task]);
      addLog(`Mentransfer ${item.name} -> ${isUpload ? remotePath : localPath}`);
    } catch (err) {
      alert('Gagal menambah antrian transfer: ' + err.message);
    }
  };

  // ---------------------------------------------------------------
  // Profile Management
  // ---------------------------------------------------------------
  const handleOpenCreateModal = () => {
    setEditingProfile(null);
    setIsModalOpen(true);
  };

  const handleEditProfile = (profile) => {
    setEditingProfile(profile);
    setIsModalOpen(true);
  };

  const handleDeleteProfile = async (id) => {
    if (confirm('Hapus profil koneksi ini?')) {
      try {
        await profilesService.deleteProfile(id);
      } catch {
        await api.deleteProfile(id);
      }
      const remaining = profiles.filter((p) => p.id !== id);
      setProfiles(remaining);
      if (activeProfileId === id) {
        handleCloseTab(id);
      }
    }
  };

  const handleCloseTab = (id) => {
    const updated = tabs.filter((t) => t.id !== id);
    setTabs(updated);
    setRemoteError(null);
    if (activeTabId === id) {
      if (updated.length > 0) {
        setActiveTabId(updated[0].id);
        setActiveProfileId(updated[0].id);
      } else {
        setActiveTabId(null);
        setActiveProfileId(null);
        setRemoteItems([]);
        setRemoteTotal(0);
        setFtpConnected(false);
      }
    }
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeProfile = profiles.find((p) => p.id === activeTabId) || activeTab?.profile;

  // ---------------------------------------------------------------
  // Gate login
  // ---------------------------------------------------------------
  if (!user) {
    return (
      <LoginScreen
        onLoggedIn={(u) => {
          setUser(u);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className="app-container">
      {/* 1. Top Navigation & Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          setActiveTabId(id);
          setActiveProfileId(id);
          setRemoteError(null);
          const prof = profiles.find((p) => p.id === id) || tabs.find((t) => t.id === id)?.profile;
          if (prof) {
            if (!isCloud && prof.pcFolder) loadLocalFiles(prof.pcFolder);
            connectToRemote(prof);
          }
        }}
        onCloseTab={handleCloseTab}
        onOpenCreateModal={handleOpenCreateModal}
        theme={theme}
        activeCount={activeCount}
        onToggleTheme={toggleTheme}
        user={user}
        isAdmin={isAdmin}
        isCloud={isCloud}
        onLogout={handleLogout}
        onOpenAdmin={() => setAdminOpen(true)}
      />

      {/* 2. Main Workspace Area */}
      <div className="workspace-container">
        {/* Left Sidebar: Quick Connect & PC Bookmarks */}
        <Sidebar
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelectProfile={handleOpenSession}
          onOpenCreateModal={handleOpenCreateModal}
          onEditProfile={handleEditProfile}
          onDeleteProfile={handleDeleteProfile}
          onQuickNavigateLocal={handleLocalNavigate}
        />

        {/* Central Panes */}
        <div className="workspace-main">
        <div className="panes-wrapper">
          {/* Daftar FTP Terhubung — tampil di ponsel (layar sempit) */}
          <div className="mobile-profile-bar">
            <div className="mobile-profile-bar-title">FTP Terhubung</div>
            <div className="mobile-profile-chips">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className={`mobile-profile-chip ${p.id === activeProfileId ? 'active' : ''}`}
                  onClick={() => handleOpenSession(p)}
                  title={`${p.host} [${p.username || 'anonymous'}]`}
                >
                  <span className="chip-dot" />
                  {p.name}
                </button>
              ))}
              <button className="mobile-profile-chip add" onClick={handleOpenCreateModal}>+ Baru</button>
            </div>
          </div>
          <div className="dual-panes">
            {/* Left Pane: PC Local / Browser Staging */}
            <FilePane
              title={isCloud ? 'Browser: File Staging' : 'PC: bram (Lokal)'}
              type="local"
              currentPath={isCloud ? 'Browser' : localPath}
              items={isCloud ? localItems : localItems}
              totalItems={localTotal}
              isLoading={localLoading}
              selectedItems={selectedLocal}
              onSelectItems={setSelectedLocal}
              onNavigate={handleLocalNavigate}
              onNavigateUp={isCloud ? null : handleLocalNavigateUp}
              onRefresh={() => (isCloud ? null : loadLocalFiles(localPath))}
              onCreateFolder={isCloud ? null : handleLocalCreateFolder}
              onDeleteItem={handleLocalDelete}
              onRenameItem={handleLocalRename}
              onDropTransfer={handleDropTransfer}
              onTransferItem={(item) => handleTransferSingleItem(item, 'local')}
              onTransferSelected={handleUploadSelected}
              onStageFiles={isCloud ? handleStageFiles : null}
              recentlyTransferred={recentlyTransferred}
            />

            {/* Middle Transfer Control */}
            <TransferBar
              canUpload={selectedLocal.length > 0}
              canDownload={selectedRemote.length > 0}
              uploadCount={selectedLocal.length}
              downloadCount={selectedRemote.length}
              onUpload={handleUploadSelected}
              onDownload={handleDownloadSelected}
            />

            {/* Right Pane: Remote FTP */}
            <FilePane
              title={
                activeProfile
                  ? `FTP: ${activeProfile.host} [${activeProfile.username || 'anonymous'}]${remoteError ? ' (Gagal Terhubung)' : ''}`
                  : 'FTP: (Belum Terhubung)'
              }
              type="remote"
              currentPath={remotePath}
              items={remoteItems}
              totalItems={remoteTotal}
              isLoading={remoteLoading}
              selectedItems={selectedRemote}
              onSelectItems={setSelectedRemote}
              onNavigate={handleRemoteNavigate}
              onNavigateUp={handleRemoteNavigateUp}
              onRefresh={() => {
                if (ftpConnected && activeTabId) {
                  loadRemoteFiles(activeTabId, remotePath);
                } else if (activeProfile) {
                  connectToRemote(activeProfile);
                }
              }}
              onCreateFolder={handleRemoteCreateFolder}
              onDeleteItem={handleRemoteDelete}
              onRenameItem={handleRemoteRename}
              onDropTransfer={handleDropTransfer}
              onTransferItem={(item) => handleTransferSingleItem(item, 'remote')}
              onTransferSelected={handleDownloadSelected}
              onDirectUpload={handleDirectUpload}
              recentlyTransferred={recentlyTransferred}
              error={remoteError}
              onRetry={() => activeProfile && connectToRemote(activeProfile)}
              onEditProfile={() => activeProfile && handleEditProfile(activeProfile)}
            />
          </div>
        </div>

          {/* Bottom Dock: Queue & Terminal Logs */}
          <BottomDock
            logs={logs}
            queue={queue}
            onRemoveTask={(id) => {
              if (isCloud) {
                setQueue((prev) => prev.filter((t) => t.id !== id));
              } else {
                api.removeFromQueue(id);
              }
            }}
            onMoveTask={(id, dir) => {
              if (!isCloud) api.moveQueueItem(id, dir);
            }}
            onClearFinished={() => {
              if (isCloud) {
                setQueue((prev) => prev.filter((t) => t.status !== 'Completed' && t.status !== 'Failed'));
              } else {
                api.clearFinishedQueue();
              }
            }}
          />
        </div>
      </div>

      {/* Create / Edit Connection Profile Modal */}
      <CreateProfileModal
        isOpen={isModalOpen}
        initialData={editingProfile}
        onClose={() => setIsModalOpen(false)}
        onSaveProfile={handleSaveProfile}
        onConnect={(newProfile) => {
          loadProfiles();
          handleOpenSession(newProfile);
        }}
      />

      {/* Panel Admin (hanya role admin) */}
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />

      {/* Instant Toast Notification */}
      {toast && (
        <div
          className={`app-toast ${toast.type}`}
          style={{
            position: 'fixed',
            bottom: '240px',
            right: '24px',
            zIndex: 10000,
            background: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#dc2626' : '#2563eb',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
