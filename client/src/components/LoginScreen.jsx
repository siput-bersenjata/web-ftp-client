import React, { useState, useEffect } from 'react';
import {
  Network, Lock, User, UserPlus, Shield, Moon, Sun, KeyRound,
  AlertCircle, CheckCircle2, Loader2, ArrowRight, Info
} from 'lucide-react';
import * as auth from '../services/auth';
import { storageMode } from '../services/store';

/**
 * Layar Login / Daftar / Setup Awal.
 * - Setup awal hanya muncul saat database akun masih kosong.
 * - "Daftar" membuat akun sendiri (default masa aktif 30 hari, diatur admin).
 */
export default function LoginScreen({ onLoggedIn, theme, onToggleTheme }) {
  const [stage, setStage] = useState('checking'); // checking | setup | login
  const [tab, setTab] = useState('login'); // login | register
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [gateUser, setGateUser] = useState('Cartenz');
  const [gatePass, setGatePass] = useState('');
  const [gateConfirm, setGateConfirm] = useState('');

  useEffect(() => {
    auth.isInitialized()
      .then((initialized) => setStage(initialized ? 'login' : 'setup'))
      .catch((err) => {
        setError(err.message || 'Gagal membaca database. Pastikan config Firebase / Rules sudah benar.');
        setStage('login');
      });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await auth.login({ username, password });
      onLoggedIn(user);
    } catch (err) {
      setError(err.message || 'Login gagal.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    if (!regUsername.trim()) return setError('Masukkan username.');
    if (regPassword.length < 4) return setError('Password minimal 4 karakter.');
    if (regPassword !== regConfirm) return setError('Konfirmasi password tidak sama.');
    setBusy(true);
    try {
      await auth.register({ username: regUsername, password: regPassword });
      setInfo('Akun berhasil dibuat! Silakan login. Masa aktif default 30 hari (dapat diatur admin).');
      setTab('login');
      setUsername(regUsername);
      setPassword('');
    } catch (err) {
      setError(err.message || 'Gagal mendaftar.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setError(null);
    if (!adminUser.trim() || adminPass.length < 4) return setError('Password admin minimal 4 karakter.');
    if (adminPass !== adminConfirm) return setError('Konfirmasi password admin tidak sama.');
    if (gateUser.trim() && gatePass !== gateConfirm) return setError('Konfirmasi password akun akses tidak sama.');
    setBusy(true);
    try {
      await auth.initializeIfEmpty({
        adminUsername: adminUser,
        adminPassword: adminPass,
        gateUsername: gateUser,
        gatePassword: gatePass,
      });
      setStage('login');
      setInfo('Setup selesai! Silakan login dengan akun yang baru dibuat.');
    } catch (err) {
      setError(err.message || 'Setup gagal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-bg-deco" aria-hidden="true" />
      <button className="icon-btn login-theme-btn" onClick={onToggleTheme} title="Ganti tema">
        {theme === 'dark' ? <Sun size={16} color="#f59e0b" /> : <Moon size={16} />}
      </button>

      <div className="login-card">
        <div className="login-brand">
          <div className="brand-logo login-logo"><Network size={22} /></div>
          <h1>FTP Web Client</h1>
          <p>Kelola file server FTP Anda dari mana saja</p>
        </div>

        {stage === 'checking' && (
          <div className="login-checking">
            <Loader2 size={20} className="animate-spin" />
            <span>Memuat sistem akun...</span>
          </div>
        )}

        {stage === 'setup' && (
          <form className="login-form" onSubmit={handleSetup}>
            <div className="login-setup-info">
              <Info size={15} />
              <span>
                Setup awal: buat akun admin &amp; akun akses bersama pertama.
                {storageMode === 'local' && ' Saat ini memakai penyimpanan lokal — aktifkan Firebase agar sinkron antar perangkat.'}
              </span>
            </div>

            <div className="login-section-label"><Shield size={13} /> Akun Admin (kelola semua akun)</div>
            <div className="form-group">
              <label>Username Admin</label>
              <div className="login-input-wrap">
                <User size={14} />
                <input value={adminUser} onChange={(e) => setAdminUser(e.target.value)} required />
              </div>
            </div>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Password Admin</label>
                <div className="login-input-wrap">
                  <KeyRound size={14} />
                  <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} required minLength={4} placeholder="min. 4 karakter" />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Konfirmasi</label>
                <div className="login-input-wrap">
                  <KeyRound size={14} />
                  <input type="password" value={adminConfirm} onChange={(e) => setAdminConfirm(e.target.value)} required />
                </div>
              </div>
            </div>

            <div className="login-section-label"><Lock size={13} /> Akun Akses Bersama (gate login)</div>
            <div className="form-row" style={{ gap: 8 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Username</label>
                <div className="login-input-wrap">
                  <User size={14} />
                  <input value={gateUser} onChange={(e) => setGateUser(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Password</label>
                <div className="login-input-wrap">
                  <KeyRound size={14} />
                  <input type="password" value={gatePass} onChange={(e) => setGatePass(e.target.value)} placeholder="min. 4 karakter" />
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Konfirmasi</label>
                <div className="login-input-wrap">
                  <KeyRound size={14} />
                  <input type="password" value={gateConfirm} onChange={(e) => setGateConfirm(e.target.value)} />
                </div>
              </div>
            </div>

            {error && <div className="login-alert error"><AlertCircle size={14} /> {error}</div>}

            <button className="btn btn-primary login-submit" disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              <span>Simpan Setup &amp; Lanjut</span>
            </button>
          </form>
        )}

        {stage === 'login' && (
          <>
            <div className="login-tabs">
              <button className={`login-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); setError(null); }}>
                <Lock size={14} /> Masuk
              </button>
              <button className={`login-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); setError(null); }}>
                <UserPlus size={14} /> Daftar
              </button>
            </div>

            {tab === 'login' && (
              <form className="login-form" onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Username</label>
                  <div className="login-input-wrap">
                    <User size={14} />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Masukkan username"
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="login-input-wrap">
                    <KeyRound size={14} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password"
                      required
                    />
                  </div>
                </div>
                {error && <div className="login-alert error"><AlertCircle size={14} /> {error}</div>}
                {info && <div className="login-alert success"><CheckCircle2 size={14} /> {info}</div>}
                <button className="btn btn-primary login-submit" disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                  <span>Masuk ke Aplikasi</span>
                </button>
                <p className="login-footnote">
                  Belum punya akun? Klik tab <b>Daftar</b> untuk membuat akses sendiri.
                </p>
              </form>
            )}

            {tab === 'register' && (
              <form className="login-form" onSubmit={handleRegister}>
                <div className="form-group">
                  <label>Username Baru</label>
                  <div className="login-input-wrap">
                    <User size={14} />
                    <input value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Pilih username" autoFocus required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="login-input-wrap">
                    <KeyRound size={14} />
                    <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Min. 4 karakter" required minLength={4} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Konfirmasi Password</label>
                  <div className="login-input-wrap">
                    <KeyRound size={14} />
                    <input type="password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} required />
                  </div>
                </div>
                {error && <div className="login-alert error"><AlertCircle size={14} /> {error}</div>}
                <button className="btn btn-primary login-submit" disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                  <span>Buat Akun</span>
                </button>
                <p className="login-footnote">
                  Akun baru mendapat masa aktif 30 hari dan dapat membuat koneksi FTP sendiri.
                  Admin dapat memperpanjang atau menghapus akun.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
