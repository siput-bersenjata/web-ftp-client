# CATATAN SETUP — untuk pengembang berikutnya (bisa AI maupun manusia)

Dokumen ini berisi konteks penting agar siapa pun yang melanjutkan proyek ini tidak
perlu menebak dari awal. Baca sampai selesai sebelum mengubah kode.

## 1. Ringkasan Arsitektur

```
┌─────────────────────────── Browser (client/) ───────────────────────────┐
│  React + Vite                                                            │
│  - services/api.js      → endpoint lokal (/api server Node)              │
│                           atau cloud (/api serverless Vercel)            │
│  - services/store.js    → penyimpanan data: Vercel Blob (cloud) atau     │
│                           localStorage (lokal/fallback)                  │
│  - services/auth.js     → login, daftar, admin, hash password            │
│  - services/profiles.js → profil koneksi FTP milik tiap akun             │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
   ┌───────────┴───────────┐
   │  MODE LOKAL           │            │  MODE CLOUD (Vercel)
   │  server/ (Express+WS) │            │  api/ (serverless stateless)
   │  sesi FTP persistent  │            │  koneksi FTP per-request
   │  baca file PC user    │            │  panel lokal = staging browser
   │  data: localStorage   │            │  data: Vercel Blob (lihat §3)
   └───────────────────────┘            └──────────────────────────────
```

Deteksi mode: `api.isCloudMode` (hostname bukan localhost).

## 2. Keputusan Penting (jangan diubah sembarangan)

1. **Kredensial tidak pernah masuk repo.** `data/profiles.json` di-gitignore.
   Profil default di `client/src/services/profiles.js` hanya memuat host/username —
   password sengaja kosong (diisi manual / migrasi otomatis dari device admin).
2. **Password akun di-hash** (SHA-256 + salt). Plaintext tidak pernah disimpan.
   Kredensial admin pertama dibuat lewat layar Setup Awal, bukan ditulis di kode.
3. **Tema**: terang = putih (`--bg-app: #eef1f6`, kartu putih) dan gelap = AMOLED
   murni (`--bg-app: #000000`, tanpa warna abu-abu besar). Efek 3D dari
   bayangan berlapis (`--shadow-*`). Ubah lewat variabel, bukan hardcode.
4. **Vercel serverless tidak bisa**: sesi persistent, WebSocket, akses file PC,
   body request > ~4.5MB. Semua operasi FTP dibuat per-request di `api/`.
5. **Limit Hobby plan**: maksimal **12 Serverless Functions** per deployment.
   Karena itu semua endpoint database digabung jadi SATU fungsi:
   `api/db.js` (routing via field `action`). Jangan memecahnya lagi kecuali
   project upgrade ke Pro.

## 3. DATABASE BERSAMA — Vercel Blob (AKTIF & TERVERIFIKASI)

Sejak Nov 2026, database bersama berjalan di **Vercel Blob privat** (store `ftp-db`,
store id `store_9JAZU8p44kuwNXuG`), terhubung ke project `web-ftp-client`
(env `BLOB_STORE_ID` — kredensial OIDC, tanpa token statis).

Cara kerja:

- Satu file JSON `ftp-db/cloud_db.json` menyimpan `{ _secret, users[], profiles[] }`.
- Akses HANYA lewat `api/db.js` (fungsi tunggal).
- Klien login dengan username+password → server memverifikasi (SHA-256 + salt)
  → mengembalikan **token HMAC** (ditandatangani `_secret` di dalam DB;
  kedaluwarsa 30 hari; otomatis tidak valid jika password berubah).
- Token dibawa di body request; tidak ada kredensial plaintext tersimpan.
- **Admin** menerima seluruh DB; **non-admin** hanya menerima user & profil miliknya
  sendiri (proyeksi dilakukan di server). Endpoint `save` tidak memperbolehkan
  non-admin mengubah akun/role; admin divalidasi harus menyisakan minimal satu
  akun admin.
- **Auto-migrasi**: saat login pertama setelah fitur aktif, jika database server
  masih kosong tapi ada data di localStorage perangkat itu, data (akun + profil +
  password) otomatis disalin ke blob (`action: 'migrate'`) — sekali jalan saja.
