import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Server,
  Folder,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  FolderCheck,
  ShieldCheck,
  KeyRound,
  Network
} from 'lucide-react';
import { api } from '../services/api';

export default function CreateProfileModal({ isOpen, onClose, onConnect, initialData }) {
  const [profileName, setProfileName] = useState('');
  const [pcFolder, setPcFolder] = useState('C:\\Users\\bram\\Documents');
  const [ftpAddress, setFtpAddress] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [protocol, setProtocol] = useState('ftp');
  const [port, setPort] = useState(21);
  const [usePassive, setUsePassive] = useState(true);
  const [homeFolder, setHomeFolder] = useState('/');
  
  // Test Connection state
  const [testState, setTestState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (initialData) {
      setProfileName(initialData.name || '');
      setPcFolder(initialData.pcFolder || 'C:\\Users\\bram\\Documents');
      setFtpAddress(initialData.host || '');
      setUserName(initialData.username || '');
      setPassword(initialData.password || '');
      setIsAnonymous(initialData.isAnonymous || false);
      setProtocol(initialData.protocol || 'ftp');
      setPort(initialData.port || 21);
      setUsePassive(initialData.passive !== false);
      setHomeFolder(initialData.homeFolder || '/');
    } else {
      setProfileName('');
      setPcFolder('C:\\Users\\bram\\Documents');
      setFtpAddress('');
      setUserName('');
      setPassword('');
      setIsAnonymous(false);
      setProtocol('ftp');
      setPort(21);
      setUsePassive(true);
      setHomeFolder('/');
    }
    setTestState({ status: 'idle', message: '' });
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleProtocolSelect = (newProtocol) => {
    setProtocol(newProtocol);
    if (newProtocol === 'sftp') {
      setPort(22);
    } else if (newProtocol === 'ftps') {
      setPort(990);
    } else {
      setPort(21);
    }
  };

  const handleAnonymousToggle = (e) => {
    const checked = e.target.checked;
    setIsAnonymous(checked);
    if (checked) {
      setUserName('anonymous');
      setPassword('anonymous@example.com');
    } else {
      if (userName === 'anonymous') setUserName('');
      if (password === 'anonymous@example.com') setPassword('');
    }
  };

  const handleTestConnection = async () => {
    if (!ftpAddress) {
      setTestState({ status: 'error', message: 'Silakan masukkan FTP Address terlebih dahulu.' });
      return;
    }

    setTestState({ status: 'loading', message: `Menghubungkan ke ${ftpAddress}:${port}...` });
    try {
      const config = {
        host: ftpAddress.trim(),
        username: userName.trim(),
        password,
        protocol,
        port: Number(port),
        passive: usePassive,
        isAnonymous
      };
      await api.testFtpConnection(config);
      setTestState({ status: 'success', message: 'Koneksi berhasil! Server merespons OK (220/230).' });
    } catch (err) {
      setTestState({ status: 'error', message: err.message || 'Koneksi gagal terhubung.' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ftpAddress) {
      alert('Silakan masukkan FTP Address');
      return;
    }

    const name = profileName.trim() || ftpAddress.trim();
    const profilePayload = {
      id: initialData?.id || undefined,
      name,
      pcFolder: pcFolder.trim(),
      host: ftpAddress.trim(),
      username: userName.trim(),
      password,
      protocol,
      port: Number(port),
      passive: usePassive,
      homeFolder: homeFolder.trim() || '/',
      isAnonymous
    };

    try {
      const saved = await api.saveProfile(profilePayload);
      
      const localSaved = JSON.parse(localStorage.getItem('ftp_profiles') || '[]');
      const filtered = localSaved.filter(p => p.id !== saved.id);
      filtered.push(saved);
      localStorage.setItem('ftp_profiles', JSON.stringify(filtered));

      if (onConnect) {
        onConnect(saved);
      }
      onClose();
    } catch (err) {
      alert('Gagal menyimpan profil: ' + err.message);
    }
  };

  const quickFolders = [
    { label: 'Documents', path: 'C:\\Users\\bram\\Documents' },
    { label: 'Downloads', path: 'C:\\Users\\bram\\Downloads' },
    { label: 'Desktop', path: 'C:\\Users\\bram\\Desktop' },
    { label: 'Coding', path: 'C:\\Users\\bram\\Documents\\Coding\\FTP' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Title bar */}
        <div className="modal-title-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={16} color="var(--primary)" />
            <span style={{ fontWeight: 600 }}>Create Connection Profile</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Tutup">
            <X size={16} />
          </button>
        </div>

        {/* Subheader Banner */}
        <div className="modal-header-banner">
          <h2>Specify connection details to transfer files between PC folder and FTP account</h2>
          <p>Koneksi yang disimpan dapat diakses langsung kapan saja melalui Quick Connect.</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Left Column: PC Folder */}
            <div className="modal-col">
              <div className="modal-section-title">
                <HardDrive size={20} color="var(--primary)" />
                <span>PC folder</span>
              </div>

              <div className="form-group">
                <label>Profile Name (Label):</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: HotelMercure, Harris, Server Produksi"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Folder PC Lokal:</label>
                <div className="form-row">
                  <input
                    type="text"
                    className="form-input"
                    value={pcFolder}
                    onChange={(e) => setPcFolder(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const pick = prompt('Ketikkan path folder lokal:', pcFolder);
                      if (pick) setPcFolder(pick);
                    }}
                  >
                    Browse...
                  </button>
                </div>
              </div>

              {/* Quick Bookmarks */}
              <div style={{ marginTop: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Quick Folder Shortcuts:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {quickFolders.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      className="btn"
                      style={{
                        padding: '3px 8px',
                        fontSize: '11px',
                        background: pcFolder === q.path ? 'var(--primary-light)' : undefined,
                        borderColor: pcFolder === q.path ? 'var(--primary)' : undefined,
                        color: pcFolder === q.path ? 'var(--primary)' : undefined
                      }}
                      onClick={() => setPcFolder(q.path)}
                    >
                      <Folder size={12} />
                      <span>{q.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="modal-col-divider"></div>

            {/* Right Column: FTP Connection */}
            <div className="modal-col">
              <div className="modal-section-title">
                <Server size={20} color="var(--success)" />
                <span>FTP connection</span>
              </div>

              {/* Protocol selector pills */}
              <div className="protocol-selector">
                <div
                  className={`protocol-pill ${protocol === 'ftp' ? 'active' : ''}`}
                  onClick={() => handleProtocolSelect('ftp')}
                >
                  FTP (Port 21)
                </div>
                <div
                  className={`protocol-pill ${protocol === 'ftps' ? 'active' : ''}`}
                  onClick={() => handleProtocolSelect('ftps')}
                >
                  FTPS SSL/TLS
                </div>
                <div
                  className={`protocol-pill ${protocol === 'sftp' ? 'active' : ''}`}
                  onClick={() => handleProtocolSelect('sftp')}
                >
                  SFTP (SSH Port 22)
                </div>
              </div>

              <div className="form-group">
                <label>FTP Address (Host / IP):</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="IP Address, Domain name atau FTP URL (cth: ftp.example.com)"
                  value={ftpAddress}
                  onChange={(e) => setFtpAddress(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <div className="form-row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <label>User Name:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Username akun FTP"
                      value={userName}
                      disabled={isAnonymous}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '20px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={handleAnonymousToggle}
                    />
                    Anonymous
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Password:</label>
                <div className="form-row" style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    disabled={isAnonymous}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: '36px' }}
                  />
                  {!isAnonymous && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ position: 'absolute', right: '4px', height: '24px', width: '24px', border: 'none', background: 'transparent' }}
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="form-row" style={{ gap: '10px' }}>
                <div className="form-group" style={{ width: '90px' }}>
                  <label>Port:</label>
                  <input
                    type="number"
                    className="form-input"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Home Folder (Optional):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="/HotelMercure"
                    value={homeFolder}
                    onChange={(e) => setHomeFolder(e.target.value)}
                  />
                </div>

                <div style={{ alignSelf: 'flex-end', marginBottom: '14px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleTestConnection}
                    disabled={testState.status === 'loading'}
                  >
                    {testState.status === 'loading' ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </button>
                </div>
              </div>

              <div className="form-row" style={{ justifyContent: 'space-between', margin: '4px 0 10px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={usePassive}
                    onChange={(e) => setUsePassive(e.target.checked)}
                  />
                  Use passive mode (PASV)
                </label>

                <span
                  style={{ color: 'var(--primary)', textDecoration: 'underline', fontSize: '11px', cursor: 'pointer' }}
                  onClick={() => alert('Proxy configuration: Direct connection')}
                >
                  Configure Proxy Settings..
                </span>
              </div>

              {/* Status Alert Banner */}
              {testState.status === 'loading' && (
                <div style={{ padding: '8px 12px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{testState.message}</span>
                </div>
              )}
              {testState.status === 'success' && (
                <div style={{ padding: '8px 12px', background: 'var(--success-light)', color: 'var(--success)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--success)' }}>
                  <CheckCircle2 size={14} />
                  <span>{testState.message}</span>
                </div>
              )}
              {testState.status === 'error' && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--danger)' }}>
                  <AlertTriangle size={14} />
                  <span>{testState.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Next / Connect
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
