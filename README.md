# ExamEduApp

Panel web untuk pengajar mengelola ujian online. Front-end dibuat dengan React 18, TypeScript, Vite, dan Lucide React; backend bersama menggunakan Node.js, Express, dan PostgreSQL.

## Menjalankan secara lokal

Persyaratan: Node.js 20 atau lebih baru.

1. Jalankan backend dari direktori `server`:
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```
   Isi `DATABASE_URL` dengan koneksi PostgreSQL/Supabase dan ganti `TEACHER_SIGNUP_CODE` dengan kode privat, lalu jalankan `npm run dev`.
2. Di terminal lain, dari akar repositori ini jalankan:
   ```bash
   npm install
   npm run dev
   ```
3. Buka alamat Vite (default `http://localhost:5173`). Portal siswa memakai backend yang sama dan berjalan di port 5174; lihat README di repositori `ExamPortalApp`.

Frontend meneruskan permintaan `/api` ke `http://localhost:8787`. Untuk setup non-lokal, atur `VITE_API_URL` pada front-end dan sesuaikan `APP_ORIGINS`, cookie, HTTPS, serta secret di server. Panduan API dan konfigurasi lengkap ada di [server/README.md](server/README.md).

## Fitur yang sudah terhubung

- Registrasi/masuk pengajar dengan kode undangan, sesi cookie HttpOnly, dan logout.
- Membuat ujian yang berisi soal pilihan ganda (1–30 soal), menyimpan sebagai draft, lalu menerbitkan untuk akun siswa.
- Daftar ujian dan statistik peserta/nilai yang dibaca dari server.
- Penyimpanan akun, ujian, soal, sesi, jawaban, dan hasil di PostgreSQL.

## Batasan yang diketahui

Bank soal terpisah dan beberapa pengaturan workspace masih contoh/placeholder. `render.yaml` menyiapkan backend pada Render Free dengan database Supabase PostgreSQL eksternal; URL aktif dan environment tetap harus diselesaikan di platform hosting. Paket gratis dapat tidur/dijeda dan tidak cocok untuk ujian produksi yang kritis. Gunakan HTTPS, pengelolaan secret dan backup yang sesuai sebelum dipakai untuk ujian resmi; backend dasar ini bukan sistem proctoring atau anti-kecurangan.

> **Akses kelas:** semua siswa terdaftar saat ini dapat melihat semua ujian terbit. Kelas pada form masih label, bukan pembatas akses; jangan gunakan untuk membagikan ujian rahasia per kelas sebelum roster/enrollment ditambahkan.

## Deploy frontend ke Cloudflare Pages

Buat Pages project dari repositori ini dengan build command `npm ci && npm run build` dan output directory `dist`. Biarkan `VITE_API_URL` tidak disetel atau kosong agar browser memakai proxy same-origin `/api`. Pada Pages **Settings → Variables and Secrets**, set runtime variable `API_ORIGIN` ke `https://yzntkqprdubjmkhzvmad.supabase.co/functions/v1/exam-api` (HTTPS wajib). Jangan membuat file `.env` berisi secret. Setelah dua project memiliki host produksi `*.pages.dev`, tambahkan kedua origin tersebut secara persis ke `APP_ORIGINS` pada backend Supabase; cookie sesi tetap host-only dan proxy tidak mengubahnya menjadi bearer token. Cloudflare Pages Free dapat dipakai tanpa kartu atau paket berbayar.
