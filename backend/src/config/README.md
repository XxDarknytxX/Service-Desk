# Service Desk Database Schema

## Schema Files

### `complete-schema.sql`
**This is the main, consolidated schema file for the entire system.**

Run this file to set up a complete fresh database with all features:
- Core user and organization management
- Ticket system with full workflow
- SLA tracking with business hours
- Approval system with hierarchy
- Asset management
- Knowledge base
- Automation and notifications
- Time tracking and reporting

### Usage

#### Fresh Installation
```bash
mysql -u root -p your_database_name < complete-schema.sql
```

Or using the Node.js script:
```bash
node run-migration.js
```

#### What's Included

**Core Tables:**
- users, roles, user_roles
- organizations, organization_members
- departments, teams, team_members
- user_hierarchy

**Ticket System:**
- tickets, ticket_comments, ticket_tags, ticket_tag_links
- ticket_statuses, ticket_priorities, ticket_types, ticket_channels
- ticket_attachments, ticket_events
- ticket_teams, ticket_reassignments

**SLA System:**
- sla_policies, ticket_slas
- business_hours, business_hours_schedules

**Approval System:**
- approval_rules, ticket_approvals, approval_history

**Asset Management:**
- asset_types, assets, asset_ticket_links

**Knowledge Base:**
- kb_categories, kb_articles

**Productivity:**
- canned_responses, time_entries
- automation_rules, automation_logs

**Notifications:**
- notifications, notification_preferences

**Reporting:**
- satisfaction_ratings
- custom_field_definitions, custom_field_values
- saved_filters

### Key Features

1. **Hierarchical Organizations**
   - Departments with parent/child relationships
   - Teams linked to departments
   - User reporting structure

2. **Advanced Ticket Management**
   - Multi-team assignment
   - Approval workflows with multiple levels
   - SLA tracking with business hours support
   - Automatic escalation

3. **Flexible Approval System**
   - Rule-based approval triggers
   - Manual approval assignment
   - Return-to-agent/team after approval
   - Approval history tracking

4. **Queue Management**
   - Team-based queues
   - Personal tickets
   - Unclaimed tickets
   - Resolved tickets (team-scoped)

5. **Access Control**
   - Role-based permissions (admin, agent, requester)
   - Team-scoped visibility for agents
   - System-wide visibility for admins
