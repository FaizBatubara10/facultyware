# 🚀 Quick Start Railway Deployment

## Setup Lokal (Before Deploy)

### 1. Clone Repository atau Pastikan di GitHub
```bash
# Pastikan project sudah ada di GitHub
git remote -v  # Cek remote
git push      # Push latest changes
```

### 2. Setup Environment File Lokal
```bash
# Buat .env file dari template
cp .env.example .env

# Edit .env dengan credentials lokal Anda
# DB_HOST=localhost
# DB_USER=root
# DB_PASSWORD=yourpassword
# DB_NAME=facultyware
```

### 3. Test Lokal
```bash
npm install
npm start
npm run init-db  # Initialize database
```

---

## Railway Deployment (Step-by-Step)

### Step 1️⃣: Sign Up Railway
- Buka https://railway.app
- Klik "Start Free"
- Sign up dengan GitHub account
- Verifikasi email

### Step 2️⃣: Create MySQL Database di Railway

1. **Masuk ke Dashboard Railway**
   - Klik "New Project"
   
2. **Pilih MySQL**
   - Klik "Create New"
   - Scroll ke "Databases"
   - Pilih "MySQL"
   
3. **Railway akan auto-generate MySQL Service**
   - Tunggu ~2-3 menit
   - Lihat "Creating MySQL..." → "Running" (hijau)

### Step 3️⃣: Catat MySQL Credentials

1. **Klik MySQL Service** di dashboard
2. **Buka Tab "Connect"**
   ```
   MYSQLHOST=gateway.railway.app
   MYSQLUSER=root
   MYSQLPASSWORD=xxxxxxxxxxx
   MYSQLDATABASE=railway
   MYSQLPORT=xxxx
   ```
3. **Copy-paste credentials ini, akan dipakai di langkah 5**

### Step 4️⃣: Hubungkan Project ke Railway

1. **Di Railway Dashboard, Klik "New"**
2. **Pilih "GitHub Repo"**
3. **Authorize Railway**
   - Klik "Authorize Railway App"
   - Confirm akses di GitHub
4. **Pilih Repository Project Anda**
   - facultyware
5. **Railway Auto-Detect:**
   - ✅ Node.js Project
   - ✅ Dependencies
   - ✅ Build & Deploy settings

### Step 5️⃣: Add Environment Variables

1. **Di Railway Dashboard:**
   - Klik Node.js Service yang baru dibuat
   - Buka Tab "Variables"
   
2. **Tambah Variables:**
   ```
   DB_HOST=<MYSQLHOST>
   DB_USER=<MYSQLUSER>
   DB_PASSWORD=<MYSQLPASSWORD>
   DB_NAME=<MYSQLDATABASE>
   DB_PORT=<MYSQLPORT>
   NODE_ENV=production
   PORT=3000
   ```

3. **Save Changes**
   - Railway otomatis redeploy

### Step 6️⃣: Initialize Database

**Option A: Jalankan Manual via Railway Shell**
```bash
# Di Railway Dashboard:
# 1. Buka Node.js Service
# 2. Buka Tab "Shell"
# 3. Jalankan:
npm run init-db
```

**Option B: Jalankan di Local dengan Remote DB**
```bash
# Di komputer lokal, dengan .env sudah berisi Railway credentials:
npm run init-db
```

### Step 7️⃣: Get Public URL

1. **Buka Node.js Service di Railway**
2. **Tab "Settings"**
3. **Lihat "Generated Domain"**
   ```
   https://xxxxx.railway.app
   ```
4. **Ini URL production Anda!**

---

## ✅ Verifikasi Deployment

```bash
# Test URL:
curl https://xxxxx.railway.app

# Cek status deployment:
# Dashboard → Node.js Service → Logs
```

---

## 🔄 Update Project (Push ke Production)

```bash
# Di lokal:
git add .
git commit -m "Update feature"
git push  # DONE! Railway auto-deploy

# Monitor di Dashboard → Logs
```

---

## 📊 Monitor Application

Di Railway Dashboard:
- ✅ **Logs**: Real-time application logs
- ✅ **Metrics**: CPU, Memory, Network
- ✅ **Database**: MySQL stats
- ✅ **Deployments**: History

---

## 🆘 Common Issues & Fixes

### ❌ "Cannot connect to database"
```bash
# Cek:
# 1. Variables di Railway setting sudah benar?
# 2. MySQL service sudah "Running" (hijau)?
# 3. Coba restart service:
#    Dashboard → Node Service → Redeploy
```

### ❌ "Port 3000 in use"
- **Solution**: Jangan set PORT = hardcode
- Gunakan: `process.env.PORT || 3000` ✅
- Sudah dikonfigurasi di project

### ❌ "Database not initialized"
```bash
# Jalankan di Railway Shell:
npm run init-db

# Atau check file:
# scripts/init_db.js
```

### ❌ "Build failed"
- Cek Railway Logs untuk error detail
- Biasanya: missing dependencies atau syntax error
- Fix lokal dulu, baru push

---

## 📱 Project URLs

- **Production**: https://xxxxx.railway.app
- **Dashboard**: https://railway.app/dashboard
- **Database**: Railway → MySQL Service → Database tab

---

## 🔒 Security Checklist

- ✅ `.env` file di `.gitignore`
- ✅ `.env.example` sudah dibuat (tanpa password)
- ✅ Password disimpan di Railway Variables (encrypted)
- ✅ Jangan share `.env` file
- ✅ Jangan commit credentials ke Git

---

## 📞 Need Help?

1. **Railway Docs**: https://docs.railway.app
2. **MySQL on Railway**: https://docs.railway.app/guides/mysql
3. **Node.js Deployment**: https://docs.railway.app/guides/nodejs
4. **Check Railway Status**: https://status.railway.app

---

**Selamat! Project Anda sekarang deploy di Railway! 🎉**
