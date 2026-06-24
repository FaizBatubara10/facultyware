# Panduan Deploy MySQL Database ke Railway

## 📋 Persyaratan
- Akun Railway (sign up di https://railway.app)
- Akun GitHub (untuk deploy project)
- Project ini sudah di-push ke GitHub

## 🚀 Langkah-langkah Deploy

### 1. Setup Railway Account & MySQL Database

1. **Buat Akun Railway**
   - Kunjungi https://railway.app
   - Sign up dengan GitHub account
   - Verifikasi email Anda

2. **Buat Database MySQL**
   - Login ke Railway Dashboard
   - Klik "New Project"
   - Pilih "Create New" → "Database"
   - Pilih "MySQL"
   - Railway akan secara otomatis membuat database

3. **Dapatkan Credentials**
   - Setelah MySQL terbuat, klik pada service MySQL
   - Lihat tab "Connect"
   - Catat informasi berikut:
     ```
     MYSQLHOST=
     MYSQLUSER=
     MYSQLPASSWORD=
     MYSQLDATABASE=
     MYSQLPORT=
     ```

### 2. Update Environment Variables di Railway

1. Kembali ke Railway Dashboard
2. Buat "New Service" untuk Node.js project Anda
3. Hubungkan ke GitHub repository Anda
4. Di tab "Variables", tambahkan:
   ```
   DB_HOST=<MYSQLHOST dari MySQL service>
   DB_USER=<MYSQLUSER dari MySQL service>
   DB_PASSWORD=<MYSQLPASSWORD dari MySQL service>
   DB_NAME=<MYSQLDATABASE dari MySQL service>
   DB_PORT=<MYSQLPORT dari MySQL service>
   NODE_ENV=production
   PORT=3000
   ```

### 3. Setup Database Schema

Sebelum deploy, Anda perlu inisialisasi database:

**Option A: Inisialisasi manual sebelum deploy**
1. Masuk ke Railway MySQL service
2. Buka "Database" tab
3. Jalankan script SQL dari `scripts/init_db.js` (convert ke raw SQL)

**Option B: Jalankan init_db.js setelah deploy**
```bash
# Setelah app di-deploy, jalankan:
npm run init-db
```

### 4. Connect Project ke GitHub

1. Di Railway Dashboard, klik "New"
2. Pilih "GitHub Repo"
3. Authorize Railway untuk akses GitHub
4. Pilih repository project Anda
5. Railway akan otomatis:
   - Detect Node.js project
   - Install dependencies
   - Build dan deploy

### 5. Automatic Deployment

- Railway akan otomatis redeploy setiap kali Anda push ke branch default (main/master)
- Lihat logs di Railway Dashboard untuk monitor deployment

## 🔒 Security Notes

- **Jangan commit `.env` file ke GitHub**
- `.env.example` sudah disediakan untuk referensi
- Semua credentials disimpan di Railway variables (encrypted)
- Gunakan strong password untuk database

## 📝 Struktur Koneksi Database

Project sudah konfigurasi untuk menggunakan environment variables:

```javascript
// lib/db.js
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ... config lainnya
});
```

Tidak perlu ubah kode aplikasi, hanya set environment variables.

## 🧪 Testing Connection

Untuk test koneksi di local:
1. Buat file `.env` di root project
2. Copy dari `.env.example`
3. Isi dengan credentials Railway MySQL
4. Jalankan `npm start`

## 📊 Monitoring

Di Railway Dashboard, Anda bisa:
- Lihat deployment logs
- Monitor CPU & Memory usage
- View database metrics
- Setup monitoring alerts

## 🆘 Troubleshooting

### Connection Refused
- Pastikan IP address Anda di-whitelist (Railway otomatis)
- Cek DB_HOST, DB_USER, DB_PASSWORD di variables

### Port Issues
- Railway otomatis assign PORT
- Jangan hardcode port, gunakan `process.env.PORT || 3000`

### Database Tidak Initialize
- Lihat file `scripts/init_db.js` untuk schema
- Jalankan manual melalui Railway dashboard

## 📚 Referensi
- Railway Docs: https://docs.railway.app
- MySQL Setup: https://docs.railway.app/guides/mysql
- Node.js Deployment: https://docs.railway.app/guides/nodejs
