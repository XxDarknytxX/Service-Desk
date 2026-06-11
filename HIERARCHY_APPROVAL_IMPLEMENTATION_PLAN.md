# Hierarchical Approval System - Complete Implementation Plan

## Overview
This document outlines a complete hierarchical approval workflow system for your Service Desk application where tickets require approval from managers/department heads before being assigned to teams.

---

## 🎯 System Design

### Organizational Structure
```
Company
├── Departments (IT, Finance, Operations, etc.)
│   ├── Department Head (Approver Level 2)
│   ├── Teams
│   │   ├── Team Lead (Approver Level 1)
│   │   └── Team Members (Agents)
│   └── Sub-departments
└── Users with Reporting Structure
    ├── Employee → Reports to → Manager → Reports to → Department Head
```

### Approval Workflow
```
1. User creates ticket
2. System checks if approval is required (based on rules)
3. If required:
   a. Ticket status → "Pending Approval"
   b. Create approval chain (Level 1 → Direct Manager, Level 2 → Dept Head)
   c. Notify first approver
4. Approver 1 (Manager) reviews and approves/rejects
5. If approved → Notify Approver 2 (Dept Head)
6. Approver 2 reviews and approves/rejects
7. If approved → Assign to team queue
8. Team members can pick up from queue
```

---

## 📊 Database Schema

### Tables to Create

#### 1. `departments`
```sql
CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_department_id INT UNSIGNED NULL,
  head_user_id INT NULL, -- Department head
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_department_id) REFERENCES departments(id),
  FOREIGN KEY (head_user_id) REFERENCES users(id)
);
```

#### 2. `user_hierarchy`
```sql
CREATE TABLE user_hierarchy (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL, -- Employee
  manager_id INT NOT NULL, -- Direct supervisor
  level INT UNSIGNED DEFAULT 1, -- 1=direct manager, 2=skip level, etc.
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, manager_id)
);
```

#### 3. `approval_rules`
```sql
CREATE TABLE approval_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  -- Conditions
  applies_to_priority_key VARCHAR(50) NULL, -- 'high', 'urgent', etc.
  applies_to_type_key VARCHAR(50) NULL,
  applies_to_department_id INT UNSIGNED NULL,
  min_estimated_cost DECIMAL(10,2) NULL,

  -- Config
  requires_approval BOOLEAN DEFAULT TRUE,
  approval_levels INT UNSIGNED DEFAULT 1,
  auto_approve_after_hours INT UNSIGNED NULL,
  priority_order INT UNSIGNED DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### 4. `ticket_approvals`
```sql
CREATE TABLE ticket_approvals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  approval_rule_id INT UNSIGNED NULL,
  approval_level INT UNSIGNED DEFAULT 1,
  total_levels INT UNSIGNED DEFAULT 1,
  approver_id INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'auto_approved') DEFAULT 'pending',
  approved_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  approver_comments TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id)
);
```

#### 5. Add to `tickets` table
```sql
ALTER TABLE tickets ADD COLUMN approval_status ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required';
ALTER TABLE tickets ADD COLUMN requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN estimated_cost DECIMAL(10,2) NULL;
ALTER TABLE users ADD COLUMN department_id INT UNSIGNED NULL;
ALTER TABLE teams ADD COLUMN department_id INT UNSIGNED NULL;
```

---

## 🔧 Backend Implementation

### Phase 1: Department Management

**File: `backend/src/controllers/departmentController.js`**
```javascript
export function makeDepartmentController(pool) {
  return {
    list: async (req, res) => {
      const [rows] = await pool.query(`
        SELECT d.*, u.full_name as head_name,
               pd.name as parent_name,
               (SELECT COUNT(*) FROM teams WHERE department_id = d.id) as team_count
        FROM departments d
        LEFT JOIN users u ON d.head_user_id = u.id
        LEFT JOIN departments pd ON d.parent_department_id = pd.id
        ORDER BY d.name
      `);
      res.json({ items: rows });
    },

    create: async (req, res) => {
      const { name, description, parent_department_id, head_user_id } = req.body;
      const [result] = await pool.query(
        `INSERT INTO departments (name, description, parent_department_id, head_user_id)
         VALUES (?, ?, ?, ?)`,
        [name, description, parent_department_id, head_user_id]
      );
      res.status(201).json({ id: result.insertId });
    },

    // ... update, delete methods
  };
}
```

**Routes: `backend/src/routes/departments.js`**
```javascript
router.get('/departments', requireAuth, controller.list);
router.post('/departments', requireAuth, requireRole('admin'), controller.create);
router.patch('/departments/:id', requireAuth, requireRole('admin'), controller.update);
router.delete('/departments/:id', requireAuth, requireRole('admin'), controller.delete);
```

### Phase 2: User Hierarchy Management

**File: `backend/src/controllers/hierarchyController.js`**
```javascript
export function makeHierarchyController(pool) {
  return {
    // Get user's reporting chain
    getReportingChain: async (req, res) => {
      const userId = req.params.id || req.user.id;
      const [chain] = await pool.query(`
        SELECT uh.level, uh.manager_id,
               u.full_name, u.email, u.title, d.name as department_name
        FROM user_hierarchy uh
        JOIN users u ON u.id = uh.manager_id
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE uh.user_id = ? AND uh.is_active = 1
        ORDER BY uh.level ASC
      `, [userId]);
      res.json({ chain });
    },

    // Set user's manager
    setManager: async (req, res) => {
      const { user_id, manager_id } = req.body;

      // Validate no circular reference
      const [circular] = await pool.query(`
        SELECT 1 FROM user_hierarchy
        WHERE user_id = ? AND manager_id = ?
      `, [manager_id, user_id]);

      if (circular.length > 0) {
        return res.status(400).json({ error: 'Circular reference detected' });
      }

      // Delete existing hierarchy for user
      await pool.query('DELETE FROM user_hierarchy WHERE user_id = ?', [user_id]);

      // Build new hierarchy chain
      await buildHierarchyChain(pool, user_id, manager_id);

      res.json({ success: true });
    },
  };
}

