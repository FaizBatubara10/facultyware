# FTI Meeting

FTI Meeting adalah sistem web pengelolaan rapat yang dikembangkan untuk membantu proses administrasi meeting di lingkungan Fakultas Teknologi Informasi. Sistem ini mendukung pengelolaan jadwal meeting, peserta, undangan, kehadiran, notulensi, dokumentasi, export rekap kehadiran, serta penyediaan REST API.

Project ini dikembangkan untuk memenuhi Tugas Besar mata kuliah Pemrograman Web.

## Identitas Project

Nama sistem: FTI Meeting  
Kelompok: A16  
Jenis project: Sistem Web Pengelolaan Rapat  
Repository GitHub: https://github.com/FaizBatubara10/facultyware  
Link deployment: https://ftimeeta-16.my.id  

## Teknologi yang Digunakan

Sistem web FTI Meeting dikembangkan menggunakan beberapa teknologi berikut:

- ExpressJS sebagai backend.
- Node.js sebagai runtime.
- MySQL/MariaDB sebagai database.
- mysql2 sebagai library koneksi database tanpa ORM.
- EJS sebagai template engine.
- Basecoat UI sebagai pendukung tampilan antarmuka.
- ExcelJS untuk export rekap kehadiran.
- Playwright untuk testing.
- Git dan GitHub untuk version control.
- Railway untuk deployment.
- Hostinger untuk custom domain.

## Gambaran Umum Sistem

FTI Meeting digunakan oleh dua peran utama, yaitu penyelenggara dan peserta. Penyelenggara berperan dalam mengelola meeting, menambahkan peserta, memperbarui kehadiran, serta mengelola notulensi dan dokumentasi. Peserta berperan dalam melihat meeting yang diikuti, merespons undangan, serta mengakses hasil meeting setelah rapat selesai.

Secara umum, sistem ini membantu proses pengelolaan rapat agar lebih terpusat karena data jadwal, peserta, undangan, kehadiran, notulensi, dokumentasi, export rekap, dan API meeting dikelola dalam satu sistem web.

## Fitur Sistem

### Dashboard

Dashboard digunakan untuk menampilkan ringkasan aktivitas meeting. Halaman ini menampilkan informasi seperti jumlah meeting, total peserta, undangan, notulensi, dan meeting mendatang.

### Pengelolaan Meeting

Penyelenggara dapat mengelola data meeting, mulai dari melihat daftar meeting, menambahkan meeting baru, mengedit data meeting, menghapus meeting, hingga melihat detail meeting. Peserta dapat melihat daftar meeting dan detail meeting yang berkaitan dengan dirinya.

Status meeting yang digunakan dalam sistem:

- draft
- scheduled
- completed
- cancelled

### Pengelolaan Undangan

Peserta dapat melihat detail undangan meeting dan memberikan respons terhadap undangan. Respons peserta digunakan untuk mencatat apakah peserta menyetujui atau menolak undangan meeting.

Status undangan peserta internal:

- invited
- confirmed
- declined

### Pengelolaan Kehadiran

Penyelenggara dapat melihat dan memperbarui status kehadiran peserta meeting. Status kehadiran digunakan untuk membedakan peserta yang hadir dan tidak hadir setelah meeting selesai.

Status peserta internal:

- invited
- confirmed
- declined
- attended
- absent

Status peserta eksternal:

- invited
- attended
- absent

### Hasil Meeting

Penyelenggara dapat mengunggah notulensi dan dokumentasi meeting. Peserta dapat melihat dan mengunduh hasil meeting setelah meeting selesai.

### Export Rekap Kehadiran

Sistem menyediakan fitur export rekap kehadiran peserta meeting dalam bentuk file Excel. Export ini berisi data peserta meeting beserta status kehadirannya.

### REST API

Sistem menyediakan REST API untuk menampilkan data meeting dan notulensi dalam format JSON.

Endpoint API yang digunakan:

- GET `/api/meetings`
- GET `/api/meetings/:id`
- GET `/api/minutes`
- GET `/api/minutes/:id`

## Pembagian Penanggung Jawab

Lyvia Putri Lestari bertanggung jawab pada fitur pengelolaan meeting, peserta, kehadiran, export rekap kehadiran, dan REST API data meeting.

