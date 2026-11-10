# Deployment gratis: Supabase Edge + Cloudflare Pages

API bersama berada di `functions/exam-api/index.ts`. API memakai PostgreSQL yang sama dengan backend Node di `server/`, mempertahankan kontrak `/api/...`, autentikasi cookie HttpOnly, transaksi penilaian, dan waktu ujian berbasis server.

## Database dan API

Pada database Supabase baru, jalankan berurutan `server/migrations/001_initial.sql`, `002_question_options_four_or_five.sql`, `003_workspace_preferences.sql`, `004_question_images.sql`, dan `005_question_collections.sql` sebelum API dipakai. Pada database lama yang sudah berada pada versi sebelumnya, jalankan migration yang belum diterapkan satu kali melalui SQL Editor; semuanya non-destruktif dan tidak menghapus data. Migration 003 menambah preferensi workspace, 004 menambah gambar soal JPEG, dan 005 menambah bank soal milik guru. Tabel aplikasi memakai Row Level Security tanpa kebijakan akses langsung browser; API mengakses database melalui koneksi server, bukan Data API publik.

Deploy fungsi bernama `exam-api`, dengan `verify_jwt = false` sesuai `config.toml`. JWT gateway Supabase sengaja tidak dipakai karena API memverifikasi cookie sesi sendiri pada setiap route yang membutuhkan akun; jangan menghapus autentikasi aplikasi.

## Environment fungsi

- `SUPABASE_DB_URL`: disediakan otomatis oleh Supabase dan dipakai jika `DATABASE_URL` / `PGHOST` tidak diatur. Jangan salin nilainya ke frontend.
- `DATABASE_CA_CERT`: opsional untuk rotasi CA. Source menyertakan CA publik Supabase Root 2021 yang berlaku hingga 26 April 2031; unduh penggantinya dari Database Settings > SSL configuration > Download certificate. Verifikasi sertifikat dan hostname tetap aktif.
- `PG_POOL_SIZE`: default `1` untuk isolate serverless pada paket Free.
- `APP_ORIGINS`: URL HTTPS frontend produksi, dipisah koma; hanya origin yang benar-benar digunakan yang boleh dicantumkan. CORS mencocokkan origin secara persis dan mendukung `DELETE` untuk bank soal.
- `SESSION_COOKIE_SECURE=true` dan `SESSION_COOKIE_SAMESITE=lax`.
- `TEACHER_SIGNUP_CODE`: kode undangan rahasia untuk pendaftaran pengajar. Jika tidak diisi, registrasi pengajar ditutup; registrasi siswa tetap dapat digunakan. Jangan memakai password database untuk kode ini.

Koneksi PostgreSQL eksplisit juga didukung melalui `DATABASE_URL` atau field `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Gunakan TLS produksi; jangan mengatur `DATABASE_SSL=false` untuk koneksi publik.

Endpoint kesehatan: `https://<project-ref>.supabase.co/functions/v1/exam-api/health`.

## Workspace dan bank soal

Workspace guru tersedia melalui `GET/POST/PUT /api/workspace`. `POST` hanya membuat data pertama (create-if-absent, tidak pernah menimpa); `PUT` menyimpan seluruh data milik guru. Jika sebelumnya frontend memakai cache workspace legacy, lakukan satu kali seed dengan `POST` memakai nilai cache yang sudah dinormalisasi, lalu gunakan API sebagai sumber data utama.

Bank soal tersedia melalui CRUD `/api/question-collections`: buat, lihat daftar, lihat detail, edit, hapus, dan salin soal ke ujian. Koleksi terikat owner; guru lain menerima 404 dan siswa menerima 403. Menghapus koleksi tidak mengubah ujian yang sudah menyalin soalnya. Ujian dan koleksi menerima 1–50 soal, dengan 4 atau 5 pilihan jawaban.

Gambar soal dikirim sebagai `imageData` data URL JPEG base64 yang valid, maksimal 115.000 karakter, dan disimpan di database. Client boleh menerima JPG/PNG/WebP lalu mengompresnya menjadi JPEG sebelum upload; API hanya menerima JPEG canonical dengan marker SOI/EOI. Body JSON API dibatasi 6 MiB dan body terlalu besar mendapat HTTP 413.

## Kedua frontend

Buat satu Cloudflare Pages project untuk masing-masing repo. Build command `npm run build`, output directory `dist`, production branch `main`. Kosongkan / jangan set `VITE_API_URL` agar browser menggunakan `/api` pada domain frontend sendiri.

Atur runtime environment `API_ORIGIN=https://<project-ref>.supabase.co/functions/v1/exam-api` di kedua Pages project. `functions/api/[[path]].ts` meneruskan request API dan cookie ke fungsi Supabase. `public/_routes.json` membatasi eksekusi Pages Functions ke `/api/*`, sehingga asset statis tidak menghabiskan kuota Function.

Cookie tidak diubah menjadi bearer token dan tidak disimpan di localStorage. Cookie tiap frontend bersifat host-only, sehingga login pada portal guru dan siswa tetap terpisah.

## Uji dan batasan

Untuk uji Deno lokal, gunakan `EXAM_LOCAL_PORT` dan database PostgreSQL sintetis. `server/test/integration.mjs` dapat diarahkan ke adapter melalui `API_BASE_URL`; variabel `DATABASE_URL` untuk pembersihan data uji dan `TEACHER_SIGNUP_CODE` juga diperlukan. Jangan menjalankan pengujian terhadap data pengguna nyata tanpa pemisahan dan pembersihan akun sintetis.

Rate limit di adapter bersifat best-effort per isolate, bukan limit global terdistribusi. Paket gratis tetap memiliki kuota, tanpa kartu dan tanpa paket berbayar; Supabase dapat menjeda proyek tidak aktif. Semua akun siswa masih dapat melihat seluruh ujian terbit; pembatasan kelas belum tersedia.
