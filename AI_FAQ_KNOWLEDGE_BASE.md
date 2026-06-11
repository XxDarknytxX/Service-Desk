# VODAFONE SERVICE DESK - AI FAQ KNOWLEDGE BASE
## RAG Document for AI Assistant Implementation

---

# 🚨 CRITICAL INSTRUCTION - READ THIS FIRST 🚨

**YOU ARE A VODAFONE SERVICE DESK ASSISTANT ONLY**

You MUST ONLY answer questions about the Vodafone Service Desk application.

**REJECT ALL OTHER QUESTIONS:**
- Mathematics (1+1, calculations, etc.) → REFUSE
- Coding/Programming (Python, JavaScript, etc.) → REFUSE
- General Knowledge (capitals, presidents, etc.) → REFUSE
- Other Software (Word, Excel, etc.) → REFUSE
- Personal Advice (what to eat, where to go, etc.) → REFUSE
- Trivia/Fun Facts → REFUSE
- Translation Requests → REFUSE

**YOUR ONLY PURPOSE:** Help users understand and use the Vodafone Service Desk application.

If asked ANYTHING outside this scope, use the out-of-scope response template below.

---

## ⚠️ CRITICAL GUARDRAILS & SAFETY INSTRUCTIONS

### SCOPE LIMITATIONS - WHAT THIS AI CAN ANSWER

**✅ THIS AI CAN ONLY ANSWER ABOUT VODAFONE SERVICE DESK:**
1. **How to use the Vodafone Service Desk application** (user interface, features, workflows)
2. **How processes work** (ticket lifecycle, approval flow, SLA tracking)
3. **Feature explanations** (what is SLA, what are queues, how approvals work)
4. **Troubleshooting usage issues** (how to create ticket, assign ticket, etc.)
5. **Best practices** for using the system effectively
6. **Navigation help** (where to find features, which page to use)

**❌ THIS AI CANNOT AND MUST NOT:**
1. **Provide actual passwords, API keys, or credentials** - NEVER reveal system passwords
2. **Answer questions about code implementation** - Direct users to documentation
3. **Provide database connection strings** - Security sensitive information
4. **Reveal internal system architecture** beyond user-facing features
5. **Make jokes or chitchat** - Stay professional and on-topic
6. **Answer ANY questions unrelated to the Vodafone Service Desk application**
7. **Provide advice on topics outside IT service management**
8. **Answer mathematical questions** (e.g., "What is 1+1?", "Calculate 5*7")
9. **Answer coding or programming questions** (e.g., "How to write Python code?")
10. **Answer general knowledge questions** (e.g., "Who is the president?", "What is the capital of France?")
11. **Answer trivia, fun facts, or entertainment questions**
12. **Provide translations or language assistance**
13. **Answer questions about other software, tools, or applications**
14. **Provide medical, legal, or financial advice**
15. **Engage in casual conversation or personal questions**

### RESPONSE PROTOCOL

**CRITICAL: YOU MUST STRICTLY ENFORCE SCOPE**
- If a question is not about the Vodafone Service Desk application, YOU MUST REFUSE to answer
- Do not attempt to answer math, coding, general knowledge, or any non-Service Desk questions
- Do not provide workarounds or indirect answers to out-of-scope questions
- Always redirect users back to Service Desk topics

**IF QUESTION IS OUT OF SCOPE (Math, Coding, General Knowledge, etc.):**
```
Response Template:
"I apologize, but I can only answer questions about the Vodafone Service Desk application.

I cannot help with:
- Mathematics or calculations
- Programming or coding
- General knowledge or trivia
- Other software or applications
- Personal advice or casual conversation

I can help you with:
- Creating and managing tickets in the Service Desk
- Understanding approval workflows
- Using queues and assignments
- SLA tracking and policies
- Knowledge base articles
- Asset management
- Team and user management
- Reporting and analytics

Is there something specific about the Vodafone Service Desk I can help you with?"
```

**IF QUESTION INVOLVES SECURITY/CREDENTIALS:**
```
Response Template:
"I cannot provide passwords, API keys, credentials, or sensitive system information.
Please contact your system administrator for access-related issues.

For general usage questions about the Service Desk, I'm happy to help!"
```

**IF UNCERTAIN ABOUT ANSWER:**
```
Response Template:
"I don't have enough information to accurately answer that question.
I recommend:
1. Checking the Help/Documentation section
2. Contacting your IT administrator
3. Asking a more specific question about [relevant feature]

What specific aspect of the Service Desk can I clarify for you?"
```

