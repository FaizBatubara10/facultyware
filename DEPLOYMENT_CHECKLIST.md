# ✅ Railway Deployment Checklist

## Phase 1: Preparation (Before Anything)

### Local Setup
- [ ] Node.js installed: `node -v` (should be v18+)
- [ ] npm installed: `npm -v`
- [ ] Git installed: `git -v`
- [ ] Project folder opened in terminal
- [ ] `.env` file created from `.env.example`
- [ ] Edit `.env` with local database credentials

### Local Testing
- [ ] Run: `npm install`
- [ ] Run: `npm start` (should start on localhost:3000)
- [ ] Login page loads: http://localhost:3000/login
- [ ] Run: `npm run init-db` (should initialize database)
- [ ] Stop server: Ctrl+C

### GitHub Preparation
- [ ] Project exists on GitHub
- [ ] Latest code pushed: `git push`
- [ ] `.env` file in `.gitignore` ✓
- [ ] `.env.example` file exists ✓
- [ ] Can see project at github.com/username/facultyware

---

## Phase 2: Railway Account & Database Setup

### Create Railway Account
- [ ] Go to https://railway.app
- [ ] Click "Start Free"
- [ ] Sign up with GitHub account
- [ ] Verify email
- [ ] Login to Railway Dashboard

### Create MySQL Database
- [ ] In Railway Dashboard, click "New Project"
- [ ] Click "Create New"
- [ ] Scroll down to "Databases"
- [ ] Select "MySQL"
- [ ] Wait for database to initialize (green status)

### Capture MySQL Credentials
Open MySQL Service in Railway:
- [ ] Go to "Connect" tab
- [ ] Copy: **MYSQLHOST** = _______________
- [ ] Copy: **MYSQLUSER** = _______________
- [ ] Copy: **MYSQLPASSWORD** = _______________
- [ ] Copy: **MYSQLDATABASE** = _______________
- [ ] Copy: **MYSQLPORT** = _______________

**Save these! You'll need in Phase 3**

---

## Phase 3: Deploy Node.js Application

### Create Node.js Service
- [ ] In Railway Dashboard, click "New"
- [ ] Click "GitHub Repo"
- [ ] Authorize Railway to access GitHub
- [ ] Select repository: facultyware
- [ ] Railway auto-detects Node.js
- [ ] Wait for build to complete (green status)

### Add Environment Variables

In Railway Dashboard → Node.js Service → Variables:

```
[ ] DB_HOST = <MYSQLHOST from Phase 2>
[ ] DB_USER = <MYSQLUSER from Phase 2>
[ ] DB_PASSWORD = <MYSQLPASSWORD from Phase 2>
[ ] DB_NAME = <MYSQLDATABASE from Phase 2>
[ ] DB_PORT = <MYSQLPORT from Phase 2>
[ ] NODE_ENV = production
[ ] PORT = 3000
```

- [ ] All 7 variables added
- [ ] Click "Save" or "Update"
- [ ] Railway auto-redeploys

---

## Phase 4: Database Initialization

### Option A: Initialize via Railway Shell
- [ ] In Node.js Service, open "Shell" tab
- [ ] Run: `npm run init-db`
- [ ] Output should show: "Users table created"
- [ ] Output should show: "Test user 'admin' created"

### Option B: Initialize Locally with Railway DB
- [ ] Edit `.env` file with Railway credentials from Phase 2
- [ ] Run locally: `npm run init-db`
- [ ] Check output for success message

**Choose ONE option above, both work same result**

- [ ] Database initialized successfully

---

## Phase 5: Verification & Testing

### Check Deployment Status
- [ ] Node.js Service shows "Running" (green)
- [ ] MySQL Service shows "Running" (green)
- [ ] Go to Node.js Service → "Logs" tab
- [ ] No red error messages in logs

### Get Production URL
- [ ] In Node.js Service → "Settings" tab
- [ ] Find "Generated Domain"
- [ ] Copy URL: https://xxxxx.railway.app
- [ ] Paste here: ___________________________

### Test Application
- [ ] Open in browser: https://xxxxx.railway.app
- [ ] Homepage loads successfully
- [ ] Click "Login"
- [ ] Login page displays
- [ ] Database is responsive

### Login Test (If App Requires)
- [ ] Username: `admin`
- [ ] Password: `password`
- [ ] Can login successfully
- [ ] Dashboard loads with data

---

## Phase 6: Post-Deployment

### Monitor & Verify
- [ ] Check logs daily for errors
- [ ] Monitor metrics: CPU < 80%, Memory < 500MB
- [ ] Test homepage daily: https://xxxxx.railway.app
- [ ] Check database connections in MySQL metrics

### Version Control
- [ ] Final code pushed to GitHub
- [ ] No `.env` file in git history
- [ ] Commits clean and documented

### Documentation
- [ ] Saved production URL: https://xxxxx.railway.app
- [ ] Saved database host: _______________
- [ ] Team knows production URL

---

## Phase 7: Making Updates (Future)

**Every time you make changes:**
```bash
[ ] Make code changes
[ ] Test locally: npm start
[ ] Commit: git add . && git commit -m "Your message"
[ ] Push: git push
[ ] Wait 2-3 minutes for Railway auto-deploy
[ ] Check logs for deployment success
[ ] Test production URL
```

---

## 🚨 Emergency Checklist (If Broken)

- [ ] Check Railway logs for error message
- [ ] Check all environment variables are set correctly
- [ ] Check MySQL service is running (not stopped)
- [ ] Restart Node service: Redeploy button
- [ ] Check database is initialized: `npm run init-db`
- [ ] If all fails, rollback: Deployments tab → select previous version

---

## 📋 Important Information to Save

| Info | Value |
|------|-------|
| **Production URL** | https://xxxxx.railway.app |
| **Railway Dashboard** | https://railway.app/dashboard |
| **Database Host** | _____________________ |
| **Database Name** | _____________________ |
| **MySQL Port** | _____________________ |
| **Admin Username** | admin |
| **Admin Password** | password |

---

## ✅ Final Verification (Day After Deployment)

- [ ] Application still running
- [ ] No error messages in logs
- [ ] Homepage loads < 2 seconds
- [ ] Database responding normally
- [ ] All features working as local

---

## 📞 If Something Goes Wrong

### Check These First
1. **Are services running?**
   - Dashboard → Node Service → Status (should be green)
   - Dashboard → MySQL Service → Status (should be green)

2. **Check logs**
   - Dashboard → Node Service → Logs tab
   - Search for "error" keyword

3. **Verify variables**
   - Dashboard → Node Service → Variables tab
   - All 7 variables present and correct

4. **Is database initialized?**
   - If table error: Run `npm run init-db` again

### Get Help
- Read: [RAILWAY_TROUBLESHOOTING.md](./RAILWAY_TROUBLESHOOTING.md)
- Check: https://docs.railway.app
- Support: help@railway.app

---

## 🎉 Success Indicators

After deployment is complete, you should see:

✅ Production URL working
✅ No errors in logs
✅ Database connection successful
✅ Application responds in < 2 seconds
✅ Features working like local version
✅ Admin can login with: admin / password

---

**Print this checklist and mark off as you go! 📋**

**Total Time: ~45 minutes (first time) or ~15 minutes (subsequent)**
