# Test Credentials - Service Desk

Quick reference for testing different user roles and permissions.

## Login URL
**Frontend:** http://localhost:3000/login
**Backend API:** http://localhost:5000

---

## Test Accounts

### 🔴 Admin Account
**Full system access - Test all features**

```
Email:    admin@servicedesk.local
Password: admin123
```

**Permissions:**
- ✅ Full system administration
- ✅ User management (create, edit, delete users)
- ✅ SLA policy management
- ✅ Asset management
- ✅ Organization management
- ✅ Team management
- ✅ All reports and analytics
- ✅ System configuration
- ✅ All ticket operations

**Role(s):** admin, agent

---

### 🟡 Agent Account
**Support staff access - Test agent workflows**

```
Email:    agent@servicedesk.local
Password: agent123
```

**Permissions:**
- ✅ Create and manage all tickets
- ✅ Assign tickets to self/others
- ✅ View and update tickets
- ✅ Access knowledge base (read/write)
- ✅ View reports and analytics
- ✅ Manage assets
- ✅ View organizations
- ❌ Cannot manage users
- ❌ Cannot manage SLA policies
- ❌ Cannot access admin settings

**Role(s):** agent

---

### 🟢 Requester Account
**End user access - Test customer experience**

```
Email:    user@servicedesk.local
Password: user123
```

**Permissions:**
- ✅ Create new tickets
- ✅ View own tickets only
- ✅ Add comments to own tickets
- ✅ Access knowledge base (read-only)
- ❌ Cannot view other users' tickets
- ❌ Cannot assign tickets
- ❌ Cannot access reports
- ❌ Cannot manage assets
- ❌ Cannot access admin features

**Role(s):** requester

---

## Feature Access Matrix

| Feature                    | Admin | Agent | Requester |
|---------------------------|-------|-------|-----------|
| Dashboard                 | ✅    | ✅    | ✅        |
| Create Tickets            | ✅    | ✅    | ✅        |
| View All Tickets          | ✅    | ✅    | ❌        |
| Assign Tickets            | ✅    | ✅    | ❌        |
| Close Tickets             | ✅    | ✅    | ❌        |
| Knowledge Base (Read)     | ✅    | ✅    | ✅        |
| Knowledge Base (Write)    | ✅    | ✅    | ❌        |
| Assets                    | ✅    | ✅    | ❌        |
| Organizations             | ✅    | ✅    | ❌        |
| Teams                     | ✅    | ✅    | ❌        |
| Users                     | ✅    | ✅    | ❌        |
| SLA Management            | ✅    | ❌    | ❌        |
| Reports & Analytics       | ✅    | ✅    | ❌        |

---

## Testing Scenarios

### As Admin
1. Login with admin credentials
2. Navigate to Users → Create a new user
3. Go to SLA Management → Create SLA policy
4. Check Reports → View all analytics
5. Create and assign tickets

### As Agent
1. Login with agent credentials
2. View ticket queue
3. Assign ticket to yourself
4. Add comments and update status
5. Check reports for your performance
6. Browse knowledge base

### As Requester
1. Login with requester credentials
2. Create a new ticket
3. View only your tickets
4. Add comments to your ticket
5. Search knowledge base for help
6. Verify you cannot access admin/agent features

---

## Customizing Test Users

You can customize the admin user via environment variables in `.env`:

```env
SEED_ADMIN_EMAIL=custom@example.com
SEED_ADMIN_PASSWORD=YourPassword123!
SEED_ADMIN_NAME=Your Name
```

Then run: `node src/seed.js`

---

## Password Policy

Default passwords are simple for testing purposes:
- All passwords: `{role}123`
- Pattern: `admin123`, `agent123`, `user123`

⚠️ **Change these in production!**

---

## Re-seeding Database

To reset test users:

```bash
cd backend
node src/seed.js
```

This will:
- Update existing users' passwords
- Recreate role assignments
- Keep existing tickets and data
- Safe to run multiple times

---

## Quick Login Test

Copy-paste these for quick testing:

**Admin:**
```
admin@servicedesk.local
admin123
```

**Agent:**
```
agent@servicedesk.local
agent123
```

**Requester:**
```
user@servicedesk.local
user123
```

---

## Troubleshooting

**Cannot login?**
1. Verify backend is running: `npm run dev` in backend folder
2. Check database is seeded: `node src/seed.js`
3. Verify .env file has correct DATABASE credentials
4. Check browser console for errors

**Wrong permissions?**
1. Re-run seed script: `node src/seed.js`
2. Check user_roles table in database
3. Clear browser cache/cookies
4. Check JWT token in localStorage

**Need more test data?**
- Create additional tickets through the UI
- Use the API to bulk-create test data
- Import sample data via SQL

---

## Support

For issues or questions:
- Check SETUP.md for installation guide
- Review DATABASE_SCHEMA.md for schema reference
- See FEATURES.md for complete feature list