---

## 1. APPLICATION OVERVIEW

### What is the Vodafone Service Desk?
The Vodafone Service Desk is an **enterprise IT support management platform** used by Vodafone for:
- **Ticket Management**: Track and resolve IT issues and service requests
- **Approval Workflows**: Multi-level approval for requests requiring authorization
- **SLA Tracking**: Monitor response and resolution times with deadlines
- **Team Collaboration**: Assign work to teams and individuals
- **Asset Management**: Track IT assets like computers, phones, licenses
- **Knowledge Base**: Self-service articles for common issues
- **Reporting**: Analytics on tickets, agent performance, and customer satisfaction

### Who uses the Vodafone Service Desk?
1. **Requesters** - Vodafone employees who submit tickets (issues, requests)
2. **Agents** - Vodafone IT support staff who resolve tickets
3. **Managers/Approvers** - Vodafone managers who approve high-priority or expensive requests
4. **Administrators** - Vodafone system admins who configure policies and rules

### How to access the Vodafone Service Desk
1. **Login Page**: Navigate to the Vodafone Service Desk URL
2. **Enter Credentials**: Your Vodafone email address and password
3. **Dashboard**: After login, you'll see your personalized dashboard

---

## 2. TICKETS - THE CORE FEATURE

### What is a Ticket?
A **ticket** is a record of:
- An **issue** that needs fixing (e.g., "Can't access email")
- A **request** for something (e.g., "Need software installed")
- A **question** needing an answer

Every ticket has:
- **Ticket Number**: Unique ID like "SD-20240205-00001"
- **Subject**: Brief description
- **Description**: Detailed explanation
- **Status**: Current state (New, Open, Pending, Solved, etc.)
- **Priority**: Urgency level (Low, Normal, High, Urgent)
- **Assignee**: Who is working on it
- **Team**: Which support team handles it

### How to Create a Ticket

**As a Requester:**
1. Click **"New Ticket"** button (top right on any page)
2. Fill in the form:
   - **Subject**: Brief title (e.g., "VPN Not Connecting")
   - **Description**: Explain the issue in detail
   - **Priority**: Select how urgent this is
   - **Type**: Choose Incident, Service Request, Problem, or Change
3. Click **"Create Ticket"**
4. You'll receive a ticket number (e.g., SD-20240205-00001)
5. You can track progress in "My Requests" queue

**As an Agent:**
- Same process, but you can also:
  - Assign to yourself immediately
  - Set team assignment
  - Add estimated cost (triggers approval if needed)

### Ticket Statuses Explained

| Status | Meaning | Who Can Set |
|--------|---------|-------------|
| **New** | Just created, not assigned | System (auto) |
| **Open** | Being actively worked on | Agent |
| **Pending** | Waiting for customer response | Agent |
| **On Hold** | Paused (SLA timer stops) | Agent |
| **Solved** | Fixed, awaiting confirmation | Agent |
| **Closed** | Completely finished | Agent or Auto-close |

**Status Flow:**
```
New → Open → Pending → Solved → Closed
         ↓                ↓
      On Hold ←──────────┘
         ↓
      Open (Resume)

Solved/Closed → Open (Reopen)
```

### How to View Your Tickets

**For Requesters:**
1. Go to **"Tickets"** page
2. Click **"My Requests"** tab
3. See all tickets you've created with their current status

**For Agents:**
1. Go to **"Tickets"** page
2. Use queue tabs:
   - **"My Tickets"**: Assigned to you
   - **"Team Queue"**: Unassigned tickets your team can pick up
   - **"Resolved"**: Completed tickets from your team

### How to Update a Ticket

**View Ticket Details:**
1. Click on any ticket number or subject
2. You'll see the full ticket page

**Add a Comment:**
1. Scroll to **"Comments"** section
2. Type your message
3. **Public**: Visible to requester and agents
4. **Internal Note**: Only agents can see
5. Click **"Add Comment"**

**Change Status:**
1. In the right sidebar, find **"Status"** dropdown
2. Select new status (e.g., "Solved" when fixed)
3. Change saves automatically

**Assign Ticket:**
- Click **"Assign to Me"** button (quick action)
- OR select agent from **"Assignee"** dropdown

### Ticket Priorities & Response Times

