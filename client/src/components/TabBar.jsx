import React, { useState, useEffect } from 'react';
import { Plus, X, Sun, Moon, Server, HardDrive, Network, Globe, Clock, LifeBuoy, ExternalLink } from 'lucide-react';

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenCreateModal,
  theme,
  onToggleTheme
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

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
          href="https://linkfly.to/SLStoreClub"
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
          <span>Online</span>
        </div>

        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6366f1" />}
        </button>
      </div>
    </header>
  );
}

