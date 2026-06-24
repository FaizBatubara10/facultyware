# 🔧 Railway Deployment - Troubleshooting Guide

## ✅ Pre-Deployment Checklist

- [ ] Project push ke GitHub (main/master branch)
- [ ] `.env` file di `.gitignore` (jangan commit credentials)
- [ ] `.env.example` sudah ada dengan template variables
- [ ] `npm install` bisa jalan tanpa error lokal
- [ ] `npm start` bisa jalan lokal
- [ ] Database lokal bisa initialize: `npm run init-db`

---

## 🐛 Common Issues & Solutions

### 1. ❌ "Connection refused" or "Cannot connect to database"

**Gejala:**
```
Error: connect ECONNREFUSED
Error: getaddrinfo ENOTFOUND gateway.railway.app
```

**Solusi:**
```bash
# 1. Cek variables di Railway Dashboard
# Node Service → Variables tab
# Pastikan:
✓ DB_HOST benar (gateway.railway.app atau IP Railway)
✓ DB_USER benar (biasanya 'root')
✓ DB_PASSWORD tidak ada typo
✓ DB_NAME benar
✓ DB_PORT benar (biasanya 3306 atau port yang assigned Railway)

# 2. Cek MySQL service running
# Dashboard → MySQL Service → Status (harus RUNNING - hijau)

# 3. Restart Node service
# Dashboard → Node Service → Redeploy
```

**Debugging Steps:**
```bash
# 1. Check Railway logs untuk error message lengkap:
# Dashboard → Node Service → Logs

# 2. Pastikan MySQL credentials benar:
# Dashboard → MySQL Service → Connect tab
# Copy credentials yang benar

# 3. Test connection di Railway Shell:
# Dashboard → Node Service → Shell
# Coba jalankan:
mysql -h [HOST] -u [USER] -p[PASSWORD] [DATABASE]
```

---

### 2. ❌ "Error: Port 3000 already in use"

**Gejala:**
```
Error: listen EADDRINUSE :::3000
```

**Solusi:**
Railway otomatis assign PORT, jangan hardcode:

**✅ Correct:**
```javascript
// bin/www
const port = process.env.PORT || '3000';
```

**❌ Wrong:**
```javascript
const port = 3000; // Hardcode!
```

Project sudah benar dikonfigurasi ✓

---

### 3. ❌ "Build failed" atau "Deployment failed"

**Gejala:**
```
Build failed: npm ERR! ...
```

**Solusi:**
```bash
# 1. Cek Railway build logs (detailed):
# Dashboard → Node Service → Logs → Filter "Build"

# 2. Common causes:
# - Missing dependency di package.json?
#   Jalankan lokal: npm install
#   Pastikan semua dependency installed: npm ls

# - Node version mismatch?
#   Railway uses Node 18+ default
#   Cek package.json, tambah jika perlu:
#   "engines": { "node": "18.0.0" }

# - Syntax error di code?
#   Jalankan: npm start lokal untuk test

# - Environment variable missing?
#   Cek di Railway Variables tab
```

**Fix & Redeploy:**
```bash
# Lokal:
npm install
npm start  # Test berjalan?

# Push fix:
git add .
git commit -m "Fix build issue"
git push

# Railway otomatis redeploy
```

---

### 4. ❌ "Database not initialized" / "Table doesn't exist"

**Gejala:**
```
Error: Table 'railway.users' doesn't exist
```

**Solusi:**
```bash
# Option 1: Initialize via Railway Shell
# Dashboard → Node Service → Shell
npm run init-db

# Option 2: Initialize lokal dengan Railway DB
# Edit .env dengan Railway credentials
nano .env
# Isi dengan Railway DB credentials

# Jalankan init di lokal:
npm run init-db

# Option 3: Manual SQL di Railway
# Dashboard → MySQL → Database tab
# Jalankan SQL query dari scripts/init_db.js
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 5. ⚠️ "502 Bad Gateway" or "503 Service Unavailable"

**Gejala:**
```
502 Bad Gateway
Application Error
```

**Solusi:**
```bash
# 1. Cek app logs di Railway:
# Dashboard → Node Service → Logs
# Lihat error message

# 2. Biasanya penyebab:
# - Database connection failed
# - Memory limit exceeded
# - Node crash

# 3. Cek metrics:
# Dashboard → Node Service → Metrics
# Lihat CPU, Memory, Network

