import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Shield, UserPlus, Trash2, Clock, CalendarPlus, Loader2,
  AlertCircle, CheckCircle2, Users, Infinity as InfinityIcon,
  Pencil, Save, ArrowLeft
} from 'lucide-react';
import * as auth from '../services/auth';

/**
 * Panel Admin: kelola akun pengguna.
 * - Lihat semua akun + masa aktifnya
 * - Buat akun baru (dengan masa aktif)
 * - Perpanjang / set permanen / hapus akun
 */
export default function AdminPanel({ open, onClose }) {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newDuration, setNewDuration] = useState('30'); // '30' | '90' | '365' | '0' = permanen

  // Mode edit per akun (expand inline)
  const [expandedId, setExpandedId] = useState(null);
  const [editRole, setEditRole] = useState('user');
  const [editDays, setEditDays] = useState('30');
  const [editPermanent, setEditPermanent] = useState(false);
  const [editPassword, setEditPassword] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setUsers(await auth.listUsers());
      setError(null);
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar akun.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    if (!newUsername.trim() || newPassword.length < 4) {
      setError('Username wajib & password minimal 4 karakter.');
      return;
    }
    setBusy(true);
    try {
      await auth.createUserByAdmin({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        durationDays: newDuration === '0' ? null : Number(newDuration),
      });
      setNotice(`Akun "${newUsername.trim()}" dibuat.`);
      setNewUsername('');
      setNewPassword('');
      await load();
    } catch (err) {
      setError(err.message || 'Gagal membuat akun.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (u) => {
    if (u.role === 'admin' && users.filter((x) => x.role === 'admin').length <= 1) {
      setError('Tidak boleh menghapus satu-satunya akun admin.');
      return;
    }
    if (!confirm(`Hapus akun "${u.username}"? Profil FTP miliknya tidak ikut terhapus.`)) return;
    setBusy(true);
    try {
      await auth.deleteUser(u.id);
      setNotice(`Akun "${u.username}" dihapus.`);
      await load();
    } catch (err) {
      setError(err.message || 'Gagal menghapus akun.');
    } finally {
      setBusy(false);
    }
  };

  const handleExtend = async (u, days) => {
    setBusy(true);
    try {
      await auth.setUserExpiry(u.id, days);
      setNotice(days === null ? `Akun "${u.username}" dijadikan permanen.` : `Akun "${u.username}" diperpanjang ${days} hari.`);
      await load();
    } catch (err) {
      setError(err.message || 'Gagal mengatur masa aktif.');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (u) => {
    setExpandedId(u.id);
    setEditRole(u.role || 'user');
    setEditPassword('');
    if (!u.expiresAt) {
      setEditPermanent(true);
      setEditDays('30');
    } else {
      setEditPermanent(false);
      const remaining = Math.ceil((new Date(u.expiresAt).getTime() - Date.now()) / 86400000);
      setEditDays(String(Math.max(1, remaining)));
    }
  };

  const saveEdit = async (u) => {
    setBusy(true);
    setError(null);
    try {
      const patch = { role: editRole };
      patch.expiresAt = editPermanent
        ? null
        : new Date(Date.now() + Math.max(1, Number(editDays) || 1) * 86400000).toISOString();
      if (editPassword.trim()) patch.password = editPassword.trim();
      await auth.updateUserDetails(u.id, patch);
      setNotice(`Akun "${u.username}" diperbarui.`);
      setExpandedId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan perubahan.');
    } finally {
      setBusy(false);
    }
  };

  const expiryBadge = (u) => {
    if (!u.expiresAt) return <span className="badge badge-ok"><InfinityIcon size={11} /> Permanen</span>;
    const exp = new Date(u.expiresAt).getTime();
    const days = Math.ceil((exp - Date.now()) / 86400000);
    if (exp < Date.now()) return <span className="badge badge-danger"><AlertCircle size={11} /> Kedaluwarsa</span>;
    if (days <= 3) return <span className="badge badge-warn"><Clock size={11} /> {days} hari lagi</span>;
    return <span className="badge badge-info"><CalendarPlus size={11} /> {days} hari lagi</span>;
  };

  return (
    <div className="admin-page" role="dialog" aria-modal="true" aria-label="Panel Admin">
      {/* Header ala halaman — bukan modal yang terpotong */}
      <header className="admin-page-header">
        <button className="icon-btn admin-back-btn" onClick={onClose} title="Kembali ke aplikasi" aria-label="Kembali ke aplikasi">
          <ArrowLeft size={17} />
        </button>
        <div className="admin-page-title">
          <Users size={18} color="var(--primary)" />
          <div>
            <div className="admin-page-title-text">Panel Admin — Kelola Akun</div>
            <div className="admin-page-subtitle">Kelola akun, masa aktif &amp; reset password</div>
          </div>
        </div>
      </header>

      <div className="admin-page-body">
        <div className="admin-page-inner">
          <form className="admin-create-card" onSubmit={handleCreate}>
            <div className="admin-create-title"><UserPlus size={14} /> Tambah Akun Baru</div>
            <div className="admin-create-grid">
              <div className="form-group">
                <label>Username</label>
                <input className="form-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="cth: budi" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="form-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min. 4 karakter" />
              </div>
              <div className="form-group">
                <label>Peran</label>
                <select className="form-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">Pengguna</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>Masa Aktif</label>
                <select className="form-input" value={newDuration} onChange={(e) => setNewDuration(e.target.value)}>
                  <option value="30">30 hari</option>
                  <option value="90">90 hari</option>
                  <option value="365">1 tahun</option>
                  <option value="0">Permanen</option>
                </select>
              </div>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              <span>Buat Akun</span>
            </button>
          </form>

          {error && <div className="login-alert error"><AlertCircle size={14} /> {error}</div>}
          {notice && <div className="login-alert success"><CheckCircle2 size={14} /> {notice}</div>}

          <div className="admin-user-list">
            <div className="admin-list-head">
              <span>Akun Terdaftar ({users.length})</span>
              {busy && <Loader2 size={13} className="animate-spin" />}
            </div>
            {users.map((u) => (
              <React.Fragment key={u.id}>
              <div className="admin-user-row">
                <div className="admin-user-main">
                  <span className="admin-user-name">{u.username}</span>
                  <span className={`badge ${u.role === 'admin' ? 'badge-admin' : u.role === 'gate' ? 'badge-info' : ''}`}>
                    <Shield size={11} /> {u.role}
                  </span>
                  {expiryBadge(u)}
                </div>
                <div className="admin-user-actions">
                  <button className="btn btn-sm" disabled={busy} onClick={() => handleExtend(u, 30)} title="Perpanjang 30 hari">+30 hari</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => handleExtend(u, 90)} title="Perpanjang 90 hari">+90 hari</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => handleExtend(u, null)} title="Jadikan permanen">Permanen</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => (expandedId === u.id ? setExpandedId(null) : openEdit(u))} title="Edit detail akun"><Pencil size={13} /></button>
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => handleDelete(u)} title="Hapus akun"><Trash2 size={13} /></button>
                </div>
              </div>

              {expandedId === u.id && (
                <div className="admin-user-edit">
                  <div className="admin-edit-grid">
                    <div className="form-group">
                      <label>Peran</label>
                      <select className="form-input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                        <option value="user">Pengguna</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Masa Aktif</label>
                      <div className="admin-edit-expiry">
                        <label className="admin-edit-perm">
                          <input type="checkbox" checked={editPermanent} onChange={(e) => setEditPermanent(e.target.checked)} />
                          <span>Permanen</span>
                        </label>
                        {!editPermanent && (
                          <input
                            type="number"
                            min={1}
                            className="form-input"
                            value={editDays}
                            onChange={(e) => setEditDays(e.target.value)}
                          />
                        )}
                        {!editPermanent && <span className="admin-edit-days">hari lagi</span>}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Reset Password</label>
                      <input
                        className="form-input"
                        type="password"
                        placeholder="Kosongkan jika tidak diganti"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="admin-edit-actions">
                    <button className="btn" disabled={busy} onClick={() => setExpandedId(null)}>Batal</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => saveEdit(u)}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>Simpan Perubahan</span>
                    </button>
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
            {users.length === 0 && !busy && (
              <div className="admin-empty">Belum ada akun terdaftar.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
