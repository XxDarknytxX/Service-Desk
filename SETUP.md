# Service Desk - Complete Setup Guide

## Overview

This is a comprehensive, modern IT Service Desk solution with full-featured ticket management, asset tracking, knowledge base, SLA management, and advanced reporting capabilities.

## Features

### Core Ticketing
- ✅ Complete ticket lifecycle management
- ✅ Multi-channel support (Portal, Email, Phone, Chat, API)
- ✅ Ticket priorities, types, and statuses
- ✅ Comments and collaboration
- ✅ File attachments
- ✅ Ticket tagging
- ✅ Event history tracking
- ✅ Ticket reopening tracking

### Asset Management
- ✅ IT asset tracking and inventory
- ✅ Asset types and categorization
- ✅ Assignment to users and organizations
- ✅ Warranty and purchase tracking
- ✅ Asset-ticket linking
- ✅ Asset lifecycle management

### Knowledge Base
- ✅ Article creation and management
- ✅ Category organization
- ✅ Article versioning and publishing
- ✅ Full-text search
- ✅ Draft and published states

### SLA Management
- ✅ Customizable SLA policies
- ✅ Response and resolution time tracking
- ✅ Priority-based SLAs
- ✅ Team-based SLAs
- ✅ SLA breach detection and alerts
- ✅ Real-time SLA compliance monitoring

### User & Organization Management
- ✅ Role-based access control (Admin, Agent, Requester)
- ✅ User profiles with timezone and locale
- ✅ Organization/company management
- ✅ Team management with team leads
- ✅ User activity tracking

### Reporting & Analytics
- ✅ Ticket metrics and KPIs
- ✅ Agent performance tracking
- ✅ SLA compliance reports
- ✅ Customer satisfaction (CSAT) tracking
- ✅ Ticket trends and forecasting
- ✅ Distribution by status, priority, type, and channel

### Automation & Workflows
- ✅ Automation rules with triggers
- ✅ Conditional actions
- ✅ Execution logging
- ✅ Business hours support

### Additional Features
- ✅ Email integration (SMTP/IMAP)
- ✅ Canned responses/macros
- ✅ Time tracking with billable hours
- ✅ Notification preferences
- ✅ In-app notifications
- ✅ Custom fields for extensibility
- ✅ Saved filters and views
- ✅ Satisfaction ratings with comments

## Technology Stack

### Backend
- **Runtime**: Node.js with ES Modules
- **Framework**: Express 5
- **Database**: MySQL 8.0+
- **Authentication**: JWT with bcryptjs
- **Validation**: express-validator

### Frontend
- **Framework**: React 19
- **Routing**: React Router v7
- **Styling**: Tailwind CSS 4
- **Build Tool**: Vite 5
- **State Management**: Context API

## Database Schema

The complete schema includes 30+ tables:

### Core Tables
- `users`, `roles`, `user_roles`
- `tickets`, `ticket_statuses`, `ticket_priorities`, `ticket_types`, `ticket_channels`
- `ticket_comments`, `ticket_tags`, `ticket_tag_links`, `ticket_attachments`
- `ticket_events`, `ticket_slas`

### Asset Management
- `asset_types`, `assets`, `asset_ticket_links`

### Knowledge Base
- `kb_categories`, `kb_articles`

### SLA & Business Rules
- `sla_policies`, `business_hours`, `business_hours_schedules`
- `automation_rules`, `automation_logs`

### Organization & Teams
- `organizations`, `organization_members`
- `teams`, `team_members`

### Satisfaction & Feedback
- `satisfaction_ratings`

### Email & Communication
- `email_accounts`

### Time Tracking & Macros
- `time_entries`, `canned_responses`

### Notifications
- `notification_preferences`, `notifications`

### Custom Fields
- `custom_field_definitions`, `custom_field_values`

### Saved Views
- `saved_filters`

## Installation

### 1. Database Setup

