# 🚀 Railway MySQL Database Deployment - Documentation

Dokumentasi lengkap untuk deploy MySQL database project Anda ke Railway.

## 📚 Files Created

Beberapa file dokumentasi telah dibuat untuk memudahkan deployment:

### 1. **[RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md)** ⭐ START HERE
- **Untuk**: Panduan step-by-step praktis (bahasa Indonesia)
- **Isi**: Setup lokal + Railway deployment steps
- **Durasi**: ~30 menit (first time)
- **Best for**: Pertama kali deploy

### 2. **[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)** 📋
- **Untuk**: Dokumentasi lengkap & detailed
- **Isi**: Prerequisites, step-by-step detailed, monitoring, security
- **Best for**: Reference & understanding

### 3. **[RAILWAY_TROUBLESHOOTING.md](./RAILWAY_TROUBLESHOOTING.md)** 🔧
- **Untuk**: Debugging & problem solving
- **Isi**: Common issues, solutions, emergency troubleshooting
- **Best for**: Ketika ada error

### 4. **.env.example** 🔐
- **Untuk**: Template environment variables
- **Isi**: Variable names yang diperlukan
- **Cara**: Copy & edit untuk local development

### 5. **package.json** (updated)
- **Tambahan**: Script `npm run init-db`
- **Fungsi**: Initialize database tables

---

## 🎯 Quick Start (3 Langkah)

### Langkah 1: Setup Lokal
```bash
# Copy template environment
cp .env.example .env

# Edit .env dengan database lokal
nano .env

# Install & test
npm install
npm start
```

### Langkah 2: Push ke GitHub
```bash
git add .
git commit -m "Add Railway deployment docs"
git push
```

### Langkah 3: Deploy ke Railway
1. Buka https://railway.app
2. Sign up dengan GitHub
3. Create MySQL Database
4. Create Node.js Service dari GitHub repo
5. Set environment variables
6. Done! ✅

---

## 📖 How to Use These Docs

**First Time Deploying?**
→ Baca: [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md)

**Need More Details?**
→ Baca: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)

**Getting Errors?**
→ Baca: [RAILWAY_TROUBLESHOOTING.md](./RAILWAY_TROUBLESHOOTING.md)

**Need Environment Variables Template?**
→ Lihat: [.env.example](./.env.example)

---

## 🔑 Key Points to Remember

### ✅ Before Deploy
- [ ] Project di GitHub (with commit history)
- [ ] Create `.env` file lokal dari `.env.example`
- [ ] Test lokal: `npm start` & `npm run init-db` berjalan
- [ ] `.env` sudah di `.gitignore` (don't commit credentials!)

### ✅ During Deploy
- [ ] Create Railway Account
- [ ] Create MySQL Database
- [ ] Copy DB credentials
- [ ] Create Node.js Service dari GitHub
- [ ] Set environment variables di Railway
- [ ] Initialize database

### ✅ After Deploy
- [ ] Test aplikasi di production URL
- [ ] Check logs untuk errors
- [ ] Monitor metrics

---

## 🚀 Project Architecture

```
Your Project (GitHub)
        ↓
Railway Platform
        ├── MySQL Database
        │   └── Users, Meetings, Invitations, etc.
        └── Node.js Application
            └── Express Server
                ├── Routes
                ├── Controllers
                └── Middleware
```

---

## 💡 Environment Variables

Berikut variables yang diperlukan di Railway:

```env
# Database Configuration
DB_HOST=gateway.railway.app
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=railway
DB_PORT=xxxx

# Server Configuration
PORT=3000
NODE_ENV=production
```

**Jangan commit ke Git!** ← Disimpan aman di Railway Variables

---

## 📞 Support Resources

| Issue | Resource |
|-------|----------|
| Railway Setup | [docs.railway.app](https://docs.railway.app) |
| MySQL Queries | [MySQL Docs](https://dev.mysql.com) |
| Node.js/Express | [Express Docs](https://expressjs.com) |
| Git Issues | [GitHub Docs](https://docs.github.com) |

---

## 🎓 Learning Path

1. **Understand Current Setup**
   - Read [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) Section 1-2

2. **Local Testing**
   - Follow [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md) Section 1

3. **Railway Setup**
   - Follow [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md) Section 2-7

4. **Monitoring & Maintenance**
   - Read [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) Section 5-6

5. **Problem Solving**
   - Reference [RAILWAY_TROUBLESHOOTING.md](./RAILWAY_TROUBLESHOOTING.md)

---

## ✅ Pre-Deployment Checklist

Sebelum mulai, pastikan:

- [ ] Node.js installed locally (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] GitHub account (free)
- [ ] Project pushed to GitHub
- [ ] Can run locally: `npm start`

---

## 🔒 Security Notes

- **Never commit `.env`** → It's in `.gitignore` ✓
- **Use strong passwords** → For MySQL
- **Rotate credentials** → Periodically
- **Enable 2FA** → On GitHub & Railway accounts
- **Monitor access logs** → In Railway dashboard

---

## 📊 After Deployment - Monitoring

Di Railway Dashboard, monitor:
- **Logs**: Real-time application output
- **Metrics**: CPU, Memory, Network usage
- **Deployments**: History & rollback
- **Database**: MySQL stats & backups

---

## 🆘 Quick Help Commands

```bash
# Local development
npm start              # Run server lokal
npm run dev           # Run dengan auto-reload (nodemon)
npm run init-db       # Initialize database

# Push changes
git add .
git commit -m "Your message"
git push              # Auto-deploy ke Railway!

# Testing
npm test              # Run tests (jika ada)
```

---

## 📈 What's Next After Deployment?

1. ✅ Test aplikasi di production URL
2. ✅ Configure domain (optional)
3. ✅ Setup monitoring alerts
4. ✅ Setup database backups
5. ✅ Configure CI/CD pipeline
6. ✅ Add logging service (optional)

---

**Version**: 1.0
**Last Updated**: 2024
**For**: facultyware project on Railway

---

## 📧 Questions?

1. Check relevant documentation file above
2. Search in Railway community: https://railway.app/community
3. Read error message in Railway logs carefully
4. Check if it's in [RAILWAY_TROUBLESHOOTING.md](./RAILWAY_TROUBLESHOOTING.md)

**Ready to deploy? → Start with [RAILWAY_QUICK_START.md](./RAILWAY_QUICK_START.md)** 🚀
