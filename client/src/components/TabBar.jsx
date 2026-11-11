import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, X, Sun, Moon, Server, HardDrive, Network, Globe, Clock, LifeBuoy,
  ExternalLink, LogOut, Shield, UserCircle2, Cloud, Menu
} from 'lucide-react';

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenCreateModal,
  theme,
  onToggleTheme,
  user,
  isAdmin = false,
  isCloud = false,
  onLogout,
  onOpenAdmin
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Tutup burger menu saat klik di luar
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <header className="top-navbar">
      {/* Brand Logo & Name */}
      <div className="brand-section">
        <div className="brand-logo">
          <Network size={16} />
        </div>
        <div className="brand-name">
          <span>FTP Web Client</span>
          <span className="brand-badge">Pro</span>
        </div>
      </div>

      {/* Center Tabs Strip */}
      <div className="tab-bar-container" style={{ border: 'none', background: 'transparent', flex: 1, margin: '0 12px' }}>
        <button className="tab-add-btn" onClick={onOpenCreateModal} title="Create New Connection">
          <Plus size={14} />
          <span>New Profile</span>
        </button>

        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              title={`${tab.name} (${tab.host})`}
            >
              <Globe size={13} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tab.name}
              </span>
              <span className="tab-tag">
                {tab.profile?.protocol?.toUpperCase() || 'FTP'}
              </span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Tutup Tab"
              >
                <X size={12} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Right Controls: Bantuan Dev, Live clock, status & Theme toggle */}
      <div className="header-status-group">
        {/* Bantuan Dev Button */}
        <a
          href="https://salshya-club.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-help-dev"
          title="Bantuan & Dukungan Developer (Salshya | SL Store Official)"
        >
          <LifeBuoy size={13} color="var(--primary)" />
          <span>Bantuan Dev</span>
          <ExternalLink size={10} style={{ opacity: 0.7 }} />
        </a>

        {/* Live Clock Widget */}
        <div className="clock-widget" title={formatDate(currentTime)}>
          <Clock size={13} color="var(--primary)" />
          <span>{formatTime(currentTime)}</span>
        </div>

        <div className="live-indicator">
          <div className="pulse-dot" />
          <span>{isCloud ? 'Cloud' : 'Lokal'}</span>
        </div>

        {/* Chip pengguna */}
        <div className="user-chip" title={`Masuk sebagai ${user?.username}`}>
          <UserCircle2 size={15} color="var(--primary)" />
          <span className="user-chip-name">{user?.username}</span>
          {isAdmin && (
            <button className="user-chip-admin" onClick={onOpenAdmin} title="Panel Admin">
              <Shield size={12} />
              <span>Admin</span>
            </button>
          )}
        </div>

        <button className="icon-btn" onClick={onLogout} title="Keluar (Logout)">
          <LogOut size={14} />
        </button>

        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6366f1" />}
        </button>
      </div>

      {/* Burger Menu — tampil saat ruang header sempit (semua aksi pindah ke sini) */}
      <div className="menu-burger-wrap" ref={menuRef}>
        <button
          className="icon-btn header-burger"
          onClick={() => setMenuOpen((v) => !v)}
          title={menuOpen ? 'Tutup menu' : 'Menu lainnya'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={15} /> : <Menu size={15} />}
        </button>

        {menuOpen && (
          <div className="mobile-menu" role="menu">
            <a
              className="menu-item"
              href="https://salshya-club.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              <LifeBuoy size={15} color="var(--primary)" />
              <span>Bantuan Dev</span>
              <small><ExternalLink size={10} /></small>
            </a>

            <div className="menu-item static">
              <Clock size={15} color="var(--primary)" />
              <span>{formatTime(currentTime)}</span>
              <small>{formatDate(currentTime)}</small>
            </div>

            <div className="menu-item static">
              {isCloud
                ? <Cloud size={15} color="var(--success)" />
                : <HardDrive size={15} color="var(--primary)" />}
              <span>{isCloud ? 'Mode Cloud (Vercel)' : 'Mode Lokal'}</span>
            </div>

            <div className="menu-divider" />

            <div className="menu-item static">
              <UserCircle2 size={15} color="var(--primary)" />
              <span className="menu-username" title={`Masuk sebagai ${user?.username}`}>{user?.username}</span>
              {isAdmin && (
                <button
                  className="user-chip-admin menu-admin-btn"
                  onClick={() => { setMenuOpen(false); onOpenAdmin && onOpenAdmin(); }}
                  title="Panel Admin"
                >
                  <Shield size={11} />
                  <span>Admin</span>
                </button>
              )}
            </div>

            <div className="menu-divider" />

            <button className="menu-item" onClick={() => { onToggleTheme && onToggleTheme(); setMenuOpen(false); }}>
              {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6366f1" />}
              <span>{theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}</span>
            </button>

            <button className="menu-item danger" onClick={() => { setMenuOpen(false); onLogout && onLogout(); }}>
              <LogOut size={15} />
              <span>Keluar (Logout)</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