async function buildHierarchyChain(pool, userId, managerId, level = 1) {
  // Insert direct manager
  await pool.query(
    `INSERT INTO user_hierarchy (user_id, manager_id, level) VALUES (?, ?, ?)`,
    [userId, managerId, level]
  );

  // Get manager's manager and add to chain
  const [managerChain] = await pool.query(
    `SELECT manager_id FROM user_hierarchy WHERE user_id = ? AND level = 1`,
    [managerId]
  );

  if (managerChain.length > 0 && level < 5) { // Max 5 levels
    await buildHierarchyChain(pool, userId, managerChain[0].manager_id, level + 1);
  }
}
```

### Phase 3: Approval Rules Engine

**File: `backend/src/services/approvalService.js`**
```javascript
export async function checkApprovalRequired(pool, ticketData) {
  // Find matching approval rules (highest priority first)
  const [rules] = await pool.query(`
    SELECT * FROM approval_rules
    WHERE is_active = 1
      AND (applies_to_priority_key IS NULL OR applies_to_priority_key = ?)
      AND (applies_to_type_key IS NULL OR applies_to_type_key = ?)
      AND (applies_to_department_id IS NULL OR applies_to_department_id = ?)
      AND (min_estimated_cost IS NULL OR ? >= min_estimated_cost)
    ORDER BY priority_order DESC, id ASC
    LIMIT 1
  `, [
    ticketData.priorityKey,
    ticketData.typeKey,
    ticketData.departmentId,
    ticketData.estimated_cost || 0
  ]);

  return rules[0] || null;
}