| Priority | Response Time | Resolution Time | When to Use |
|----------|---------------|-----------------|-------------|
| **Urgent** | 15 minutes | 1 hour | System down, critical |
| **High** | 1 hour | 4 hours | Major impact |
| **Normal** | 4 hours | 1 day | Standard issues |
| **Low** | 1 day | 3 days | Minor requests |

**How Priority Works:**
- Set by requester when creating ticket
- Can be escalated by agent if needed
- Affects SLA timers (see SLA section)
- Urgent tickets appear first in queues

---

## 3. APPROVAL WORKFLOWS

### What are Approvals?
Some tickets require **manager approval** before work begins. This happens when:
- **High priority** tickets (may need authorization)
- **Expensive requests** (cost above threshold, e.g., $500)
- **Specific types** (e.g., new hardware purchases)

### How Approval Works

**Step 1: Ticket Created**
```
Requester creates ticket:
  Subject: "Need New Laptop"
  Priority: High
  Estimated Cost: $1,200

System checks: Cost > $500 → Requires Approval
```

**Step 2: Approval Chain Created**
```
Level 1: Direct Manager (must approve first)
    ↓
Level 2: Department Head (approves after Level 1)
    ↓
Ticket moves to "Approved" status
```

**Step 3: Notifications Sent**
- **Level 1 Approver** receives email/notification
- Requester sees: "Waiting for [Manager Name] to approve"

**Step 4: Manager Reviews**
1. Go to **"Approvals"** page
2. Click **"Pending My Approval"** tab
3. See ticket details
4. Click **"Approve"** or **"Reject"**
5. Optionally add comments

**Step 5: Next Level or Complete**
- If **Approved**: Notify next approver (Level 2)
- If **All Levels Approved**: Ticket moves to team queue
- If **Rejected**: Requester notified, ticket cannot proceed

### How to Check Approval Status

**As Requester:**
1. Open your ticket
2. Click **"Approvals"** tab
3. See approval chain:
   - ✅ Green checkmark = Approved
   - ⏳ Pending icon = Waiting
   - ❌ Red X = Rejected

**As Manager/Approver:**
1. Go to **"Approvals"** page
2. See count of pending approvals needing your action
3. Click to review and approve/reject

### What if Approval is Rejected?
- Ticket status shows **"Approval Rejected"**
- Reason is displayed (why rejected)
- Requester can:
  - Modify request and resubmit
  - Cancel the ticket
  - Contact manager to discuss

### Manual Approval (Agent Feature)
Agents can send any ticket for approval:
1. Open ticket
2. Click **"Send for Approval"** button
3. Select approvers manually
4. Choose how many levels
5. Optionally set return assignment after approval

---

## 4. QUEUES - FINDING YOUR WORK

### What are Queues?
**Queues** are filtered views of tickets to help you find work quickly.

### Queue Types

**1. My Tickets**
- **Purpose**: See all tickets assigned to YOU
- **Who sees it**: Agents and admins
- **What's included**:
  - Tickets where Assignee = You
  - Excludes resolved/closed tickets
  - Shows active work only

**2. Team Queue**
- **Purpose**: See unclaimed tickets your team can pick up
- **Who sees it**: Team members
- **What's included**:
  - Tickets assigned to your team
  - NO assignee yet (unassigned)
  - Excludes resolved/closed
- **Action**: Click "Assign to Me" to claim a ticket

**3. My Requests**
- **Purpose**: Track tickets YOU created as requester
- **Who sees it**: Everyone
- **What's included**:
  - Tickets where Requester = You
  - All statuses (open, pending, solved)
  - Shows your submitted requests

**4. Resolved**
- **Purpose**: See completed work from your team
- **Who sees it**: Team members
- **What's included**:
  - Status = Solved or Closed
  - Team = Your team
  - Historical reference

**5. All Tickets (Admin Only)**
- **Purpose**: System-wide view
- **Who sees it**: Administrators only
- **What's included**: Every ticket in the system

### How to Use Queues

**Picking Up Work (Agents):**
1. Go to **"Tickets"** page
2. Click **"Team Queue"** tab
3. See list of unassigned tickets
4. Click on ticket to review
5. Click **"Assign to Me"** button
6. Ticket moves to your "My Tickets" queue

**Tracking Your Work:**
1. Click **"My Tickets"** tab
2. See all tickets you're working on
3. Sorted by priority (urgent first)
4. SLA timers show time remaining

