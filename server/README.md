# ExamEdu API

API Node.js untuk **ExamEduApp** (pengajar) dan **ExamPortalApp** (siswa). Penyimpanan memakai PostgreSQL; skema dan migration bernomor di `migrations/` diterapkan otomatis saat server mulai. Migration bersifat non-destruktif dan tidak menghapus data. Backend tidak lagi memakai SQLite.

## Menjalankan lokal

Persyaratan: Node.js 20 atau lebih baru dan database PostgreSQL.

```bash
cd server
npm install
cp .env.example .env
# Isi DATABASE_URL atau kelima field PGHOST, PGPORT, PGDATABASE, PGUSER, dan PGPASSWORD; jangan commit file .env.
npm run dev
```

Untuk Supabase, gunakan URL dari **Connect → Session pooler** (port 5432) sebagai `DATABASE_URL`, atau isi konfigurasi terpisah `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, dan `PGPASSWORD`. Format terpisah berguna jika password disediakan sebagai secret opaque dan tidak boleh dimasukkan ke URL. Pastikan `DATABASE_SSL=true`. Server menjalankan semua migration yang belum tercatat pada `schema_migrations` saat startup.

Untuk database yang sudah menjalankan migration versi 1, migration `002_question_options_four_or_five.sql`, `003_workspace_preferences.sql`, `004_question_images.sql`, dan `005_question_collections.sql` diterapkan otomatis oleh `node index.js` (atau dapat dijalankan satu kali lewat SQL Editor). Semuanya non-destruktif dan tidak menghapus data.

Di terminal lain, jalankan kedua frontend (`npm run dev`; ExamPortalApp dapat memakai port 5174). Atur `VITE_API_URL` pada build frontend ke URL backend; saat pengembangan lokal, kosongkan agar Vite memakai proxy `/api` ke port 8787. Guru mendaftar dengan `TEACHER_SIGNUP_CODE`; siswa dapat membuat akun tanpa kode.

## Konfigurasi produksi

Atur variabel di platform hosting, bukan di repositori:

- `DATABASE_URL`: koneksi PostgreSQL Supabase, simpan sebagai secret; alternatifnya, isi lengkap `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, dan `PGPASSWORD` sebagai variabel terpisah.
- `DATABASE_SSL=true` dan `NODE_ENV=production`.
- `APP_ORIGINS`: daftar origin persis aplikasi guru dan siswa, dipisahkan koma. Jangan gunakan `*` karena cookie memakai kredensial.
- `TEACHER_SIGNUP_CODE`: kode undangan privat yang panjang; jangan taruh di kode frontend.
- `COOKIE_SECURE=true` untuk HTTPS. `COOKIE_SAMESITE=lax` cocok jika aplikasi dan API berada pada site yang sama. `none` hanya bila memang lintas-site, harus dipasangkan dengan HTTPS, dan sebagian browser dapat memblokir cookie pihak ketiga.
- `PORT` disediakan oleh Render.

Backend menjalankan satu instance dan membatasi koneksi PostgreSQL (`PG_POOL_SIZE`, default 5). Gunakan session pooler, bukan transaction pooler, untuk backend persisten ini.

## Batas paket gratis

Konfigurasi Render Free + Supabase Free cocok untuk uji coba, bukan layanan ujian produksi yang kritis. Render Free dapat tidur setelah 15 menit tanpa trafik dan butuh sekitar satu menit untuk aktif kembali; filesystem-nya sementara, jadi data aplikasi wajib disimpan di PostgreSQL. Supabase Free menyediakan kuota database terbatas dan dapat menjeda proyek setelah sekitar satu minggu aktivitas database rendah. Tidak ada backup otomatis di paket ini; pantau status proyek dan ekspor cadangan secara berkala. Jangan meningkatkan paket atau mengaktifkan add-on berbayar tanpa persetujuan pemilik.

Tidak ada file SQLite lokal di repo saat migrasi ini, sehingga yang dibuat adalah skema PostgreSQL kosong; tidak ada akun/ujian lokal yang perlu diimpor. Jika ada database SQLite dari lingkungan lain, data tersebut memerlukan proses ekspor-impor tersendiri sebelum digunakan.

## Fitur

- Pendaftaran/login role `teacher`/`student`; password di-hash dengan `scrypt`, sesi disimpan di PostgreSQL, cookie bersifat `HttpOnly`.
- Guru hanya melihat dan mengelola ujian miliknya.
- Workspace guru tersedia melalui `GET/POST/PUT /api/workspace`; POST hanya membuat data pertama, sedangkan PUT menyinkronkan seluruh data.
- Bank soal guru tersedia melalui CRUD `/api/question-collections`; koleksi terikat owner dan penghapusan koleksi tidak mengubah ujian.
- Siswa melihat ujian terbit, memulai satu percobaan per ujian, menyimpan progres, dan melihat kunci/pembahasan setelah dikumpulkan.
- Timer dan penilaian ditetapkan server-side; endpoint login dan penulisan dibatasi. Ujian dan koleksi menerima 1–50 soal, dengan pilihan 4 atau 5 opsi.
- Soal dapat memiliki `imageData` nullable berupa data URL JPEG base64 maksimal 115.000 karakter; body JSON dibatasi 6 MB dan ditolak dengan HTTP 413 jika terlalu besar.

## Endpoint

- `GET /health`
- `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/exams`; `POST /api/exams`; `POST /api/exams/:examId/publish`
- `GET/POST/PUT /api/workspace`
- `GET/POST /api/question-collections`; `GET/PUT/DELETE /api/question-collections/:collectionId`
- `POST /api/exams/:examId/attempts`; `GET /api/attempts/:attemptId`; `PUT /api/attempts/:attemptId/answers`; `POST /api/attempts/:attemptId/submit`

## Batasan akses kelas

Saat ini setiap akun siswa terdaftar dapat melihat semua ujian terbit. Field kelas pada ujian hanya label; backend belum memiliki roster, penugasan siswa, atau kode enrollment per kelas. Jangan menerbitkan materi/ujian yang harus dirahasiakan dari kelas lain sampai pembatasan akses dan proses enrollment ditambah.