- Saat tab/jendela difokuskan, klien memuat ulang database — perubahan dari
  perangkat lain terlihat tanpa reload manual.
- localStorage perangkat dipakai sebagai **mirror** (fallback offline + sumber migrasi).
- **Aturan KONEKSI FTP PER-AKUN (WAJIB DIINGAT):** profil FTP tersimpan dengan
  `ownerId` per akun. User biasa HANYA melihat & memakai profil miliknya sendiri;
  admin melihat semuanya. **Tidak ada mekanisme yang otomatis menyalin koneksi admin
  ke akun user lain** (termasuk Cartenz). Salinan koneksi admin → Cartenz yang dibuat
  pada 11 Nov 2026 (Hasil ekstrak, Harris, Mercure) adalah penyalinan **satu kali**
  atas permintaan eksplisit pemilik proyek. Kalau admin menambah/mengubah/men-hapus
  koneksinya DI KEMUDIAN HARI, perubahan itu TIDAK boleh otomatis berlaku ke Cartenz
  atau user biasa lainnya — setiap akun punya daftarnya sendiri. Kalau suatu saat
  pemilik proyek ingin membagikan koneksi baru ke akun tertentu, penyalinannya harus
  dilakukan secara manual/eksplisit (mis. lewat ownerId di blob), bukan lewat kode.

### Endpoint `api/db.js` (action)

| action    | auth            | fungsi                                       |
|-----------|-----------------|----------------------------------------------|
| status    | —               | `{ storage: 'blob'\|'local', initialized }`  |
| setup     | — (DB kosong)   | buat akun admin pertama                      |
| register  | —               | Daftar akun baru (role user, 30 hari)        |
| login     | username+pass   | verifikasi → `{ token, user, database }`     |
| load      | token           | muat DB (proyeksi sesuai peran)              |
| save      | token           | simpan DB (admin penuh; user = miliknya)     |
| migrate   | — (DB kosong)   | salin DB localStorage → blob (sekali)        |

### Catatan security

- Password akun: SHA-256(salt::password), tidak pernah plaintext.
- Password FTP profil: tersimpan di dalam blob privat (terenkripsi at-rest oleh Vercel),
  hanya bisa dibaca oleh token yang valid (username/password akun aplikasi).
- Token = HMAC — bukan password; tidak memungkinkan dekripsi.
- Non-admin tidak pernah menerima data akun lain.

### Firebase (opsional, tidak dipakai)

`FIREBASE_CONFIG` di `client/src/config/firebaseConfig.js` masih didukung sebagai
jalur alternatif, tapi mode produksi sekarang Vercel Blob. Jika diaktifkan,
mengalahkan Blob (auth.js/store.js cek Firebase lebih dulu).

## 4. Bagian yang Belum Selesai / Rencana Lanjutan

- [ ] Chunked/multipart upload agar file > 4.5MB bisa di-upload di Vercel
      (ide: `POST /api/ftp/upload-chunk` + `APPE` di FTP, atau pakai backend
      non-serverless seperti Railway/Render free tier).
- [ ] Download direktori (folder) sebagai zip di mode cloud.
- [ ] Test otomatis untuk `api/` functions.
- [ ] Batasi jumlah koneksi FTP per user (rate limiting di function).
- [ ] Tombol "Sync sekarang" manual (saat ini refresh-on-focus saja).

## 5. Perintah Berguna

```bash
npm run dev               # jalankan lokal (server + vite)
cd client && npm run build  # build produksi client
vercel --prod --yes       # deploy ke Vercel (CLI, sudah login)
git push                  # push ke GitHub
```

## 6. Struktur Folder

```
api/                 → serverless functions (Vercel)
  _lib/db.js         → helper database bersama (Vercel Blob, token HMAC)
  _lib/ftp.js        → helper koneksi FTP/SFTP stateless
  db.js              → SATU fungsi untuk semua query database (action routing)
  ftp/*.js           → test, list, mkdir, delete, rename, upload, download
server/              → server lokal (Express + WebSocket)
client/src/
  components/        → UI (FilePane, Sidebar, LoginScreen, AdminPanel, ...)
  services/          → api, auth, profiles, store, ws
  config/            → firebaseConfig.js (opsional)
data/                → data lokal (di-gitignore)
```