**Checking Requests You Submitted:**
1. Click **"My Requests"** tab
2. See status of all your tickets
3. Click ticket to add comments or check progress

---

## 5. SLA (SERVICE LEVEL AGREEMENT)

### What is an SLA?
An **SLA** is a time commitment for:
- **Response Time**: How quickly an agent first responds
- **Resolution Time**: How quickly the issue is fully resolved

### SLA Timers

Each ticket has **TWO timers**:

**Response SLA:**
- Starts when ticket created
- Stops when agent adds first public comment
- Example: High priority = 1 hour response

**Resolution SLA:**
- Starts when ticket created
- Stops when ticket marked "Solved"
- Example: High priority = 8 hours resolution

### SLA Status Indicators

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | On Track | Plenty of time remaining (> 2 hours) |
| 🟡 Amber | At Risk | Less than 2 hours remaining |
| 🔴 Red | Breached | Past deadline |
| ✅ Green Check | Met | Resolved on time |

### Where to See SLA Timers

**Ticket List Page:**
- SLA column shows time remaining
- Example: "2h 15m left" or "45m overdue"
- Color-coded for quick scanning

**Ticket Detail Page:**
- Right sidebar shows:
  - Response SLA: Status + timer
  - Resolution SLA: Status + timer
  - Deadline timestamps

### What Happens if SLA Breaches?
- Ticket marked as **"Breached"**
- Team/manager notified automatically
- Shows in reports (affects team metrics)
- Does NOT block ticket progress (you can still resolve it)

### SLA Pausing (On Hold Status)
When ticket status = **"On Hold"**:
- SLA timer **pauses** (stops counting)
- Use when waiting for:
  - External vendor
  - Hardware delivery
  - Customer response (sometimes)
- Resume by changing status back to "Open"
- Timer continues from where it paused

### How to Extend SLA (Admin Feature)
Admins can extend deadlines:
1. Open ticket
2. Click **"Extend SLA"** option
3. Enter additional minutes (e.g., 120 minutes = 2 hours)
4. New deadline calculated
5. Useful for complex issues needing more time

---

## 6. COMMENTS & COMMUNICATION

### Types of Comments

**Public Comments:**
- ✅ Visible to requester AND agents
- Use for:
  - Asking requester for information
  - Providing updates
  - Explaining solutions
- Requester receives email notification

**Internal Notes:**
- 🔒 Only visible to agents (private)
- Use for:
  - Technical notes
  - Troubleshooting steps
  - Internal discussions
  - Handoff notes between agents
- Requester CANNOT see these

### How to Add a Comment

1. Open ticket detail page
2. Scroll to **"Comments"** section (or click "Comments" tab)
3. Type your message in text box
4. Select type:
   - **Public**: Checkbox for public comment (visible to requester)
   - **Internal Note**: Leave unchecked (agents only)
5. Click **"Add Comment"**
6. If public, requester receives notification

### Best Practices

**When to Use Public Comments:**
- "I've received your request and am working on it"
- "Please provide your employee ID"
- "This has been resolved. Please test and confirm"
- "The VPN server is now back online"

**When to Use Internal Notes:**
- "Checked server logs - found authentication error"
- "Need to escalate to network team"
- "Customer is upset - handle with care"
- "Previous agent tried Solution A, didn't work"

### Comment Notifications
- **Requester**: Gets email for every public comment
- **Assigned Agent**: Gets notification for requester replies
- **Watchers**: (Future feature) Subscribe to ticket updates

---

## 7. KNOWLEDGE BASE

### What is the Knowledge Base?
A **library of help articles** for:
- Common issues and solutions
- How-to guides
- FAQs
- Self-service support

### How to Find Articles

**Search:**
1. Go to **"Knowledge Base"** page
2. Use search bar at top
3. Enter keywords (e.g., "VPN setup")
4. Results show matching articles

**Browse by Category:**
1. See categories on left sidebar:
   - Hardware
   - Software
   - Network
   - Account & Access
   - etc.
2. Click category to see articles

### How to Use Articles

**As Requester:**
1. Search before creating ticket (might find answer)
2. Read article step-by-step
3. If doesn't help, create ticket and reference article

**As Agent:**
1. Search for solutions while working on ticket
2. Link article to ticket (helpful for requester)
3. Copy solution steps to comment

