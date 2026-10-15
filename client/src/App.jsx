import React, { useState, useEffect, useRef } from 'react';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import FilePane from './components/FilePane';
import TransferBar from './components/TransferBar';
import BottomDock from './components/BottomDock';
import CreateProfileModal from './components/CreateProfileModal';
import { api } from './services/api';
import { wsClient } from './services/ws';

export default function App() {
  // Theme state: 'dark' or 'light'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('ftp_theme') || 'dark';
  });

  // Saved profiles list
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);

  // Tabs state
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  // Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  // Left Pane: PC Local
  const [localPath, setLocalPath] = useState('');
  const [localParent, setLocalParent] = useState(null);
  const [localItems, setLocalItems] = useState([]);
  const [localTotal, setLocalTotal] = useState(0);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState([]);

  // Right Pane: Remote FTP
  const [remotePath, setRemotePath] = useState('/');
  const [remoteItems, setRemoteItems] = useState([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState([]);
  const [ftpConnected, setFtpConnected] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [toast, setToast] = useState(null);
  const [recentlyTransferred, setRecentlyTransferred] = useState([]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Latest values for the WebSocket handler, which is registered once
  const liveRef = useRef({});
  liveRef.current = { activeTabId, remotePath, localPath };
  const refreshTimer = useRef(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ftp_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 1. Initial Load: Fetch profiles & Local directory
  useEffect(() => {
    loadProfiles();
    loadLocalFiles();

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
      unsubscribe();
    };
  }, []);

  const loadProfiles = async () => {
    try {
      const serverProfiles = await api.getProfiles();
      if (serverProfiles && serverProfiles.length > 0) {
        setProfiles(serverProfiles);
        localStorage.setItem('ftp_profiles', JSON.stringify(serverProfiles));

        if (tabs.length === 0) {
          const defaultProf = serverProfiles.find((p) => p.name === 'Harris') || serverProfiles[0];
          handleOpenSession(defaultProf);
        }
      }
    } catch (err) {
      console.error('Failed to load profiles:', err);
      const local = JSON.parse(localStorage.getItem('ftp_profiles') || '[]');
      if (local && local.length > 0) {
        setProfiles(local);
      }
    }
  };

  const loadLocalFiles = async (targetPath) => {
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

  const handleOpenSession = async (profile) => {
    setActiveProfileId(profile.id);

    // Update tab or create new tab with the latest profile object
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

    if (profile.pcFolder) {
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
      await api.connectFtp(sessionId, profile);
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
      const data = await api.listFtp(sessionId, path);
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

  const addLog = (message) => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toLocaleTimeString(), message }
    ]);
  };

  // Local Pane Actions
  const handleLocalNavigate = (newPath) => {
    loadLocalFiles(newPath);
  };

  const handleLocalNavigateUp = () => {
    if (localParent) loadLocalFiles(localParent);
  };

  const handleLocalCreateFolder = async (name) => {
    try {
      await api.createLocalFolder(localPath, name);
      loadLocalFiles(localPath);
    } catch (err) {
      alert('Gagal membuat folder lokal: ' + err.message);
    }
  };

  const handleLocalDelete = async (items) => {
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

  // Remote Pane Actions
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
      await api.createFtpFolder(activeTabId, remotePath, name);
      loadRemoteFiles(activeTabId, remotePath);
    } catch (err) {
      alert('Gagal membuat folder remote: ' + err.message);
    }
  };

  const handleRemoteDelete = async (items) => {
    if (!activeTabId) return;
    try {
      for (const item of items) {
        await api.deleteFtpItem(activeTabId, item.path, item.isDirectory);
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
      await api.renameFtpItem(activeTabId, item.path, newPath);
      showToast(`Nama file diubah menjadi ${newName}`, 'success');
      loadRemoteFiles(activeTabId, remotePath);
    } catch (err) {
      alert('Gagal mengganti nama file remote: ' + err.message);
    }
  };

  const queueTasks = async (tasks, label) => {
    if (!ftpConnected) {
      alert('Belum terhubung ke server FTP. Hubungkan dulu sebelum transfer.');
      return;
    }
    try {
      await api.addToQueue(tasks);
      addLog(label);
    } catch (err) {
      addLog(`[Error] Gagal menambah antrian: ${err.message}`);
      alert('Gagal menambah antrian transfer: ' + err.message);
    }
  };

  // Transfer Actions
  const handleUploadSelected = async () => {
    if (selectedLocal.length === 0 || !activeTabId) return;
    const tasks = selectedLocal.map((item) => ({
      name: item.name,
      type: 'upload',
      sourcePath: item.path,
      destinationPath: remotePath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      sessionId: activeTabId
    }));
    await queueTasks(tasks, `Menambahkan ${tasks.length} item ke antrian upload -> ${remotePath}`);
  };

  const handleDownloadSelected = async () => {
    if (selectedRemote.length === 0 || !activeTabId) return;
    const tasks = selectedRemote.map((item) => ({
      name: item.name,
      type: 'download',
      sourcePath: item.path,
      destinationPath: localPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      sessionId: activeTabId
    }));
    await queueTasks(tasks, `Menambahkan ${tasks.length} item ke antrian download -> ${localPath}`);
  };

  // Drag & drop cross-transfer
  const handleDropTransfer = async (items, targetDestPath) => {
    if (!items || items.length === 0 || !activeTabId) return;
    const isUpload = !items[0].attribute;
    const tasks = items.map((item) => ({
      name: item.name,
      type: isUpload ? 'upload' : 'download',
      sourcePath: item.path,
      destinationPath: targetDestPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      sessionId: activeTabId
    }));
    showToast(`Mentransfer ${tasks.length} item via Drag & Drop...`, 'info');
    await queueTasks(tasks, `Menambahkan ${tasks.length} item via Drag & Drop`);
  };

  // Direct upload from browser (file input or dropped from desktop)
  const handleDirectUpload = async (files) => {
    if (!activeTabId || !ftpConnected) {
      alert('Belum terhubung ke server FTP. Silakan hubungkan dulu.');
      return;
    }
    showToast(`Mengunggah ${files.length} file ke FTP...`, 'info');
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
    const isUpload = fromType === 'local';
    const task = {
      name: item.name,
      type: isUpload ? 'upload' : 'download',
      sourcePath: item.path,
      destinationPath: isUpload ? remotePath : localPath,
      size: item.size || 0,
      isDirectory: !!item.isDirectory,
      sessionId: activeTabId
    };
    showToast(`Memulai ${isUpload ? 'Upload' : 'Download'}: ${item.name}`, 'info');
    await queueTasks([task], `Mentransfer ${item.name} -> ${isUpload ? remotePath : localPath}`);
  };

  // Profile Management
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
      await api.deleteProfile(id);
      loadProfiles();
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
      }
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeProfile = profiles.find((p) => p.id === activeTabId) || activeTab?.profile;

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
            if (prof.pcFolder) loadLocalFiles(prof.pcFolder);
            connectToRemote(prof);
          }
        }}
        onCloseTab={handleCloseTab}
        onOpenCreateModal={handleOpenCreateModal}
        theme={theme}
        onToggleTheme={toggleTheme}
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
        <div className="panes-wrapper">
          <div className="dual-panes">
            {/* Left Pane: PC Local */}
            <FilePane
              title="PC: bram (Lokal)"
              type="local"
              currentPath={localPath}
              items={localItems}
              totalItems={localTotal}
              isLoading={localLoading}
              selectedItems={selectedLocal}
              onSelectItems={setSelectedLocal}
              onNavigate={handleLocalNavigate}
              onNavigateUp={handleLocalNavigateUp}
              onRefresh={() => loadLocalFiles(localPath)}
              onCreateFolder={handleLocalCreateFolder}
              onDeleteItem={handleLocalDelete}
              onRenameItem={handleLocalRename}
              onDropTransfer={handleDropTransfer}
              onTransferItem={(item) => handleTransferSingleItem(item, 'local')}
              onTransferSelected={handleUploadSelected}
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

          {/* Bottom Dock: Queue & Terminal Logs */}
          <BottomDock
            logs={logs}
            queue={queue}
            onRemoveTask={(id) => api.removeFromQueue(id)}
            onMoveTask={(id, dir) => api.moveQueueItem(id, dir)}
            onClearFinished={() => api.clearFinishedQueue()}
          />
        </div>
      </div>

      {/* Create / Edit Connection Profile Modal */}
      <CreateProfileModal
        isOpen={isModalOpen}
        initialData={editingProfile}
        onClose={() => setIsModalOpen(false)}
        onConnect={(newProfile) => {
          loadProfiles();
          handleOpenSession(newProfile);
        }}
      />

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
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
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