export async function createApprovalChain(pool, ticketId, requesterId, rule) {
  // Get requester's reporting chain
  const [managers] = await pool.query(`
    SELECT manager_id, level FROM user_hierarchy
    WHERE user_id = ? AND is_active = 1
    ORDER BY level ASC
    LIMIT ?
  `, [requesterId, rule.approval_levels]);

  if (managers.length === 0) {
    throw new Error('No managers found in reporting chain');
  }

  // Create approval records for each level
  for (let i = 0; i < Math.min(managers.length, rule.approval_levels); i++) {
    await pool.query(`
      INSERT INTO ticket_approvals
      (ticket_id, approval_rule_id, approval_level, total_levels, approver_id, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [ticketId, rule.id, i + 1, rule.approval_levels, managers[i].manager_id]);
  }

  // Update ticket status
  await pool.query(`
    UPDATE tickets
    SET requires_approval = 1, approval_status = 'pending'
    WHERE id = ?
  `, [ticketId]);

  return managers[0].manager_id; // Return first approver
}

export async function processApproval(pool, approvalId, approverId, action, comments) {
  const [approval] = await pool.query(
    'SELECT * FROM ticket_approvals WHERE id = ?',
    [approvalId]
  );

  if (!approval[0] || approval[0].approver_id !== approverId) {
    throw new Error('Unauthorized or approval not found');
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  // Update approval
  await pool.query(`
    UPDATE ticket_approvals
    SET status = ?, approved_at = NOW(), approver_comments = ?
    WHERE id = ?
  `, [status, comments, approvalId]);

  if (action === 'reject') {
    // Reject ticket
    await pool.query(`
      UPDATE tickets SET approval_status = 'rejected'
      WHERE id = ?
    `, [approval[0].ticket_id]);
    return { status: 'rejected' };
  }

  // Check if this was the last approval level
  const [remaining] = await pool.query(`
    SELECT COUNT(*) as count FROM ticket_approvals
    WHERE ticket_id = ? AND status = 'pending'
  `, [approval[0].ticket_id]);

  if (remaining[0].count === 0) {
    // All approvals complete - assign to team
    await pool.query(`
      UPDATE tickets SET approval_status = 'approved'
      WHERE id = ?
    `, [approval[0].ticket_id]);
    return { status: 'fully_approved' };
  }

  return { status: 'pending_next_level' };
}
```

### Phase 4: Integrate with Ticket Creation

**Update: `backend/src/controllers/ticketController.js`**
```javascript
import { checkApprovalRequired, createApprovalChain } from '../services/approvalService.js';

// In create method, after inserting ticket:
const approvalRule = await checkApprovalRequired(pool, {
  priorityKey,
  typeKey,
  departmentId: teamId ? await getDeptFromTeam(pool, teamId) : null,
  estimated_cost: req.body.estimated_cost
});

if (approvalRule && approvalRule.requires_approval) {
  try {
    const firstApproverId = await createApprovalChain(
      pool,
      ticketId,
      requester,
      approvalRule
    );

    // Send notification to first approver
    // await notifyApprover(firstApproverId, ticketId);

    return send.created(res, {
      id: ticketId,
      ticketNumber,
      status: 'pending_approval',
      requires_approval: true
    });
  } catch (err) {
    console.error('Approval chain error:', err);
    // Continue without approval if error
  }
}
```

---

## 🎨 Frontend Implementation

### Phase 1: Department Management UI

**Page: `frontend/src/pages/departments.jsx`**
- List all departments in tree structure
- Create/edit departments
- Assign department heads
- Show team count per department

**Features:**
- Drag-and-drop to reorganize hierarchy
- Search and filter
- Department details with teams list

### Phase 2: User Hierarchy UI

**Component: `frontend/src/components/users/HierarchyManager.jsx`**
- Visual org chart
- Set manager for each user
- View reporting chain
- Bulk import from CSV

### Phase 3: Approval Rules UI

**Page: `frontend/src/pages/approvalRules.jsx`**
- Create approval rules
- Define conditions (priority, type, cost threshold)
- Set approval levels
- Enable/disable rules
- Preview which tickets match

### Phase 4: Approval Workflow UI

**Component: `frontend/src/components/approvals/ApprovalPanel.jsx`**

```jsx
function ApprovalPanel({ ticket }) {
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    loadApprovals(ticket.id);
  }, [ticket.id]);

  const handleApprove = async (approvalId) => {
    await api(`/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: { comments: approvalComments }
    });
    reload();
  };

  return (
    <Card>
      <h3>Approval Status</h3>
      {approvals.map((approval, idx) => (
        <div key={approval.id}>
          <Badge>Level {idx + 1}</Badge>
          <span>{approval.approver_name}</span>
          {approval.status === 'pending' && canApprove && (
            <Button onClick={() => handleApprove(approval.id)}>
              Approve
            </Button>
          )}
          {approval.status === 'approved' && <Icon name="check" color="green" />}
        </div>
      ))}
    </Card>
  );
}
```

**Dashboard Widget: "Pending My Approval"**
- Show tickets awaiting user's approval
- Quick approve/reject buttons
- Filters by priority

---

## 📱 User Experience Flows

### For Requester Creating Ticket:
1. Fill ticket form
2. If approval required → See message: "This ticket requires manager approval"
3. Submit ticket
4. Receive confirmation: "Ticket submitted. Awaiting approval from [Manager Name]"

### For Approver:
1. Receive notification: "Ticket #12345 requires your approval"
2. Click notification → View ticket details
3. See approval panel with:
   - Requester info
   - Ticket details
   - Estimated cost (if applicable)
   - Approval chain visualization
4. Add comments (optional)
5. Click "Approve" or "Reject"
6. If rejected → Ticket moves to "Rejected" status
7. If approved and more levels remain → Next approver notified
8. If approved and final level → Ticket assigned to team

### For Team Members:
1. Only see tickets after full approval
2. Pick up from team queue as normal

---

## 🔔 Notification System

### Email/In-App Notifications:

**Approval Requested:**
```
Subject: Ticket #12345 Requires Your Approval
Body: [Requester] has submitted a ticket that requires your approval.
      Priority: High
      Type: Purchase Request
      Estimated Cost: $1,500
      [View Ticket] [Approve] [Reject]
