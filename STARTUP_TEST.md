# Startup Test Guide

Quick guide to verify your service desk is running correctly.

## Prerequisites

✅ MySQL installed and running
✅ Node.js installed (v18+)
✅ Database migrated: `node src/config/migrate.js`
✅ Database seeded: `node src/seed.js`

---

## Start Backend

```bash
cd backend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

**Expected output:**
```
API listening on http://localhost:5000
```

**Test backend health:**
```bash
curl http://localhost:5000/health
```

**Expected response:**
```json
{"status":"ok"}
```

---

## Start Frontend

Open a **new terminal**:

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

**Expected output:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

---

## Verify Application

### 1. Open Browser
Navigate to: **http://localhost:3000**

### 2. Test Login (Admin)
```
Email:    admin@servicedesk.local
Password: admin123
```

**Should see:**
- Dashboard with metrics
- Navigation sidebar
- User info in header

### 3. Test Features

**Create a Ticket:**
1. Click "Create ticket" in sidebar
2. Fill in subject and description
3. Submit
4. Should redirect to ticket list

**View Knowledge Base:**
1. Click "Knowledge Base" in sidebar
2. Should see categories and articles
3. Search should work

**Check Reports:**
1. Click "Reports" in sidebar
2. Should see metrics and charts
3. Data may be empty (no tickets yet)

### 4. Test Different User Roles

**Logout and login as Agent:**
```
Email:    agent@servicedesk.local
Password: agent123
```
- Should NOT see SLA Management
- Should see Tickets, Reports, Assets

**Logout and login as Requester:**
```
Email:    user@servicedesk.local
Password: user123
```
- Should NOT see Reports, Users, Assets
- Should only see own tickets
- Can create tickets and view knowledge base

---

## Common Issues & Fixes

### Backend Won't Start

**Error: `Cannot find module`**
```bash
cd backend
npm install
```

**Error: `ER_ACCESS_DENIED_ERROR`**
- Check .env file has correct DATABASE_USER and DATABASE_PASSWORD
- Verify MySQL user has permissions

**Error: `ER_BAD_DB_ERROR`**
- Run migration: `node src/config/migrate.js`
- This will create the database

**Error: `EADDRINUSE`**
- Port 5000 already in use
- Kill existing process: `lsof -ti:5000 | xargs kill -9`
- Or change PORT in .env

### Frontend Won't Start

**Error: `Cannot find module`**
```bash
cd frontend
npm install
```

**Error: Port 3000 in use**
- Vite will auto-increment to 3001
- Or kill existing: `lsof -ti:3000 | xargs kill -9`

**Blank page / Loading forever**
- Check backend is running on port 5000
- Open browser console (F12) for errors
- Verify VITE_API_URL in frontend/.env (optional)

### Login Fails

**"Invalid credentials"**
- Re-run seed: `cd backend && node src/seed.js`
- Use exact credentials from TEST_CREDENTIALS.md
- Check for typos (e.g., .com vs .local)

**"Missing token" error**
- Clear browser localStorage
- Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
- Try incognito/private window

### Database Issues

**Tables don't exist**
```bash
cd backend
node src/config/migrate.js
```

**No users to login**
```bash
cd backend
node src/seed.js
```

**Need fresh start**
```sql
-- In MySQL
DROP DATABASE service_desk;
```
Then run migration and seed again.

---

## API Endpoint Tests

Test individual endpoints with curl:

**Get metadata:**
```bash
curl http://localhost:5000/api/meta
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@servicedesk.local","password":"admin123"}'
```

**Get tickets (with token):**
```bash
TOKEN="your-jwt-token-here"
curl http://localhost:5000/api/tickets \
  -H "Authorization: Bearer $TOKEN"
```

---

## Performance Checks

### Backend Response Times
Should be < 100ms for most requests:
```bash
time curl http://localhost:5000/health
```

### Frontend Load Time
First load: < 2 seconds
Subsequent: < 500ms

### Database Query Performance
Check MySQL slow query log if responses are slow

---

## Production Readiness

Before deploying to production:

- [ ] Change JWT_SECRET in .env
- [ ] Update CORS_ORIGIN to your domain
- [ ] Change default passwords
- [ ] Enable HTTPS
- [ ] Set up database backups
- [ ] Configure error logging
- [ ] Set up monitoring (e.g., PM2, New Relic)
- [ ] Optimize database indexes
- [ ] Enable rate limiting
- [ ] Set up CDN for frontend assets

---

## Success Checklist

✅ Backend starts without errors
✅ Frontend starts without errors
✅ Can login as admin
✅ Can create a ticket
✅ Can view dashboard metrics
✅ Different user roles have different access
✅ Knowledge base loads
✅ Reports page displays (even if empty)

---

## Next Steps

Once everything is working:

1. **Create sample data** - Add tickets, organizations, teams
2. **Test workflows** - Create → Assign → Comment → Close tickets
3. **Configure settings** - Set up SLA policies, teams, users
4. **Customize** - Update branding, add custom fields
5. **Document** - Add internal wiki articles to knowledge base

---

## Getting Help

- Check SETUP.md for installation details
- Review DATABASE_SCHEMA.md for schema reference
- See TEST_CREDENTIALS.md for login info
- Review FEATURES.md for capability overview

## Support

For issues:
1. Check browser console (F12)
2. Check backend terminal for errors
3. Verify .env configuration
4. Review this troubleshooting guide