### How to Create Articles (Agents/Admins)

1. Go to **"Knowledge Base"** page
2. Click **"New Article"** button
3. Fill in:
   - **Title**: Clear, searchable (e.g., "How to Reset Password")
   - **Category**: Select appropriate category
   - **Body**: Full article content (use rich text editor)
   - **Status**: Draft (not visible) or Published (visible)
4. Click **"Save"**
5. Article appears in knowledge base

### Article Management

**Edit Article:**
1. Click article to open
2. Click **"Edit"** button
3. Make changes
4. Save (maintains version history)

**Article Status:**
- **Draft**: Work in progress, not visible to users
- **Published**: Live and searchable

---

## 8. TEAMS & ASSIGNMENTS

### What are Teams?
**Teams** are groups of agents who handle specific types of tickets:
- IT Support Team (general IT issues)
- Network Team (network/connectivity)
- Hardware Team (equipment)
- Software Team (applications)
- Security Team (security issues)

### How Team Assignment Works

**Automatic Assignment (When Creating Ticket):**
- Requester selects team from dropdown
- OR system auto-assigns based on type/keywords
- Ticket appears in that team's queue

**Manual Assignment (Agents):**
1. Open ticket
2. Change **"Team"** dropdown in sidebar
3. Select new team
4. Ticket moves to their queue
5. (Optional) Add reassignment note

### Multi-Team Support
Some tickets need multiple teams:
1. Click **"Add Team"** on ticket
2. Select additional team
3. Both teams see ticket
4. Each team marks their part complete
5. Ticket closes when all teams done

### Team Leads
- **Team Lead** role sees full team metrics
- Can reassign work within team
- Monitors team SLA performance

---

## 9. ASSET MANAGEMENT

### What are Assets?
**Assets** are IT equipment and resources:
- Computers (desktops, laptops)
- Mobile devices (phones, tablets)
- Monitors
- Printers
- Network equipment
- Software licenses

### Asset Information Tracked
Each asset has:
- **Asset Tag**: Unique ID (e.g., "COMP-2024-001")
- **Serial Number**: Manufacturer serial
- **Type**: Computer, Mobile, Monitor, etc.
- **Assigned To**: User or organization
- **Purchase Info**: Date, cost, vendor
- **Warranty**: Expiration date
- **Status**: Active, In Repair, Retired

### How to Link Assets to Tickets

**When Creating Ticket:**
1. Fill in ticket form
2. Scroll to **"Related Assets"** section
3. Search for asset by tag or serial number
4. Select asset
5. Asset appears on ticket

**On Existing Ticket:**
1. Open ticket detail page
2. Click **"Link Asset"** button
3. Search and select asset
4. Useful for tracking:
   - Hardware issues
   - Warranty claims
   - Replacement requests

### Viewing Asset Details

**Asset List:**
1. Go to **"Assets"** page (Agents/Admins only)
2. See all assets with filters:
   - Type
   - Status
   - Assigned user
3. Click asset to see full details

**Asset History:**
- See all tickets related to this asset
- Track repair history
- Identify problematic equipment

---

## 10. REPORTS & ANALYTICS

### What Reports are Available?

**1. Ticket Metrics**
- Total tickets (created, open, closed)
- Average resolution time
- Breakdown by status, priority, type
- **Use Case**: Track overall ticket volume

**2. Agent Performance**
- Tickets per agent (assigned, closed)
- Average resolution time per agent
- Customer satisfaction rating
- **Use Case**: Identify top performers, training needs

**3. SLA Compliance**
- % of tickets meeting response SLA
- % of tickets meeting resolution SLA
- Breach counts by team
- **Use Case**: Ensure service quality standards

**4. Customer Satisfaction (CSAT)**
- Average rating (1-5 stars)
- Positive vs. negative feedback
- Trends over time
- **Use Case**: Measure user happiness

**5. Ticket Trends**
- Daily/weekly/monthly volume
- Peak times (when most tickets created)
- Seasonal patterns
- **Use Case**: Staffing and capacity planning

### How to Access Reports

1. Go to **"Reports"** page (Agents/Admins only)
2. Select report type from sidebar
3. Choose date range:
   - Last 7 days
   - Last 30 days
   - Last 90 days
   - Custom range
4. View charts and tables
5. Export to CSV (optional)

### Understanding Metrics

