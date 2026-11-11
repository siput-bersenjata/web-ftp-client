/**
 * KONFIGURASI FIREBASE
 * =====================
 * Isi nilai di bawah ini dengan config dari Firebase Console:
 *   1. Buka https://console.firebase.google.com
 *   2. Buat/pilih project → ikon roda gigi → Setelan project
 *   3. Di bagian "Aplikasi Anda", tambahkan aplikasi Web (</>) jika belum ada
 *   4. Salin nilai config ke sini
 *   5. Aktifkan Firestore Database (Build → Firestore Database → Create)
 *   6. Atur Rules Firestore agar aplikasi boleh mengakses data
 *      (lihat catatan di README.md / CATATAN-SETUP.md)
 *
 * Semua nilai ini BOLEH dipublikasikan (config web Firebase bukan rahasia —
 * keamanannya diatur lewat Firestore Rules, bukan dengan menyembunyikan key).
 * JANGAN menaruh password/admin di file ini.
 *
 * Catatan untuk pengembang berikutnya:
 *   - Jika null/false, aplikasi memakai penyimpanan localStorage (per perangkat).
 *   - Jika diisi, akun & daftar profil FTP tersinkron antar perangkat lewat
 *     Firestore (REST API, tanpa SDK).
 */
export const FIREBASE_CONFIG = null; // contoh: { apiKey: '...', projectId: '...' }
