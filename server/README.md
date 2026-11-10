# ExamEdu API

API Node.js + SQLite untuk **ExamEduApp** (pengajar) dan **ExamPortalApp** (siswa). Database dibuat otomatis pada `data/examedu.sqlite`. Akun, ujian, soal, sesi, jawaban, dan nilai disimpan server-side.

## Menjalankan lokal

Persyaratan: Node.js 20 atau lebih baru.

```bash
cd server
npm install
cp .env.example .env
# Ubah TEACHER_SIGNUP_CODE menjadi kode undangan privat.
npm run dev
```

Di terminal lain, jalankan front-end ExamEduApp (`npm run dev`, default port 5173) dan ExamPortalApp (`npm run dev -- --port 5174`). Kedua server Vite meneruskan `/api` ke port 8787. Guru mendaftar dengan kode undangan yang sama persis dengan `TEACHER_SIGNUP_CODE`; siswa dapat membuat akun tanpa kode.

## Konfigurasi

`PORT` menentukan port API; `DATABASE_PATH` menentukan file SQLite. `APP_ORIGINS` adalah daftar origin browser yang diizinkan, dipisah koma. Pada deployment, ganti dengan origin resmi kedua aplikasi. `TEACHER_SIGNUP_CODE` wajib disetel untuk mengaktifkan registrasi guru; jangan taruh nilainya di kode front-end atau repositori. Atur sebagai secret environment pada host backend.

Cookie sesi bersifat `HttpOnly`, berlaku 7 hari, dan memakai `SameSite=Lax` secara default. Bila API dan aplikasi berada pada site berbeda, semuanya harus memakai HTTPS dan konfigurasi `COOKIE_SAMESITE=none` serta `COOKIE_SECURE=true`; browser pihak ketiga masih dapat memblokir cookie lintas-site, jadi sebaiknya gunakan domain/site yang sama atau reverse proxy `/api` ke API.

## Fitur yang tersedia

- Pendaftaran dan login role `teacher`/`student`; password di-hash dengan `scrypt`, sesi disimpan di SQLite dan cookie tidak dapat dibaca JavaScript.
- Guru hanya dapat melihat dan mengelola ujian miliknya. Pembuatan ujian menyertakan 1–30 soal pilihan ganda, lalu ujian diterbitkan secara eksplisit.
- Siswa hanya melihat ujian terbit, memulai satu percobaan per ujian, menyimpan progres ke server, dan melihat kunci/pembahasan setelah dikumpulkan.
- Timer ditetapkan server berdasarkan durasi; skor dihitung server-side. API membatasi permintaan login dan penulisan.

## Endpoint

- `GET /health`
- `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/exams`; `POST /api/exams`; `POST /api/exams/:examId/publish`
- `POST /api/exams/:examId/attempts`; `GET /api/attempts/:attemptId`; `PUT /api/attempts/:attemptId/answers`; `POST /api/attempts/:attemptId/submit`

## Catatan produksi

Ini backend self-hosted yang siap dijalankan, **belum dipasang atau dideploy pada hosting publik**. Sebelum ujian resmi: gunakan HTTPS dan domain tepercaya, setel `APP_ORIGINS`/secret pada platform hosting, siapkan backup SQLite dan pemantauan, tinjau kebijakan retensi data, dan lakukan uji beban serta uji keamanan. Backend ini menyediakan penyimpanan dan penilaian dasar; bukan sistem pengawasan/anti-kecurangan atau pemenuhan regulasi pendidikan tertentu.

## Batasan akses kelas

Saat ini setiap akun siswa yang terdaftar dapat melihat semua ujian terbit. Field kelas pada ujian hanya label; backend belum memiliki roster, penugasan siswa, atau kode enrollment per kelas. Jangan menerbitkan materi/ujian yang harus dirahasiakan dari kelas lain sampai pembatasan akses dan proses enrollment ditambahkan.
