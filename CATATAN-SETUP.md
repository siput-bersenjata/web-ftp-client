# CATATAN SETUP — untuk pengembang berikutnya (bisa AI maupun manusia)

Dokumen ini berisi konteks penting agar siapa pun yang melanjutkan proyek ini tidak
perlu menebak dari awal. Baca sampai selesai sebelum mengubah kode.

## 1. Ringkasan Arsitektur

```
┌─────────────────────────── Browser (client/) ───────────────────────────┐
│  React + Vite                                                            │
│  - services/api.js      → memilih endpoint lokal (/api server Node)      │
│                           atau cloud (/api serverless Vercel)            │
│  - services/store.js    → penyimpanan data (Firestore REST / localStorage)│
│  - services/auth.js     → login, daftar, admin, hash password            │
│  - services/profiles.js → profil koneksi FTP milik tiap akun             │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
   ┌───────────┴───────────┐
   │  MODE LOKAL           │            │  MODE CLOUD (Vercel)
   │  server/ (Express+WS) │            │  api/ (serverless stateless)
   │  sesi FTP persistent  │            │  koneksi FTP per-request
   │  baca file PC user    │            │  panel lokal = staging browser
   └───────────────────────┘            └──────────────────────────────
```

Deteksi mode: `api.isCloudMode` (hostname bukan localhost).

## 2. Keputusan Penting (jangan diubah sembarangan)

1. **Kredensial tidak pernah masuk repo.** `data/profiles.json` di-gitignore.
   Profil default di `server/profileService.js` sengaja dikosongkan — jangan
   pernah menaruh IP/username/password FTP asli di kode sumber.
2. **Password akun di-hash** (SHA-256 + salt, Web Crypto). Plaintext tidak pernah
   disimpan. Kredensial admin/gate pertama dibuat lewat layar Setup Awal,
   bukan ditulis di kode.
3. **Tema**: terang = putih (`--bg-app: #eef1f6`, kartu putih) dan gelap = AMOLED
   murni (`--bg-app: #000000`, tanpa warna abu-abu besar). Efek 3D dari
   bayangan berlapis (`--shadow-*`). Ubah lewat variabel, bukan hardcode.
4. **Vercel serverless tidak bisa**: sesi persistent, WebSocket, akses file PC,
   body request > ~4.5MB. Semua operasi FTP dibuat per-request di `api/`.

## 3. AKTIVASI FIREBASE (PENTING — belum diaktifkan!)

Saat ini integrasi Firebase sudah siap tapi **belum aktif**. Agar daftar akun &
profil FTP sinkron antar perangkat:

1. Buat project gratis di https://console.firebase.google.com
2. **Build → Firestore Database → Create database** (mode production, region terdekat)
3. **Project settings → Your apps → Web app (`</>`)** → salin config
4. Buka `client/src/config/firebaseConfig.js`, isi:
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: 'AIza...',        // dari Firebase config
     authDomain: 'xxx.firebaseapp.com',
     projectId: 'xxx',
   };
   ```
   (apiKey web Firebase boleh publik; keamanan diatur lewat Rules.)
5. Atur **Firestore Rules** (Firestore → Rules):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users { allow read, write: if true; }
       match /profiles { allow read, write: if true; }
     }
   }
   ```
6. Deploy ulang. Layar Setup Awal akan muncul saat pertama dibuka
   (database masih kosong) → buat akun admin & akun akses bersama.

### Hardening Rules (untuk nanti)

Rules di atas sengaja longgar agar cepat berjalan. Untuk produksi yang lebih aman:

- Gunakan Firebase Auth (email/password) + custom claims `role`, atau
- Pindahkan validasi login ke serverless function dengan Admin SDK
  (perlu service account — simpan di Vercel Environment Variables, JANGAN di repo),
- Lalu kunci rules: `allow read, write: if request.auth != null;`

Alternatif DB gratis lain jika Firebase tidak disukai: Supabase (Postgres,
free tier), atau MongoDB Atlas (free tier). Interface di `services/store.js`
tinggal ditambah adapter baru.

## 4. Bagian yang Belum Selesai / Rencana Lanjutan

- [ ] Chunked/multipart upload agar file > 4.5MB bisa di-upload di Vercel
      (ide: `POST /api/ftp/upload-chunk` + `APPE` di FTP, atau pakai backend
      non-serverless seperti Railway/Render free tier).
- [ ] Download direktori (folder) sebagai zip di mode cloud.
- [ ] Session login dengan expired token (bukan localStorage mentah).
- [ ] Profil FTP milik admin terlihat semua user saat ini — pertimbangkan
      fitur "bagikan profil ke akun lain".
- [ ] Test otomatis untuk `api/` functions.
- [ ] Batasi jumlah koneksi FTP per user (rate limiting di function).

## 5. Perintah Berguna

```bash
npm run dev            # jalankan lokal (server + vite)
cd client && npm run build   # build produksi client
vercel deploy          # deploy ke Vercel (CLI, sudah login)
git push               # push ke GitHub
```

## 6. Struktur Folder

```
api/                 → serverless functions (Vercel)
  _lib/ftp.js        → helper koneksi FTP/SFTP stateless
  ftp/*.js           → test, list, mkdir, delete, rename, upload, download
server/              → server lokal (Express + WebSocket)
client/src/
  components/        → UI (FilePane, Sidebar, LoginScreen, AdminPanel, ...)
  services/          → api, auth, profiles, store, ws
  config/            → firebaseConfig.js (ISI DI SINI untuk aktifkan Firebase)
data/                → data lokal (di-gitignore)
```