**Average Resolution Time:**
- Time from ticket creation to "Solved" status
- Lower is better
- Affected by priority and complexity

**First Response Time:**
- Time until first agent comment
- Critical for customer satisfaction
- Should meet SLA targets

**CSAT Score:**
- 1-5 star rating from requester after resolution
- 4.0+ is excellent
- Below 3.0 indicates issues

---

## 11. USER ROLES & PERMISSIONS

### Three Main Roles

**1. Requester**
- Create tickets
- View own tickets
- Add comments to own tickets
- Rate satisfaction after resolution
- Browse knowledge base
- **Cannot**: Assign tickets, see other users' tickets, access admin features

**2. Agent**
- All Requester permissions, PLUS:
- View team queues
- Assign tickets to self or team
- Update ticket status
- Add internal notes
- Create knowledge base articles
- Access reports
- Manage assets
- **Cannot**: Change SLA policies, approval rules, create users

**3. Administrator**
- All Agent permissions, PLUS:
- Create/manage users
- Configure teams
- Set up approval rules
- Manage SLA policies
- View all tickets (system-wide)
- Access full reports
- Configure system settings

### How to Check Your Role

1. Look at sidebar navigation:
   - **See "Users", "Teams", "SLA"?** → You're Admin
   - **See "Assets", "Reports"?** → You're Agent
   - **Only see "Tickets", "My Requests"?** → You're Requester

2. Go to your profile (click name in top-right)
   - Roles listed under your name

---

## 12. COMMON WORKFLOWS

### Workflow 1: Submitting a Request (Requester)

**Scenario**: "I need Microsoft Office installed"

1. Click **"New Ticket"**
2. Fill in:
   - Subject: "Install Microsoft Office"
   - Description: "Need Office 2021 on my laptop for project work"
   - Priority: Normal
   - Type: Service Request
3. Click **"Create"**
4. Receive ticket number: SD-20240205-00123
5. Check "My Requests" to track progress
6. When agent comments, you receive email
7. Respond if agent asks questions
8. When resolved, rate satisfaction (1-5 stars)

### Workflow 2: Resolving a Ticket (Agent)

**Scenario**: "User can't print"

1. Go to **"Team Queue"** tab
2. See ticket: "Printer Not Working"
3. Click **"Assign to Me"**
4. Add internal note: "Checking printer connection"
5. Troubleshoot issue (reset printer spooler)
6. Add public comment: "I've reset the printer service. Please try printing now."
7. Change status to **"Pending"** (waiting for user to test)
8. User replies: "It works, thank you!"
9. Change status to **"Solved"**
10. Ticket automatically closed after 24 hours

### Workflow 3: Escalating an Issue (Agent)

**Scenario**: "Issue is more complex than expected"

1. Open ticket
2. Add internal note: "Network-level issue, beyond my expertise"
3. Click **"Escalate"** button (bumps priority to "High")
4. Change **"Team"** dropdown to "Network Team"
5. OR change **"Assignee"** to senior team member
6. Add public comment: "I've escalated this to our network team for specialized support"
7. Network team sees in their queue
8. They pick up and continue work

### Workflow 4: Approving a Request (Manager)

**Scenario**: "Team member needs new laptop"

1. Receive notification: "Approval Required for SD-20240205-00456"
2. Go to **"Approvals"** page
3. Click **"Pending My Approval"** tab
4. See request: "New Laptop - $1,200"
5. Review details:
   - Requester: John Doe
   - Justification: Old laptop failing, impacting work
   - Cost: $1,200
6. Decision:
   - **Approve**: Click "Approve", add comment "Approved - budget available"
   - **Reject**: Click "Reject", add reason "Budget exceeded this quarter"
7. If approved, next approver notified (or ticket moves to team queue)
8. Requester notified of decision

### Workflow 5: Checking SLA Status (Agent)

**Scenario**: "Which tickets need urgent attention?"

1. Go to **"My Tickets"** tab
2. Look at SLA column:
   - 🔴 Red "15m overdue" → URGENT (breached)
   - 🟡 Amber "30m left" → HIGH PRIORITY (at risk)
   - 🟢 Green "4h left" → NORMAL (on track)
3. Click breached ticket first
4. Add update or escalate if needed
5. Work through at-risk tickets next
6. Monitor SLA timers as you work

---

## 13. TROUBLESHOOTING & FAQ

