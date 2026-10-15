import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  Play,
  Server,
  Search,
  Folder,
  HardDrive,
  Globe,
  Star,
  LifeBuoy,
  ExternalLink
} from 'lucide-react';

export default function Sidebar({
  profiles,
  activeProfileId,
  onSelectProfile,
  onOpenCreateModal,
  onEditProfile,
  onDeleteProfile,
  onQuickNavigateLocal
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [shortcuts, setShortcuts] = useState([]);

  useEffect(() => {
    api.getLocalShortcuts().then(data => {
      if (Array.isArray(data) && data.length > 0) setShortcuts(data);
    }).catch(() => {});
  }, []);

  const filteredProfiles = profiles.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.host && p.host.toLowerCase().includes(term))
    );
  });

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        {!isCollapsed && <span className="sidebar-title">Quick Connect</span>}
        <button
          className="icon-btn"
          style={{ width: '24px', height: '24px' }}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          {/* Search Box */}
          <div className="sidebar-search">
            <div className="search-input-wrapper">
              <Search size={13} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Cari profil / IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Profile List */}
          <div className="sidebar-list">
            {filteredProfiles.length === 0 ? (
              <div style={{ padding: '16px 8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Tidak ada profil ditemukan.
              </div>
            ) : (
              filteredProfiles.map((prof) => {
                const isActive = activeProfileId === prof.id;
                return (
                  <div
                    key={prof.id}
                    className={`profile-card ${isActive ? 'active' : ''}`}
                    onClick={() => onSelectProfile(prof)}
                    title={`${prof.name} (${prof.host})`}
                  >
                    <div className="profile-card-left">
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isActive ? 'var(--success)' : 'var(--border-strong)',
                          flexShrink: 0
                        }}
                      />
                      <div className="profile-info">
                        <span className="profile-name">{prof.name || prof.host}</span>
                        <span className="profile-host">
                          {prof.protocol?.toUpperCase() || 'FTP'} • {prof.host}
                        </span>
                      </div>
                    </div>

                    <div className="profile-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="profile-action-btn"
                        title="Connect Now"
                        onClick={() => onSelectProfile(prof)}
                      >
                        <Play size={12} fill="var(--success)" color="var(--success)" />
                      </button>
                      <button
                        className="profile-action-btn"
                        title="Edit Profil"
                        onClick={() => onEditProfile(prof)}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="profile-action-btn"
                        title="Hapus Profil"
                        onClick={() => onDeleteProfile(prof.id)}
                      >
                        <Trash2 size={12} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick PC Bookmarks */}
          <div className="sidebar-bookmarks">
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.4px', marginBottom: '2px' }}>
              PC Shortcuts
            </span>
            {shortcuts.map((sc) => (
              <div
                key={sc.path}
                className="bookmark-item"
                onClick={() => onQuickNavigateLocal && onQuickNavigateLocal(sc.path)}
                title={sc.path}
              >
                <Folder size={14} color={sc.name === 'Documents' ? '#f59e0b' : sc.name === 'Downloads' ? '#3b82f6' : '#10b981'} />
                <span>{sc.name}</span>
              </div>
            ))}
          </div>

          {/* New Connection Button Footer */}
          <div style={{ padding: '10px 12px 6px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onOpenCreateModal}>
              <Plus size={14} />
              <span>New Connection</span>
            </button>
            <a
              href="https://linkfly.to/SLStoreClub"
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                width: '100%',
                textDecoration: 'none',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                justifyContent: 'center',
                gap: '6px'
              }}
              title="Bantuan & Dukungan Developer (Salshya | SL Store Official)"
            >
              <LifeBuoy size={13} color="var(--primary)" />
              <span>Bantuan Dev</span>
              <ExternalLink size={10} style={{ opacity: 0.6 }} />
            </a>
          </div>
        </>
      ) : (
        /* Collapsed Sidebar View */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
          <button className="icon-btn" onClick={onOpenCreateModal} title="New Connection">
            <Plus size={16} />
          </button>
          {profiles.map((prof) => (
            <button
              key={prof.id}
              className="icon-btn"
              style={{
                borderColor: activeProfileId === prof.id ? 'var(--primary)' : undefined,
                background: activeProfileId === prof.id ? 'var(--primary-light)' : undefined
              }}
              title={`${prof.name} (${prof.host})`}
              onClick={() => onSelectProfile(prof)}
            >
              <Server size={14} color={activeProfileId === prof.id ? 'var(--primary)' : 'var(--text-muted)'} />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
