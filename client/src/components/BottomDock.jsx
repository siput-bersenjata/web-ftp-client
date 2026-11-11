import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Terminal,
  Activity,
  Copy,
  Check,
  Search,
  RotateCcw
} from 'lucide-react';

export default function BottomDock({
  logs = [],
  queue = [],
  onRemoveTask,
  onMoveTask,
  onClearFinished
}) {
  const [activeTab, setActiveTab] = useState('queue'); // 'log' | 'queue'
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    if (activeTab === 'log' && autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab, autoScroll]);

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusClass = (status) => {
    if (status === 'Completed') return 'completed';
    if (status === 'Failed' || status === 'Cancelled') return 'failed';
    return '';
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    if (!logFilter) return true;
    return l.message.toLowerCase().includes(logFilter.toLowerCase());
  });

  const activeTransfersCount = queue.filter((t) => t.status === 'Transferring' || t.status === 'Queued').length;

  return (
    <div className={`bottom-dock ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Dock Header Tabs */}
      <div className="dock-header-bar">
        <div className="dock-tabs">
          <div
            className={`dock-tab ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('queue');
              setIsCollapsed(false);
            }}
          >
            <Activity size={14} />
            <span>Transfer Queue</span>
            {activeTransfersCount > 0 && (
              <span
                style={{
                  fontSize: '10px',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700
                }}
              >
                {activeTransfersCount}
              </span>
            )}
          </div>

          <div
            className={`dock-tab ${activeTab === 'log' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('log');
              setIsCollapsed(false);
            }}
          >
            <Terminal size={14} />
            <span>Transfer Log</span>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--success)'
              }}
            />
          </div>
        </div>

        <button
          className="icon-btn"
          style={{ width: '26px', height: '26px' }}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Perbesar Panel' : 'Perkecil Panel'}
        >
          {isCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Controls Bar */}
          <div className="dock-controls-bar">
            {activeTab === 'queue' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    className="btn"
                    disabled={!selectedQueueId}
                    onClick={() => {
                      if (selectedQueueId) onRemoveTask(selectedQueueId);
                    }}
                    title="Hapus antrian terpilih"
                  >
                    <Trash2 size={13} color="var(--danger)" />
                    <span>Hapus</span>
                  </button>
                  <button
                    className="btn"
                    disabled={!selectedQueueId}
                    onClick={() => {
                      if (selectedQueueId) onMoveTask(selectedQueueId, 'up');
                    }}
                    title="Pindahkan ke atas"
                  >
                    <ArrowUp size={13} />
                    <span>Pindah Atas</span>
                  </button>
                  <button
                    className="btn"
                    disabled={!selectedQueueId}
                    onClick={() => {
                      if (selectedQueueId) onMoveTask(selectedQueueId, 'down');
                    }}
                    title="Pindahkan ke bawah"
                  >
                    <ArrowDown size={13} />
                    <span>Pindah Bawah</span>
                  </button>
                  <button className="btn" onClick={onClearFinished} title="Bersihkan yang sudah selesai">
                    <CheckSquare size={13} />
                    <span>Hapus Selesai</span>
                  </button>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Total antrian: {queue.length} item
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div className="search-input-wrapper" style={{ maxWidth: '280px', height: '26px' }}>
                    <Search size={12} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Cari dalam log..."
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                    />
                    Auto Scroll
                  </label>
                </div>

                <button className="btn" onClick={handleCopyLogs} title="Salin semua log">
                  {copied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  <span>{copied ? 'Tersalin' : 'Salin Log'}</span>
                </button>
              </>
            )}
          </div>

          {/* Dock Content */}
          <div className="dock-content">
            {activeTab === 'log' ? (
              <div className="log-terminal">
                {filteredLogs.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Belum ada log aktivitas. Siap untuk koneksi.</div>
                ) : (
                  filteredLogs.map((entry, idx) => {
                    const msg = entry.message || '';
                    let msgClass = '';
                    if (msg.includes('530') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
                      msgClass = 'error';
                    } else if (msg.includes('220') || msg.includes('230') || msg.includes('226') || msg.includes('250')) {
                      msgClass = 'success';
                    } else if (msg.startsWith('PASV') || msg.startsWith('LIST') || msg.startsWith('STOR') || msg.startsWith('RETR')) {
                      msgClass = 'cmd';
                    }
                    return (
                      <div key={idx} className="log-entry">
                        <span className="log-time">[{entry.timestamp || '00:00:00'}]</span>
                        <span className={`log-msg ${msgClass}`}>{msg}</span>
                      </div>
                    );
                  })
                )}
                <div ref={logEndRef} />
              </div>
            ) : (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>File</th>
                    <th style={{ width: '18%' }}>Progress & Status</th>
                    <th style={{ width: '25%' }}>Source</th>
                    <th style={{ width: '25%' }}>Destination</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Ukuran</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        Antrian transfer kosong. Pilih file dan klik tombol panah atau seret (drag & drop) untuk mentransfer.
                      </td>
                    </tr>
                  ) : (
                    queue.map((task) => {
                      const isSelected = selectedQueueId === task.id;
                      return (
                        <tr
                          key={task.id}
                          className={`file-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedQueueId(task.id)}
                        >
                          <td style={{ fontWeight: 600 }}>{task.name}</td>
                          <td>
                            <div className="queue-progress-bar">
                              <div
                                className={`queue-progress-fill ${getStatusClass(task.status)}`}
                                style={{ width: `${task.progress || (task.status === 'Completed' ? 100 : 0)}%` }}
                              />
                              <div className="queue-progress-text">
                                {task.status === 'Transferring'
                                  ? `${task.progress}% ${task.speed ? `• ${task.speed}` : ''}`
                                  : task.status}
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.sourcePath}>
                            {task.isTempFile ? `[Komputer / Browser] ${task.name}` : task.sourcePath}
                          </td>
                          <td style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {task.destinationPath}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatSize(task.size)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
