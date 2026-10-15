import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCw,
  FolderPlus,
  Trash2,
  Folder,
  FileSpreadsheet,
  FileText,
  FileCode,
  Image as ImageIcon,
  Archive,
  File,
  HardDrive,
  Globe,
  Check,
  Search,
  CheckSquare,
  Square,
  Edit2,
  ChevronRight,
  Upload,
  Download,
  Filter,
  WifiOff,
  KeyRound,
  AlertCircle
} from 'lucide-react';

export default function FilePane({
  title,
  type = 'local', // 'local' | 'remote'
  currentPath,
  items = [],
  totalItems = 0,
  isLoading = false,
  selectedItems = [],
  onSelectItems,
  onNavigate,
  onNavigateUp,
  onRefresh,
  onCreateFolder,
  onDeleteItem = null,
  onRenameItem = null,
  onDropTransfer = null,
  recentlyTransferred = [],
  error = null,
  onRetry = null,
  onEditProfile = null,
  onTransferItem = null,
  onTransferSelected = null,
  onDirectUpload = null
}) {
  const fileInputRef = React.useRef(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [inputPath, setInputPath] = useState(currentPath || '');
  const [filterQuery, setFilterQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    setInputPath(currentPath || '');
    setIsEditingPath(false);
  }, [currentPath]);

  const handlePathSubmit = (e) => {
    e.preventDefault();
    if (inputPath && inputPath !== currentPath) {
      onNavigate(inputPath);
      setIsEditingPath(false);
    }
  };

  // Breadcrumbs generation
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    if (type === 'local') {
      // Windows path e.g. C:\Users\bram\Documents
      const normalized = currentPath.replace(/\//g, '\\');
      const parts = normalized.split('\\').filter(Boolean);
      return parts.map((part, idx) => {
        const full = parts.slice(0, idx + 1).join('\\') + (idx === 0 && !parts[0].includes(':') ? '' : idx === 0 ? '\\' : '');
        return { name: part, path: full };
      });
    } else {
      // Unix/FTP path e.g. /HotelMercure/sub
      const parts = currentPath.split('/').filter(Boolean);
      const crumbs = [{ name: '/', path: '/' }];
      parts.forEach((part, idx) => {
        const full = '/' + parts.slice(0, idx + 1).join('/');
        crumbs.push({ name: part, path: full });
      });
      return crumbs;
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (!filterQuery) return true;
    return item.name.toLowerCase().includes(filterQuery.toLowerCase());
  });

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    let valA = a[sortField];
    let valB = b[sortField];
    if (sortField === 'size') {
      valA = valA || 0;
      valB = valB || 0;
      return sortAsc ? valA - valB : valB - valA;
    }
    if (typeof valA === 'string') {
      return sortAsc
        ? valA.localeCompare(valB || '', undefined, { numeric: true, sensitivity: 'base' })
        : (valB || '').localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
    }
    return 0;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleRowClick = (item, e) => {
    if (e.ctrlKey || e.metaKey) {
      if (selectedItems.some((s) => s.path === item.path)) {
        onSelectItems(selectedItems.filter((s) => s.path !== item.path));
      } else {
        onSelectItems([...selectedItems, item]);
      }
    } else if (e.shiftKey && selectedItems.length > 0) {
      const lastIndex = sortedItems.findIndex((i) => i.path === selectedItems[selectedItems.length - 1].path);
      const currentIndex = sortedItems.findIndex((i) => i.path === item.path);
      if (lastIndex >= 0 && currentIndex >= 0) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        onSelectItems(sortedItems.slice(start, end + 1));
      }
    } else {
      onSelectItems([item]);
    }
  };

  const handleToggleSelect = (item, e) => {
    e.stopPropagation();
    if (selectedItems.some((s) => s.path === item.path)) {
      onSelectItems(selectedItems.filter((s) => s.path !== item.path));
    } else {
      onSelectItems([...selectedItems, item]);
    }
  };

  const handleSelectAllToggle = () => {
    if (selectedItems.length === sortedItems.length && sortedItems.length > 0) {
      onSelectItems([]);
    } else {
      onSelectItems(sortedItems);
    }
  };

  const handleDoubleClick = (item) => {
    if (item.isDirectory) {
      onNavigate(item.path);
    } else if (onTransferItem) {
      onTransferItem(item);
    }
  };

  const handleRenameClick = (item) => {
    const target = item || (selectedItems.length === 1 ? selectedItems[0] : null);
    if (!target) return;
    const newName = prompt('Masukkan nama baru:', target.name);
    if (newName && newName.trim() && newName.trim() !== target.name && onRenameItem) {
      onRenameItem(target, newName.trim());
    }
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedItems.some((s) => s.path === item.path)) {
      onSelectItems([item]);
    }
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 150),
      item
    });
  };

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const getFileIcon = (item) => {
    if (item.isDirectory) {
      return (
        <div className="file-badge-icon folder">
          <Folder size={16} fill="#f59e0b" color="#d97706" />
        </div>
      );
    }
    const name = (item.name || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return (
        <div className="file-badge-icon excel">
          <FileSpreadsheet size={15} />
        </div>
      );
    }
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      return (
        <div className="file-badge-icon doc">
          <FileText size={15} />
        </div>
      );
    }
    if (name.endsWith('.pdf')) {
      return (
        <div className="file-badge-icon" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
          <FileText size={15} />
        </div>
      );
    }
    if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz')) {
      return (
        <div className="file-badge-icon archive">
          <Archive size={15} />
        </div>
      );
    }
    if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.json') || name.endsWith('.html') || name.endsWith('.css') || name.endsWith('.py')) {
      return (
        <div className="file-badge-icon code">
          <FileCode size={15} />
        </div>
      );
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg')) {
      return (
        <div className="file-badge-icon image">
          <ImageIcon size={15} />
        </div>
      );
    }
    return (
      <div className="file-badge-icon file">
        <File size={15} />
      </div>
    );
  };

  const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('id-ID', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const selectedTotalSize = selectedItems.reduce((acc, curr) => acc + (curr.size || 0), 0);

  // Drag & drop handlers
  const handleDragStart = (e, item) => {
    const dragPayload = selectedItems.some((s) => s.path === item.path)
      ? selectedItems
      : [item];
    e.dataTransfer.setData('application/json', JSON.stringify({
      sourceType: type,
      items: dragPayload
    }));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    // 1. Files dropped directly from Windows Explorer / desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (type === 'remote' && onDirectUpload) {
        onDirectUpload(Array.from(e.dataTransfer.files));
        return;
      }
    }

    // 2. Drag & drop between panes
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.sourceType !== type && onDropTransfer) {
        onDropTransfer(data.items, currentPath);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  return (
    <div
      className="file-pane"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop animation overlay */}
      {isDragOver && (
        <div className="drop-overlay">
          {type === 'local' ? <Download size={32} /> : <Upload size={32} />}
          <span>Drop file di sini untuk {type === 'local' ? 'Download' : 'Upload'}</span>
        </div>
      )}

      {/* Pane Header */}
      <div className="pane-header">
        <div className="pane-title-wrap">
          {type === 'local' ? <HardDrive size={16} color="var(--primary)" /> : <Globe size={16} color="var(--success)" />}
          <span>{title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isLoading && (
            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RotateCw size={12} className="animate-spin" />
              Loading...
            </span>
          )}
        </div>
      </div>

      {/* Navigation Toolbar */}
      <div className="pane-nav-bar">
        <button className="icon-btn" title="Up Directory" onClick={onNavigateUp}>
          <ArrowUp size={14} />
        </button>
        <button
          className="icon-btn"
          title="Refresh List"
          onClick={onRefresh}
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* Interactive Breadcrumb Bar */}
        <div className="breadcrumbs-container">
          {!isEditingPath ? (
            <>
              {getBreadcrumbs().map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  <div
                    className={`breadcrumb-chip ${idx === getBreadcrumbs().length - 1 ? 'active' : ''}`}
                    onClick={() => onNavigate(crumb.path)}
                    title={crumb.path}
                  >
                    {crumb.name}
                  </div>
                  {idx < getBreadcrumbs().length - 1 && (
                    <ChevronRight size={10} className="breadcrumb-separator" />
                  )}
                </React.Fragment>
              ))}
              <div style={{ flex: 1 }} />
              <button
                className="icon-btn"
                style={{ width: '20px', height: '20px', border: 'none', background: 'transparent' }}
                title="Edit path langsung"
                onClick={() => setIsEditingPath(true)}
              >
                <Edit2 size={11} color="var(--text-muted)" />
              </button>
            </>
          ) : (
            <form onSubmit={handlePathSubmit} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '6px' }}>
              <input
                type="text"
                className="path-edit-input"
                value={inputPath}
                autoFocus
                onChange={(e) => setInputPath(e.target.value)}
                onBlur={() => setIsEditingPath(false)}
              />
              <button type="submit" className="icon-btn" style={{ width: '22px', height: '22px' }}>
                <Check size={12} />
              </button>
            </form>
          )}
        </div>

        {/* Action Tools */}
        {type === 'remote' ? (
          <>
            <button
              className="btn btn-primary"
              style={{ height: '26px', fontSize: '11px', padding: '0 8px', gap: '4px' }}
              title="Upload file dari komputer langsung ke folder FTP ini"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} />
              <span>Upload File</span>
            </button>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0 && onDirectUpload) {
                  onDirectUpload(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
            />
          </>
        ) : (
          <button
            className="btn btn-primary"
            style={{ height: '26px', fontSize: '11px', padding: '0 8px', gap: '4px' }}
            title={selectedItems.length > 0 ? `Upload ${selectedItems.length} item terpilih ke FTP` : 'Pilih file/folder lalu klik Upload'}
            disabled={selectedItems.length === 0}
            onClick={() => onTransferSelected && onTransferSelected()}
          >
            <Upload size={13} />
            <span>Upload {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}</span>
          </button>
        )}

        <button
          className="icon-btn"
          title="Buat Folder Baru"
          onClick={() => {
            const name = prompt('Nama folder baru:');
            if (name && onCreateFolder) onCreateFolder(name);
          }}
        >
          <FolderPlus size={14} />
        </button>
        <button
          className="icon-btn"
          title="Ganti Nama"
          disabled={selectedItems.length !== 1}
          onClick={() => handleRenameClick()}
        >
          <Edit2 size={13} color={selectedItems.length === 1 ? 'var(--primary)' : undefined} />
        </button>
        <button
          className="icon-btn"
          title="Hapus yang Dipilih"
          disabled={selectedItems.length === 0}
          onClick={() => {
            if (selectedItems.length === 0) return;
            if (confirm(`Hapus ${selectedItems.length} file/folder yang dipilih?`)) {
              if (onDeleteItem) onDeleteItem(selectedItems);
            }
          }}
        >
          <Trash2 size={14} color={selectedItems.length > 0 ? 'var(--danger)' : undefined} />
        </button>
      </div>

      {/* File Search Filter Bar */}
      <div className="file-filter-bar">
        <div className="filter-input-wrap">
          <Search size={12} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Filter file dalam folder ini..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          {filterQuery && (
            <button
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setFilterQuery('')}
            >
              ×
            </button>
          )}
        </div>
        {filterQuery && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {filteredItems.length} dari {items.length}
          </span>
        )}
      </div>

      {/* File Table or Error View */}
      <div className="file-table-container">
        {error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              textAlign: 'center',
              height: '100%',
              minHeight: '260px'
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'var(--danger-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
                color: 'var(--danger)'
              }}
            >
              <WifiOff size={26} />
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
              Gagal Terhubung ke Server FTP
            </h3>

            <div
              style={{
                padding: '6px 14px',
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                marginBottom: '12px',
                maxWidth: '90%',
                wordBreak: 'break-all'
              }}
            >
              {typeof error === 'string' ? error : (error?.message || JSON.stringify(error))}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '420px', marginBottom: '18px', lineHeight: 1.5 }}>
              {String(error || '').toLowerCase().includes('authentication methods failed') || String(error || '').toLowerCase().includes('sftp')
                ? 'Server ini menggunakan protokol FTP standar (Port 21), bukan SFTP (Port 22). Silakan klik "Edit Profil" di bawah dan pastikan Protocol dipilih FTP.'
                : String(error || '').toLowerCase().includes('530') || String(error || '').toLowerCase().includes('login') || String(error || '').toLowerCase().includes('password')
                ? 'Autentikasi ditolak oleh server (Username atau Password salah). Silakan periksa kembali kredensial Anda pada Edit Profil.'
                : 'Koneksi ke server terputus atau ditolak. Pastikan alamat host, port, dan koneksi internet Anda aktif.'}
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              {onEditProfile && (
                <button className="btn btn-primary" onClick={onEditProfile}>
                  <KeyRound size={13} />
                  <span>Edit Profil / Password</span>
                </button>
              )}
              {onRetry && (
                <button className="btn" onClick={onRetry}>
                  <RotateCw size={13} />
                  <span>Coba Lagi</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <table className="file-table">
            <thead>
              <tr>
                <th style={{ width: '32px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedItems.length === sortedItems.length && sortedItems.length > 0}
                    onChange={handleSelectAllToggle}
                    title="Pilih Semua"
                  />
                </th>
                <th onClick={() => handleSort('name')} style={{ width: '42%' }}>
                  Nama {sortField === 'name' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('size')} style={{ width: '12%', textAlign: 'right' }}>
                  Ukuran {sortField === 'size' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('modifiedDate')} style={{ width: '22%' }}>
                  Tanggal Modifikasi {sortField === 'modifiedDate' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th onClick={() => handleSort('type')} style={{ width: '16%' }}>
                  Tipe {sortField === 'type' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                {type === 'remote' && (
                  <th style={{ width: '10%' }}>
                    Atribut
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedItems.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={type === 'remote' ? 6 : 5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    {filterQuery ? 'Tidak ada file yang cocok dengan filter.' : 'Folder ini kosong.'}
                  </td>
                </tr>
              )}
            {sortedItems.map((item) => {
              const isSelected = selectedItems.some((s) => s.path === item.path);
              const isRecent = recentlyTransferred && recentlyTransferred.includes(item.name);
              return (
                <tr
                  key={item.path}
                  className={`file-row ${isSelected ? 'selected' : ''} ${isRecent ? 'recent-upload' : ''}`}
                  onClick={(e) => handleRowClick(item, e)}
                  onDoubleClick={() => handleDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                >
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggleSelect(item, e)}
                    />
                  </td>
                  <td>
                    <div className="file-name-cell">
                      {getFileIcon(item)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                      {isRecent && (
                        <span style={{
                          fontSize: '9px',
                          background: '#10b981',
                          color: '#ffffff',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          marginLeft: '6px',
                          letterSpacing: '0.4px',
                          flexShrink: 0
                        }}>
                          BARU
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatSize(item.size)}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatDate(item.modifiedDate)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.type}</td>
                  {type === 'remote' && (
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {typeof item.attribute === 'string'
                        ? item.attribute
                        : item.attribute
                        ? JSON.stringify(item.attribute)
                        : (item.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--')}
                    </td>
                  )}
                </tr>
              );
            })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status Bar */}
      <div className="pane-status-bar">
        <span>Total: {totalItems} item</span>
        {selectedItems.length > 0 && (
          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
            Terpilih: {selectedItems.length} item {selectedTotalSize > 0 && `(${formatSize(selectedTotalSize)})`}
          </span>
        )}
      </div>

      {/* Context Menu Popup */}
      {contextMenu && (
        <div
          className="context-menu-popup"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 9999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              if (onTransferItem) onTransferItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            {type === 'local' ? <Upload size={13} color="var(--primary)" /> : <Download size={13} color="var(--success)" />}
            <span>{type === 'local' ? 'Upload ke FTP' : 'Download ke PC'}</span>
          </div>
          {contextMenu.item.isDirectory && (
            <div
              className="context-menu-item"
              onClick={() => {
                onNavigate(contextMenu.item.path);
                setContextMenu(null);
              }}
            >
              <Folder size={13} color="#f59e0b" />
              <span>Buka Folder</span>
            </div>
          )}
          <div
            className="context-menu-item"
            onClick={() => {
              handleRenameClick(contextMenu.item);
              setContextMenu(null);
            }}
          >
            <Edit2 size={13} />
            <span>Ganti Nama</span>
          </div>
          <div
            className="context-menu-item danger"
            onClick={() => {
              if (confirm(`Hapus ${contextMenu.item.name}?`)) {
                if (onDeleteItem) onDeleteItem([contextMenu.item]);
              }
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} color="var(--danger)" />
            <span>Hapus</span>
          </div>
        </div>
      )}
    </div>
  );
}