### "I can't log in"
**Solution:**
1. Verify email address is correct
2. Check password (case-sensitive)
3. If forgotten password:
   - Click "Forgot Password" link
   - OR contact your system administrator
4. Ensure account is active (not deactivated)

### "I don't see my ticket"
**Possible Causes:**
1. **Wrong Queue Selected**: Try "My Requests" tab instead of "My Tickets"
2. **Filters Applied**: Clear status/priority filters
3. **Ticket Closed**: Check "Resolved" queue
4. **Not Logged In**: Verify you're logged in with correct account

### "I created a ticket but no one is responding"
**Check:**
1. **SLA Timer**: Is response time past deadline? (Might be breached)
2. **Team Assignment**: Was ticket assigned to correct team?
3. **Status**: Is ticket status "New" or "Open"?
4. **Priority**: If Low priority, response may take up to 24 hours

**Action:**
- If urgent: Contact team lead or manager directly
- If past SLA: Escalate or add comment requesting update

### "How do I change ticket priority?"
**As Requester:**
- Cannot change priority after creation
- Add comment explaining urgency, agent will escalate if needed

**As Agent:**
1. Open ticket
2. Change **"Priority"** dropdown in sidebar
3. OR click **"Escalate"** button (bumps to next priority level)

### "Ticket says 'Pending Approval' - what does that mean?"
**Meaning**: Ticket needs manager approval before work starts

**What to Do:**
1. Click **"Approvals"** tab on ticket
2. See who needs to approve
3. Wait for approval notification
4. If urgent, contact approver directly
5. If rejected, review reason and resubmit if needed

### "How do I reopen a closed ticket?"
**As Requester:**
1. Open the closed ticket
2. Add a new comment explaining issue persists
3. System may auto-reopen, OR agent will reopen manually

**As Agent:**
1. Open ticket
2. Change status from "Closed" to "Open"
3. Ticket reopens, reopened_count increments
4. New SLA timer starts

### "I picked up a ticket by accident - how do I unassign?"
**Solution:**
1. Open ticket
2. Change **"Assignee"** dropdown to another agent
3. OR select "(Unassigned)" to put back in team queue
4. Add internal note explaining why reassigning

### "SLA timer shows red but ticket is resolved"
**Explanation**: Ticket was resolved AFTER SLA deadline (breached)

**Impact:**
- Shows in reports as "SLA Breach"
- Affects team metrics
- Does not prevent ticket closure
- Use as learning opportunity for process improvement

### "How do I know if a ticket needs approval?"
**Indicators:**
1. Ticket detail page shows **"Approval Status"** field
2. Status shows:
   - "Not Required" = No approval needed
   - "Pending" = Waiting for approval
   - "Approved" = Approved, work can proceed
   - "Rejected" = Rejected, cannot proceed
3. **"Approvals"** tab appears on ticket

**When Approval Needed:**
- High priority tickets
- Requests with estimated cost above threshold (e.g., $500)
- Specific types (hardware purchases, access changes)
- Configured by administrator in Approval Rules

---

## 14. BEST PRACTICES

### For Requesters

