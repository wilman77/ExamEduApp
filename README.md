# ExamEduApp

Panel web MVP untuk pengajar mengelola ujian online. Aplikasi ini menyediakan ringkasan aktivitas, daftar dan pencarian ujian, pembuatan ujian sederhana, pratinjau bank soal, serta ringkasan analitik berbasis data contoh.

## Teknologi

- React 18, TypeScript, dan Vite
- Lucide React untuk ikon
- `localStorage` browser untuk menyimpan daftar ujian yang dibuat

## Menjalankan aplikasi

Persyaratan: Node.js 18 atau lebih baru.

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Untuk membuat build produksi:

```bash
npm run build
npm run preview
```

## Fitur MVP

- Dashboard pengajar dan daftar ujian contoh
- Pencarian ujian serta navigasi ke ringkasan, ujian, bank soal, dan analitik
- Form untuk menambahkan ujian dan menyimpannya di browser
- Tampilan responsif untuk desktop dan ponsel

## Batasan

Ini adalah prototipe front-end. Belum ada backend, akun/login, sinkronisasi antarperangkat, penyimpanan soal di server, atau pengamanan ujian. Data contoh hanya untuk demonstrasi; data ujian baru tersimpan di `localStorage` pada browser yang digunakan.