```

**Approval Granted:**
```
To: Requester
Subject: Your ticket #12345 has been approved
Body: [Approver] has approved your ticket. It is now assigned to [Team].
```

**Approval Rejected:**
```
To: Requester
Subject: Your ticket #12345 was not approved
Body: [Approver] has rejected your ticket.
      Reason: [Comments from approver]
      Please revise and resubmit if needed.
```

---

## 🧪 Testing Scenarios

### Test 1: Simple Approval Chain
1. Create user hierarchy: Employee → Manager
2. Create approval rule: High priority requires 1 level
3. Employee creates high priority ticket
4. Verify: Manager receives approval request
5. Manager approves
6. Verify: Ticket assigned to team

### Test 2: Multi-Level Approval
1. Create hierarchy: Employee → Manager → Dept Head
2. Rule: Cost ≥ $1000 requires 2 levels
3. Create ticket with $1500 cost
4. Manager approves
5. Verify: Dept head receives request
6. Dept head approves
7. Verify: Ticket goes to team

### Test 3: Rejection Flow
1. Create ticket requiring approval
2. Manager rejects with reason
3. Verify: Ticket status = Rejected
4. Verify: Requester notified

### Test 4: Auto-Approval Timeout
1. Rule: Auto-approve after 48 hours
2. Create ticket
3. Wait 48 hours (or manipulate timestamp)
4. Run cron job
5. Verify: Ticket auto-approved

---

## 📊 Reports & Analytics

### Approval Metrics Dashboard:
- Average approval time
- Approval rate by manager
- Rejected tickets by reason
- Bottlenecks (tickets stuck at specific level)
- SLA compliance for approval process

---

## 🚀 Implementation Priority

### Phase 1 (MVP - Week 1):
- [ ] Database schema migration
- [ ] Department management backend
- [ ] User hierarchy backend
- [ ] Basic approval rules

### Phase 2 (Week 2):
- [ ] Approval workflow logic
- [ ] Integrate with ticket creation
- [ ] Basic approval UI
- [ ] Notifications

### Phase 3 (Week 3):
- [ ] Department management UI
- [ ] Hierarchy visualization
- [ ] Advanced approval rules
- [ ] Auto-approval cron job

### Phase 4 (Week 4):
- [ ] Reports & analytics
- [ ] Bulk operations
- [ ] Mobile-optimized approval UI
- [ ] Email notifications

---

## 📝 Notes & Considerations

1. **Circular References**: Prevent A → B → A manager chains
2. **Orphaned Approvals**: Handle case where manager leaves company
3. **Bypass Option**: Admin can override/bypass approval
4. **Audit Trail**: Log all approval actions for compliance
5. **Performance**: Index heavily queried columns
6. **Scalability**: Consider async job queue for large approval chains

---

This plan provides a complete roadmap for implementing the hierarchical approval system. Would you like me to start implementing any specific phase?