**Creating Good Tickets:**
✅ **DO:**
- Use clear, descriptive subjects
- Provide detailed description (what, when, where, who affected)
- Include error messages or screenshots
- Set appropriate priority (don't mark everything Urgent)
- Check knowledge base first

❌ **DON'T:**
- Use vague subjects like "Help" or "Issue"
- Submit duplicate tickets
- Mark low-priority items as Urgent
- Skip details ("It's not working" - what's not working?)

**Communicating with Agents:**
✅ **DO:**
- Respond promptly to agent questions
- Provide requested information completely
- Test solutions and confirm if they work
- Rate satisfaction after resolution

❌ **DON'T:**
- Demand immediate response (respect SLA times)
- Create new ticket for same issue (comment on existing)
- Provide incomplete information
- Be rude or demanding

### For Agents

**Managing Workload:**
✅ **DO:**
- Check "My Tickets" queue regularly
- Prioritize by SLA urgency (red/amber first)
- Add internal notes for complex issues (helps team)
- Update status as you work (keeps requester informed)
- Use canned responses for common issues

❌ **DON'T:**
- Hoard tickets (assign only what you can handle)
- Leave tickets in limbo (update status or reassign)
- Skip first response (SLA starts ticking immediately)
- Ignore breached SLAs

**Communication:**
✅ **DO:**
- Acknowledge ticket quickly ("Working on this")
- Set expectations ("Will have update by 2 PM")
- Explain solutions clearly (avoid jargon)
- Follow up after resolution

❌ **DON'T:**
- Ghost requesters (they worry if no updates)
- Use technical jargon without explanation
- Close without confirmation from requester
- Skip public comments (only internal notes)

### For Managers/Approvers

**Reviewing Approvals:**
✅ **DO:**
- Review approval requests within 24 hours
- Check budget/policy before approving
- Provide clear rejection reasons
- Approve in batches (daily review)

❌ **DON'T:**
- Ignore approval requests (blocks work)
- Auto-approve everything (defeats purpose)
- Reject without explanation
- Delay decisions for non-critical reasons

---

## 15. GLOSSARY OF TERMS

**Agent**: Support staff member who resolves tickets

**Approval Chain**: Series of approvers (Level 1, Level 2, etc.) who must approve sequentially

**Assignee**: The agent currently working on a ticket

**Asset**: IT equipment tracked in the system (computers, phones, etc.)

**Breach**: When SLA deadline is missed (past due)

**CSAT**: Customer Satisfaction Score (1-5 star rating)

**Escalate**: Increase priority of ticket or assign to senior staff

**Internal Note**: Private comment only visible to agents

**Knowledge Base (KB)**: Library of help articles

**Priority**: Urgency level (Low, Normal, High, Urgent)

**Public Comment**: Comment visible to requester and agents

**Queue**: Filtered view of tickets (My Tickets, Team Queue, etc.)

**Reopen**: Change status from Closed/Solved back to Open

**Requester**: Person who created the ticket (customer/end-user)

**Resolution**: When ticket is fixed and marked Solved

**Response Time**: Time until first agent comment

**SLA**: Service Level Agreement (time commitment for response/resolution)

**Status**: Current state of ticket (New, Open, Pending, Solved, Closed)

**Tag**: Label added to ticket for categorization

**Team**: Group of agents handling specific ticket types

**Ticket**: Record of an issue or request

**Ticket Number**: Unique ID (format: SD-20240205-00001)

**Type**: Category (Incident, Service Request, Problem, Change)

---

## 16. SYSTEM USAGE TIPS

### Keyboard Shortcuts (Future Feature)
- `Ctrl/Cmd + K`: Quick search
- `N`: New ticket
- `?`: Show help

### Mobile Access
- Responsive design works on phones/tablets
- Key features available on mobile
- Best experience on desktop for complex tasks

### Browser Compatibility
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Internet Explorer NOT supported

### Notifications
- Email notifications for:
  - New ticket assignments
  - Requester replies
  - Approval requests
  - SLA breach warnings
- In-app notifications in top-right bell icon

### Performance Tips
- Use filters to narrow results (faster loading)
- Pagination keeps pages fast (25 items per page)
- Close resolved tickets regularly
- Archive old tickets (admin feature)

---

## 17. WHEN TO CONTACT SUPPORT

### Contact Your System Administrator If:
- Cannot log in after multiple attempts
- Need account created or role changed
- System is down or extremely slow
- Data appears incorrect or missing
- Need approval rules changed
- Need SLA policies adjusted
- Need training for your team

### Use Knowledge Base For:
- Common issues (password reset, software installation)
- How-to guides
- Self-service solutions
- Quick answers without waiting

### Create a Ticket For:
- IT issues (technical problems)
- Service requests (need something)
- Questions (not in knowledge base)
- Non-urgent matters

### Escalate to Manager If:
- Urgent issue not getting attention
- SLA repeatedly breached
- Agent not responding
- Need approval expedited
- Policy exception needed

---

## END OF KNOWLEDGE BASE

**Last Updated**: February 5, 2024
**Version**: 1.0
**Document Purpose**: AI FAQ Assistant Training Data (RAG)

---

### IMPORTANT REMINDER FOR AI ASSISTANT:

✅ **ALWAYS:**
- Answer questions about using the Service Desk application
- Provide clear, step-by-step instructions
- Reference this document for accurate information
- Stay professional and helpful
- Admit when you don't know something

❌ **NEVER:**
- Provide passwords, API keys, or credentials
- Answer questions unrelated to Service Desk
- Make up information not in this document
- Provide technical implementation details
- Give security-sensitive information
- Engage in off-topic conversation

**If question is out of scope**: Politely decline and redirect to appropriate resource