```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE service_desk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;

# Run migration
cd backend
npm install
node src/config/migrate.js

# (Optional) Seed sample data
node src/seed.js
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
PORT=5000
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=service_desk
DATABASE_USER=root
DATABASE_PASSWORD=your_password
JWT_SECRET=your-secret-key-change-in-production
CORS_ORIGIN=http://localhost:3000
EOF

# Start development server
npm run dev

# Or production
npm start
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file (optional)
cat > .env << EOF
VITE_API_URL=http://localhost:5000/api
EOF

# Start development server
npm run dev

# Build for production
npm run build
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Tickets
- `GET /api/tickets` - List tickets
- `GET /api/tickets/:id` - Get ticket details
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket
- `DELETE /api/tickets/:id` - Delete ticket
- `POST /api/tickets/:id/comments` - Add comment
- `GET /api/tickets/:id/events` - Get ticket events

### Assets
- `GET /api/assets` - List assets
- `GET /api/assets/:id` - Get asset details
- `POST /api/assets` - Create asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset
- `GET /api/assets/types` - Get asset types
- `POST /api/assets/link-ticket` - Link asset to ticket

### Knowledge Base
- `GET /api/kb/categories` - List categories
- `POST /api/kb/categories` - Create category
- `GET /api/kb/articles` - List articles
- `GET /api/kb/articles/:id` - Get article
- `POST /api/kb/articles` - Create article
- `PUT /api/kb/articles/:id` - Update article
- `GET /api/kb/articles/search` - Search articles

### SLA
- `GET /api/sla/policies` - List SLA policies
- `POST /api/sla/policies` - Create policy
- `PUT /api/sla/policies/:id` - Update policy
- `GET /api/sla/ticket-slas` - Get ticket SLAs

### Reports
- `GET /api/reports/ticket-metrics` - Ticket metrics
- `GET /api/reports/agent-performance` - Agent performance
- `GET /api/reports/sla-compliance` - SLA compliance
- `GET /api/reports/customer-satisfaction` - CSAT metrics
- `GET /api/reports/ticket-trends` - Ticket trends

### Organizations & Teams
- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization
- `GET /api/teams` - List teams
- `POST /api/teams` - Create team

### Users
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user

### Meta
- `GET /api/meta` - Get all metadata (statuses, priorities, types, channels)

### Dashboard
- `GET /api/dashboard` - Get dashboard data

## Default Credentials

After running the seed script, you can login with these test accounts:

### Admin Account (Full Access)
- **Email:** admin@servicedesk.local
- **Password:** admin123
- **Roles:** admin, agent
- **Access:** Full system access, user management, SLA policies, reports, assets

### Agent Account (Support Staff)
- **Email:** agent@servicedesk.local
- **Password:** agent123
- **Roles:** agent
- **Access:** Manage tickets, view reports, access assets, knowledge base

### Requester Account (End User)
- **Email:** user@servicedesk.local
- **Password:** user123
- **Roles:** requester
- **Access:** Submit tickets, view own tickets, access knowledge base

## Role Permissions

### Admin
- Full system access
- User management
- SLA policy management
- Asset management
- Organization management
- Reports and analytics
- System configuration

### Agent
- Create and manage tickets
- Access knowledge base
- View reports
- Manage assets
- View organizations

### Requester
- Create tickets
- View own tickets
- Add comments
- Access knowledge base

## Best Practices

### Security
- Change default JWT_SECRET in production
- Use environment variables for sensitive data
- Enable HTTPS in production
- Implement rate limiting
- Regular security audits

### Performance
- Index frequently queried fields
- Use connection pooling
- Implement caching for metadata
- Optimize database queries
- Enable compression

### Scalability
- Use load balancers for multiple instances
- Database replication for read scaling
- File storage on CDN
- Separate email processing to queue

## Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Code Structure

**Backend:**
```
backend/src/
├── config/          # Database and schema files
├── controllers/     # Business logic
├── routes/          # API routes
├── middleware/      # Auth and validation
├── utils/           # Helper functions
└── server.js        # Entry point
```

**Frontend:**
```
frontend/src/
├── components/      # Reusable components
│   └── ui/         # UI primitives
├── contexts/        # React contexts
├── pages/          # Route pages
├── services/       # API clients
└── App.jsx         # Main app
```

## Deployment

### Production Checklist
- [ ] Set strong JWT_SECRET
- [ ] Configure production database
- [ ] Enable HTTPS
- [ ] Set up backup strategy
- [ ] Configure email service
- [ ] Set up monitoring
- [ ] Enable logging
- [ ] Configure CORS properly
- [ ] Optimize database indexes
- [ ] Set up CDN for static assets

## Support & Documentation

For issues and feature requests, please refer to the project repository.

## License

Proprietary - All rights reserved
