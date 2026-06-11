# Service Desk - Full Lifecycle & UI Revamp Plan

## Part 1: Backend - Full Ticket Lifecycle

### 1a. Enhanced Ticket Update with Workflow Validation
**File: `backend/src/controllers/ticketController.js`**
- Add status transition validation (e.g., closed->solved not allowed directly, must reopen first)
- Auto-set `closed_at` when status changes to solved/closed
- Auto-set `first_responded_at` when agent first comments
- Auto-increment `reopened_count` when moving from closed/solved back to open
- Enhanced audit trail: log old->new values for field changes, not just field names
- Allow requesters to reopen their own solved tickets (transition solved->open)

### 1b. SLA Auto-Assignment on Ticket Create/Update
**File: `backend/src/controllers/ticketController.js`**
- On ticket create: find matching SLA policy (by priority + team), create `ticket_slas` record with calculated due dates
- On priority/team change: recalculate SLA if policy changes
- Check SLA breach on comment (first public comment = response SLA met)

### 1c. Ticket SLA Status Endpoint
**File: `backend/src/controllers/ticketController.js`**
- New: `GET /tickets/:id/sla` - Returns SLA data for a specific ticket (response_due_at, resolve_due_at, breach status, time remaining)

### 1d. Bulk Operations
**File: `backend/src/controllers/ticketController.js`**
- New: `PATCH /tickets/bulk` - Bulk update status, priority, assignee, team for multiple ticket IDs

### 1e. Quick Actions
**File: `backend/src/controllers/ticketController.js`**
- New: `POST /tickets/:id/assign` - Quick assign to self (agent takes ownership)
- New: `POST /tickets/:id/escalate` - Escalate priority (bump up one level) + log event

## Part 2: Frontend - Vodafone Design System

### 2a. CSS Design Tokens & Theme
**File: `frontend/src/styles/main.css`**
- Vodafone brand: `--brand: #E60000` (Vodafone Red), `--brand-dark: #BD0000`, `--brand-light: #FF4D4D`
- Glassmorphism: `backdrop-filter: blur(20px)`, glass surfaces with transparency
- Micro-animations: `@keyframes` for fadeIn, slideUp, slideIn, scaleIn, shimmer, pulse, float
- Smooth transitions on all interactive elements (200-300ms)
- New glass utility classes: `.glass`, `.glass-dark`, `.glass-card`
- Updated scrollbar with brand color accents
- Dark mode: deep dark backgrounds with glass overlays

### 2b. UI Component Updates
**Files: `frontend/src/components/ui/Button.jsx`, `Badge.jsx`, `Input.jsx`, `Modal.jsx`, `Select.jsx`, `Textarea.jsx`**
- Button: Vodafone red primary, glass secondary, subtle hover scale + glow
- Badge: Pill-style with dot indicators, smooth color transitions
- Input/Select/Textarea: Glass background, branded focus ring, floating label option
- Modal: Glass backdrop, slide-up animation, rounded-2xl
- New: Progress/StepIndicator component for ticket workflow visualization

### 2c. Icon Updates
**File: `frontend/src/components/ui/Icon.jsx`**
- Add missing icons: arrow-left, chevron-left, chevron-right, clock, inbox, check-circle, alert-circle, bar-chart, activity, message-circle, plus-circle, x, circle, comment, assignment, escalate, resolve, reopen

### 2d. AppLayout - Modern Navigation
**File: `frontend/src/components/AppLayout.jsx`**
- Glass sidebar with Vodafone branding (gradient accent strip at top)
- Responsive: full sidebar on desktop (>1024px), slide-over drawer on tablet/mobile
- Mobile hamburger menu with overlay
- Active nav item: red left border indicator + glass highlight
- Animated sidebar expand/collapse with smooth transitions
- Global search in header with keyboard shortcut
- Breadcrumb trail
- Notification badge with count

## Part 3: Frontend - Page Revamps

### 3a. Login Page
**File: `frontend/src/pages/login.jsx`**
- Full-screen Vodafone branded splash with gradient background
- Glass card login form centered
- Animated Vodafone logo
- Subtle background particles/mesh gradient

### 3b. Dashboard
**File: `frontend/src/pages/dashboard.jsx`**
- Glass stat cards with animated counters
- Ticket workflow funnel/pipeline visualization
- Recent tickets with status indicators
- Activity feed with avatars and time
- "My open tickets" quick panel for agents
- SLA health indicator

### 3c. Tickets List
**File: `frontend/src/pages/tickets.jsx`**
- Glass filter bar with pill-style active filters
- Table with row hover glass effect
- Bulk selection checkboxes with floating action bar
- Status pipeline view option (kanban-like columns)
- Quick actions on hover (assign to me, escalate)
- Responsive: card view on mobile

### 3d. Ticket Detail - Full Lifecycle View
**File: `frontend/src/pages/ticketDetail.jsx`**
- **Workflow Status Bar**: Visual step indicator showing ticket lifecycle (New → Open → Pending → Solved → Closed) with current position highlighted in Vodafone red
- **Quick Actions Bar**: Assign to Me, Escalate, Resolve, Close, Reopen buttons based on current state
- **SLA Timer**: Live countdown showing response/resolution time remaining with color coding (green→amber→red)
- **Tags**: Inline tag pills with add/remove
- **Conversation Tab**: Threaded comments with avatar, internal note highlighting (amber), rich text
- **Audit Trail Tab**: Timeline with colored event icons and detailed change descriptions (old value → new value)
- **Details Tab**: Full ticket metadata grid
- **Sidebar**: Status/Priority/Assignee/Team dropdowns, requester card, SLA card, related tickets placeholder
- Responsive 2-column layout that stacks on mobile

### 3e. Other Pages
- **Users, Teams, Organizations**: Glass cards/tables, Vodafone-themed action buttons, responsive grid
- **SLA**: Policy cards with visual time indicators, tracking with countdown timers
- **Reports**: Glass metric cards, chart placeholders with proper layout
- **Assets, KB**: Glass-themed updates with consistent design language

## Part 4: Responsive Design

All layouts will use:
- `sm:` (640px) - Mobile adjustments
- `md:` (768px) - Tablet layouts
- `lg:` (1024px) - Desktop layouts
- `xl:` (1280px) - Wide desktop

Key responsive behaviors:
- Sidebar: hidden on mobile, slide-over drawer with overlay
- Tables: horizontal scroll on mobile, or card view alternative
- Grid layouts: stack to single column on mobile
- Header: compressed on mobile, hide search text

## Implementation Order

1. Backend lifecycle enhancements (ticketController.js, routes)
2. CSS design system (main.css)
3. UI components (Button, Badge, Input, Modal, Icon, etc.)
4. AppLayout (navigation, responsive sidebar)
5. Login page
6. Dashboard
7. Tickets list (with bulk operations)
8. Ticket detail (full lifecycle view)
9. Admin pages (Users, Teams, Organizations)
10. Operations pages (SLA, Reports, Assets, KB)
11. Build & test