# 4. Restart application:
# Dashboard → Node Service → Redeploy
```

---

### 6. ❌ "Slow application" atau "Timeout"

**Gejala:**
```
Request timeout
Application slow
```

**Solusi:**
```bash
# 1. Cek query performance:
# Ensure database indexes ada
# Check query di controllers

# 2. Cek memory usage:
# Dashboard → Metrics
# Jika high, mungkin memory leak

# 3. Cek database connection limit:
# lib/db.js:
const pool = mysql.createPool({
  connectionLimit: 10,  // Adjust if needed
  waitForConnections: true,
});

# 4. Enable caching untuk static assets
# Sudah dikonfigurasi di app.js:
app.use(express.static(path.join(__dirname, 'public')));

# 5. Monitor logs:
# Dashboard → Logs → Filter "slow"
```

---

### 7. ❌ "Env variables not working" / "Process.env.DB_HOST undefined"

**Gejala:**
```
Error: process.env.DB_HOST is undefined
```

**Solusi:**

**Step 1: Verify Variables Set**
```bash
# Dashboard → Node Service → Variables
# Pastikan:
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_PORT=...
```

**Step 2: Restart Service**
```bash
# Dashboard → Node Service → Redeploy
# Environment variables loaded saat startup
```

**Step 3: Check Code**
```javascript
// ✅ Correct:
require('dotenv').config();
const host = process.env.DB_HOST;

// ❌ Wrong (tidak load .env):
const host = process.env.DB_HOST; // Tanpa dotenv
```

**Cek di app.js line 1:**
```javascript
require('dotenv').config();  // ✓ Sudah ada
```

---

### 8. ❌ "Can't push to GitHub" / "GitHub auth failed"

**Gejala:**
```
Permission denied (publickey)
fatal: Could not read from remote repository
```

**Solusi:**
```bash
# 1. Setup SSH key (recommended):
# https://docs.github.com/en/authentication/connecting-to-github-with-ssh

# 2. Atau gunakan HTTPS:
git remote set-url origin https://github.com/username/repo.git
git push

# 3. Railway akan auto-disconnect old GitHub connection
# Reconnect di Railway Dashboard:
# Settings → GitHub Integration → Re-authorize
```

---

## 🔍 Debugging dengan Logs

### Railway Logs Types:

**1. Build Logs**
```
Shows npm install, build process
```

**2. Runtime Logs**
```
Application output, errors
```

**3. Database Logs**
```
MySQL connection, queries
```

**How to View:**
```
Dashboard → [Service] → Logs tab

Filter by:
- Time range
- Search keyword
- Severity (Error, Warning, Info)
```

---

## 📊 Monitoring Checklist

Setiap hari/minggu, cek:

- [ ] Application status: Dashboard → Health
- [ ] Error rate: Logs → Filter "error"
- [ ] Memory usage: Metrics → Memory < 500MB
- [ ] CPU usage: Metrics → CPU < 80%
- [ ] Database connections: MySQL → Metrics
- [ ] Recent deployments: Deployments tab

---

## 🚨 Emergency Troubleshooting

**If everything broken:**

```bash
# 1. Stop current deployment:
# Dashboard → Node Service → Pause

# 2. Rollback to previous version:
# Dashboard → Deployments → Click older version → Redeploy

# 3. Check backup database:
# Dashboard → MySQL Service → Data backup
```

---

## 📞 Get Help

### Check Logs First:
```
Dashboard → Node Service → Logs
(Copy error message, search in Google)
```

### Railway Support:
```
https://docs.railway.app
https://discord.gg/railway (Community)
help@railway.app (Email support)
```

### MySQL Issues:
```
https://dev.mysql.com/doc/
Error code reference: https://dev.mysql.com/doc/mysql-errors/8.0/en/
```

### Node.js Issues:
```
https://nodejs.org/en/docs/
npm docs: https://docs.npmjs.com/
```

---

## ✅ Verification Checklist After Deploy

```
Setelah deployment, test:

[ ] Homepage loading: https://xxxxx.railway.app
[ ] Login page: https://xxxxx.railway.app/login
[ ] Dashboard after login: https://xxxxx.railway.app/home
[ ] API endpoint: https://xxxxx.railway.app/api/users
[ ] Database working: Bisa create/read/update user
[ ] Error logs empty: Dashboard → Logs
[ ] No 502/503 errors
[ ] Performance acceptable: < 2s load time
```

---

**Good luck! 🚀**

Jika masih stuck, cek Railway docs atau contact support dengan screenshot logs.
