# ExamEduApp

Panel web untuk pengajar mengelola ujian online. Frontend menggunakan React 18, TypeScript, Vite, dan Lucide React. API produksi berjalan pada Supabase Edge Functions dengan PostgreSQL; backend Node.js/Express di direktori `server` tetap tersedia untuk pengembangan lokal atau hosting Node.js.

## Akses online

- **Panel guru:** https://exameduapp-wilman77.pages.dev
- **Portal siswa:** https://examportalapp-wilman77.pages.dev

Kedua frontend menggunakan Cloudflare Pages Free. API dan database menggunakan Supabase Free, tanpa kartu atau paket berbayar. Browser mengakses `/api` melalui proxy same-origin; password database tidak dikirim ke frontend.

Pendaftaran siswa tersedia. Pendaftaran pengajar tetap terkunci jika `TEACHER_SIGNUP_CODE` belum ditetapkan pada backend. Jangan membuka pendaftaran guru tanpa kode privat; kode tersebut bukan password database.

## Menjalankan secara lokal

Persyaratan: Node.js 20 atau lebih baru dan PostgreSQL.

1. Siapkan backend:
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```
   Isi `DATABASE_URL` atau field koneksi `PG*`, serta kode privat `TEACHER_SIGNUP_CODE`, lalu jalankan `npm run dev`.
2. Dari akar repositori, pada terminal lain:
   ```bash
   npm install
   npm run dev
   ```
3. Buka `http://localhost:5173`. Portal siswa menggunakan backend yang sama dan berjalan di port 5174.

Vite meneruskan `/api` ke `http://localhost:8787`. Panduan API lokal ada di [server/README.md](server/README.md), dan panduan API produksi ada di [supabase/README.md](supabase/README.md).

## Database produksi dan fitur

Pada database Supabase baru jalankan berurutan migration `server/migrations/001_initial.sql` sampai `005_question_collections.sql`. Untuk database lama, jalankan hanya migration yang belum diterapkan satu kali melalui SQL Editor; migration tersebut non-destruktif. Backend produksi mempertahankan sesi cookie HttpOnly, CORS exact-origin, TLS CA, transaksi, grading, dan timer server.

Fitur yang terhubung:

- Registrasi/masuk pengajar dengan kode undangan, sesi cookie HttpOnly, dan logout.
- Membuat, menyimpan, dan menerbitkan ujian berisi 1–50 soal pilihan ganda dengan 4 atau 5 pilihan.
- Gambar soal JPG/PNG/WebP diproses client menjadi JPEG sebelum dikirim; API hanya menyimpan data URL JPEG base64 valid hingga 115.000 karakter. Body JSON maksimum 6 MiB; permintaan yang terlalu besar ditolak dengan HTTP 413.
- Workspace guru melalui API, dengan `POST` create-if-absent untuk seed satu kali dari cache legacy dan `PUT` untuk pembaruan berikutnya.
- Bank soal nyata: buat, edit, hapus, lihat detail, dan salin koleksi ke ujian. Import `.xlsx` dilakukan client-side memakai template; gambar yang tertanam di Excel tidak ikut diimpor dan dapat diunggah ulang setelahnya.
- Daftar ujian, statistik peserta, dan nilai yang dibaca dari server. Akun, soal, gambar, sesi, jawaban, dan hasil tersimpan di PostgreSQL.

## Deployment Cloudflare Pages

Gunakan branch `main`, build command `npm run build`, dan output directory `dist`. Pages memasang dependensi secara otomatis. Biarkan `VITE_API_URL` tidak disetel agar browser memakai `/api` pada domainnya sendiri.

Set runtime variable `API_ORIGIN` ke `https://yzntkqprdubjmkhzvmad.supabase.co/functions/v1/exam-api`. Pada Supabase, `APP_ORIGINS` harus berisi persis `https://exameduapp-wilman77.pages.dev,https://examportalapp-wilman77.pages.dev`. Cookie sesi tetap host-only, HttpOnly, Secure, dan SameSite=Lax. Jangan memasukkan secret ke repositori atau environment frontend `VITE_*`.

`render.yaml` adalah referensi alternatif lama, bukan deployment produksi yang digunakan di atas. Render dapat meminta verifikasi kartu meskipun paket yang dipilih gratis.

## Batasan yang diketahui

Paket gratis memiliki kuota dan proyek Supabase dapat dijeda karena tidak aktif; setup ini tidak ditujukan untuk ujian kritis. Siapkan backup, kebijakan retensi, dan pengujian keamanan sebelum penggunaan resmi. Aplikasi bukan sistem proctoring atau anti-kecurangan.

> **Akses kelas:** semua siswa terdaftar saat ini dapat melihat semua ujian terbit. Kelas pada form masih label, bukan pembatas akses. Jangan membagikan ujian rahasia per kelas sebelum roster/enrollment ditambahkan.
