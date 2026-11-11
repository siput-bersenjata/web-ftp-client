# Web FTP Client (Dual-Pane) — Cloud Ready

Aplikasi FTP/SFTP dua panel berbasis web: panel kiri untuk file lokal, panel kanan untuk file di
server FTP. Tersedia dua mode:

| Mode | Kapan dipakai | Backend |
|------|--------------|---------|
| **Server Lokal** | Dijalankan dari PC sendiri (`npm start`) | Node.js Express + WebSocket di `server/` |
| **Cloud** | Ketika dibuka lewat link Vercel | Vercel Serverless Functions di `api/` (stateless) |

## Fitur

- Dual-pane file manager (drag & drop, rename, mkdir, delete, filter, sort)
- Upload/download dengan progress
- Sistem akun: login gate, tombol **Daftar** (registrasi mandiri), panel **Admin**
  untuk menambah/menghapus akun dan mengatur masa aktif akun
- Profil koneksi FTP tersinkron antar perangkat (jika Firebase diaktifkan)
- Tema terang (putih) & gelap (AMOLED murni #000) dengan tampilan 3D

## Keamanan

- `data/profiles.json` (berisi kredensial FTP) **di-gitignore** dan tidak pernah ikut ke repo
- Kredensial FTP **tidak pernah disimpan di server** — dikirim dari browser per-request via HTTPS
- Password akun disimpan sebagai SHA-256 + salt (tidak pernah plaintext di kode/repo)
- Tidak ada API key atau secret di dalam repo

## Menjalankan versi lokal

```bash
npm install
cd client && npm install && cd ..
npm run dev        # server :5000 + vite :5173
```

atau jalankan `Jalankan-FTP.bat`.

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com): **Add New → Project → Import** repo ini.
   Framework preset: **Other** (sudah diatur `vercel.json`).
3. Deploy. Fungsi API berada di `api/ftp/*` (basic-ftp + ssh2-sftp-client).

Catatan batasan serverless (Vercel):

- Koneksi FTP dibuat per-request (tidak ada sesi persistent / WebSocket).
- Ukuran upload maksimum per request ±4.5MB (batas body request Vercel).
- Panel lokal menampilkan **staging file dari browser** (pilih/drag file), bukan file PC.
- Log transfer ditampilkan secara lokal di browser.

## Sistem Akun

- Login pertama kali: aplikasi akan meminta **Setup Awal** — buat akun Admin (kelola semua
  akun & masa aktif) dan akun akses bersama (gate login).
- Tombol **Daftar** membuat akun baru (masa aktif default 30 hari, dapat diubah admin).
- **Admin** dapat menambah, menghapus, memperpanjang (+30/+90 hari) atau membuat akun permanen.
- Password disimpan ter-hash; kredensial akun tidak ditulis di kode.

## Firebase (sinkron antar perangkat)

Secara default data (akun & profil FTP) disimpan di `localStorage` per perangkat.
Untuk sinkron antar perangkat, aktifkan Firebase Firestore — gratis:

1. Buat project di [Firebase Console](https://console.firebase.google.com)
2. Tambahkan aplikasi Web → salin config
3. Isi `client/src/config/firebaseConfig.js` (lihat komentar di file tersebut)
4. Aktifkan **Firestore Database**
5. Atur Firestore Rules sementara agar aplikasi bisa mengakses data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users { allow read, write: if true; }
    match /profiles { allow read, write: if true; }
  }
}
```

> Untuk produksi, perkencang rules (mis. hanya izinkan dokumen milik pemilik akun) —
> lihat `CATATAN-SETUP.md`.

## Catatan untuk pengembang berikutnya (AI/manual)

Lihat **`CATATAN-SETUP.md`** — berisi arsitektur, keputusan penting, dan rencana
peningkatan (Firebase, hardening rules, chunked upload untuk file besar).