Ahmad Faiz Batubara bertanggung jawab pada fitur dashboard, undangan meeting, notulensi, dokumentasi, hasil meeting, laporan hasil rapat, dan REST API data notulensi.

## Struktur Project

```txt
facultyware/
├─ app.js
├─ bin/
├─ controllers/
├─ lib/
├─ middlewares/
├─ public/
├─ routes/
├─ tests/
├─ views/
├─ playwright.config.js
├─ package.json
├─ package-lock.json
└─ README.md
```

Keterangan struktur project:

- `app.js` berisi konfigurasi utama sistem.
- `bin/` berisi file untuk menjalankan server.
- `controllers/` berisi logic utama fitur.
- `lib/` berisi konfigurasi koneksi database.
- `middlewares/` berisi middleware autentikasi, otorisasi, dan upload.
- `public/` berisi asset statis sistem.
- `routes/` berisi pengaturan route.
- `tests/` berisi file testing Playwright.
- `views/` berisi tampilan halaman EJS.

## Instalasi dan Menjalankan Project Lokal

Clone repository:

```bash
git clone https://github.com/FaizBatubara10/facultyware.git
cd facultyware
```

Install dependency:

```bash
npm install
```

Buat file `.env` pada root project dan isi konfigurasi database:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=facultyware
SESSION_SECRET=facultyware_secret
```

Import database ke MySQL/MariaDB melalui phpMyAdmin atau MySQL client.

Jalankan sistem:

```bash
npm start
```

Sistem lokal berjalan pada:

```txt
http://localhost:3000
```

## Testing

Testing sistem web FTI Meeting dilakukan menggunakan Playwright dengan browser Chromium. Pengujian dilakukan untuk memastikan fitur utama berjalan sesuai kebutuhan, meliputi autentikasi, dashboard, pengelolaan meeting, undangan, kehadiran, export daftar hadir, notulensi, dan REST API.

Pengujian dilakukan sebanyak dua tahap. Tahap pertama merupakan testing awal dengan jumlah test case yang masih terbatas, yaitu 7 test case. Setelah fitur sistem diperbaiki dan kebutuhan pengujian diperluas, dilakukan testing tahap kedua dengan cakupan yang lebih lengkap sebanyak 40 test case.

Perintah menjalankan testing:

```bash
npx playwright test
```

Perintah membuka report testing:

```bash
npx playwright show-report
```

Ringkasan hasil testing tahap pertama:

* Total test case: 7
* Passed: 7
* Failed: 0
* Pass rate: 100%
* Browser: Chromium
* Environment: Localhost

Ringkasan hasil testing tahap kedua:

* Total test case: 40
* Passed: 40
* Failed: 0
* Pass rate: 100%
* Browser: Chromium
* Environment: Localhost

Modul yang diuji pada testing tahap kedua:

* Authentication
* Dashboard
* Meetings List
* Meetings CRUD
* Invitations
* Attendance & Export
* REST API
* Minutes / Notulensi

Testing tahap kedua dilakukan untuk memperluas cakupan pengujian dari testing awal. Dengan demikian, hasil testing akhir menunjukkan bahwa fitur utama sistem web FTI Meeting dapat berjalan sesuai kebutuhan.

## Deployment

Sistem web FTI Meeting berhasil dideploy menggunakan Railway sebagai platform hosting dan MySQL Railway sebagai database online. Source code sistem dihubungkan dari repository GitHub ke Railway. Custom domain diperoleh dari Hostinger dan diarahkan ke service Railway.

Link deployment:

```txt
https://ftimeeta-16.my.id
```

## Akun Pengujian

Akun penyelenggara:

```txt
Email    : 2411521006_lyvia@student.unand.ac.id
Password : Lyvia1234
```

Akun penyelenggara dan peserta:

```txt
Email    : 2411521016_ahmad@student.unand.ac.id
Password : 12345678
```

## Kesimpulan

FTI Meeting dikembangkan sebagai sistem web untuk membantu pengelolaan rapat secara lebih terstruktur. Sistem ini mendukung pengelolaan meeting, undangan, kehadiran, notulensi, dokumentasi, export rekap kehadiran, REST API, testing, dan deployment online.

Dengan adanya sistem web ini, proses pengelolaan rapat dapat dilakukan secara lebih terpusat, terdokumentasi, dan mudah diakses oleh penyelenggara maupun peserta.
