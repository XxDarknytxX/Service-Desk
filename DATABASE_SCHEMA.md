# Service Desk - Database Schema Reference

## Complete Table Structure

### Authentication & Users

#### roles
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(50) UNIQUE NOT NULL
description VARCHAR(255)
```

#### users
```sql
id INT PRIMARY KEY AUTO_INCREMENT
email VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
full_name VARCHAR(200)
title VARCHAR(120)
phone VARCHAR(50)
timezone VARCHAR(64)
locale VARCHAR(12)
is_active TINYINT(1) DEFAULT 1
last_login_at DATETIME
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### user_roles
```sql
user_id INT PRIMARY KEY
role_id INT PRIMARY KEY
FOREIGN KEY (user_id) REFERENCES users(id)
FOREIGN KEY (role_id) REFERENCES roles(id)
```

### Organizations

#### organizations
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(255) NOT NULL
domain VARCHAR(255) UNIQUE
industry VARCHAR(120)
size VARCHAR(80)
website VARCHAR(255)
notes TEXT
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### organization_members
```sql
organization_id INT PRIMARY KEY
user_id INT PRIMARY KEY
is_primary TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (organization_id) REFERENCES organizations(id)
FOREIGN KEY (user_id) REFERENCES users(id)
```

### Teams

#### teams
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(120) UNIQUE NOT NULL
description TEXT
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### team_members
```sql
team_id INT PRIMARY KEY
user_id INT PRIMARY KEY
is_lead TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (team_id) REFERENCES teams(id)
FOREIGN KEY (user_id) REFERENCES users(id)
```

### Tickets

#### ticket_statuses
```sql
id INT PRIMARY KEY AUTO_INCREMENT
key VARCHAR(40) UNIQUE NOT NULL
label VARCHAR(80) NOT NULL
is_closed TINYINT(1) DEFAULT 0
sort_order INT DEFAULT 0
```
**Default values:** new, open, pending, on_hold, solved, closed

#### ticket_priorities
```sql
id INT PRIMARY KEY AUTO_INCREMENT
key VARCHAR(40) UNIQUE NOT NULL
label VARCHAR(80) NOT NULL
sort_order INT DEFAULT 0
response_sla_minutes INT
resolve_sla_minutes INT
```
**Default values:** low, normal, high, urgent

#### ticket_types
```sql
id INT PRIMARY KEY AUTO_INCREMENT
key VARCHAR(40) UNIQUE NOT NULL
label VARCHAR(80) NOT NULL
```
**Default values:** incident, service_request, problem, change

#### ticket_channels
```sql
id INT PRIMARY KEY AUTO_INCREMENT
key VARCHAR(40) UNIQUE NOT NULL
label VARCHAR(80) NOT NULL
```
**Default values:** portal, email, phone, chat, api

#### tickets
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_number VARCHAR(30) UNIQUE NOT NULL
subject VARCHAR(255) NOT NULL
description TEXT
status_id INT NOT NULL
priority_id INT NOT NULL
type_id INT NOT NULL
channel_id INT NOT NULL
requester_id INT NOT NULL
assignee_id INT
team_id INT
organization_id INT
due_at DATETIME
created_by INT NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
closed_at DATETIME
reopened_count INT DEFAULT 0
FOREIGN KEY (status_id) REFERENCES ticket_statuses(id)
FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id)
FOREIGN KEY (type_id) REFERENCES ticket_types(id)
FOREIGN KEY (channel_id) REFERENCES ticket_channels(id)
FOREIGN KEY (requester_id) REFERENCES users(id)
FOREIGN KEY (assignee_id) REFERENCES users(id)
FOREIGN KEY (team_id) REFERENCES teams(id)
FOREIGN KEY (organization_id) REFERENCES organizations(id)
FOREIGN KEY (created_by) REFERENCES users(id)
```

#### ticket_comments
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_id INT NOT NULL
author_id INT NOT NULL
body TEXT NOT NULL
is_public TINYINT(1) DEFAULT 1
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (author_id) REFERENCES users(id)
```

#### ticket_tags
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(80) UNIQUE NOT NULL
```

#### ticket_tag_links
```sql
ticket_id INT PRIMARY KEY
tag_id INT PRIMARY KEY
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (tag_id) REFERENCES ticket_tags(id)
```

#### ticket_attachments
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_id INT NOT NULL
uploaded_by INT NOT NULL
file_name VARCHAR(255) NOT NULL
file_type VARCHAR(120)
file_size INT
storage_path VARCHAR(255) NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (uploaded_by) REFERENCES users(id)
```

#### ticket_events
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_id INT NOT NULL
actor_id INT
event_type VARCHAR(80) NOT NULL
payload_json JSON
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (actor_id) REFERENCES users(id)
```

### SLA Management

#### sla_policies
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(120) NOT NULL
description TEXT
response_minutes INT NOT NULL
resolve_minutes INT NOT NULL
applies_to_priority_id INT
applies_to_team_id INT
is_default TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (applies_to_priority_id) REFERENCES ticket_priorities(id)
FOREIGN KEY (applies_to_team_id) REFERENCES teams(id)
```

#### ticket_slas
```sql
ticket_id INT PRIMARY KEY
policy_id INT NOT NULL
response_due_at DATETIME
resolve_due_at DATETIME
response_breached TINYINT(1) DEFAULT 0
resolve_breached TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (policy_id) REFERENCES sla_policies(id)
```

### Knowledge Base

#### kb_categories
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(160) NOT NULL
description TEXT
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### kb_articles
```sql
id INT PRIMARY KEY AUTO_INCREMENT
category_id INT
title VARCHAR(255) NOT NULL
body LONGTEXT NOT NULL
status VARCHAR(40) DEFAULT 'draft'
author_id INT NOT NULL
published_at DATETIME
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (category_id) REFERENCES kb_categories(id)
FOREIGN KEY (author_id) REFERENCES users(id)
```

### Asset Management

#### asset_types
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(120) UNIQUE NOT NULL
description TEXT
icon VARCHAR(50)
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```
**Default values:** Computer, Mobile Device, Monitor, Printer, Network Equipment, Software License

#### assets
```sql
id INT PRIMARY KEY AUTO_INCREMENT
asset_tag VARCHAR(100) UNIQUE NOT NULL
name VARCHAR(255) NOT NULL
asset_type_id INT NOT NULL
serial_number VARCHAR(255)
manufacturer VARCHAR(200)
model VARCHAR(200)
status VARCHAR(40) DEFAULT 'active'
assigned_to_user_id INT
assigned_to_org_id INT
location VARCHAR(255)
purchase_date DATE
purchase_cost DECIMAL(12,2)
warranty_expiry_date DATE
notes TEXT
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
FOREIGN KEY (assigned_to_org_id) REFERENCES organizations(id)
```

#### asset_ticket_links
```sql
asset_id INT PRIMARY KEY
ticket_id INT PRIMARY KEY
FOREIGN KEY (asset_id) REFERENCES assets(id)
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
```

### Satisfaction & Feedback

#### satisfaction_ratings
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_id INT UNIQUE NOT NULL
rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5)
comment TEXT
rated_by INT NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (rated_by) REFERENCES users(id)
```

### Automation

#### automation_rules
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(160) NOT NULL
description TEXT
trigger_event VARCHAR(80) NOT NULL
conditions_json JSON
actions_json JSON NOT NULL
is_active TINYINT(1) DEFAULT 1
execution_order INT DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### automation_logs
```sql
id INT PRIMARY KEY AUTO_INCREMENT
rule_id INT NOT NULL
ticket_id INT
executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
success TINYINT(1) NOT NULL
error_message TEXT
FOREIGN KEY (rule_id) REFERENCES automation_rules(id)
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
```

### Email Integration

#### email_accounts
```sql
id INT PRIMARY KEY AUTO_INCREMENT
email_address VARCHAR(255) UNIQUE NOT NULL
name VARCHAR(200) NOT NULL
smtp_host VARCHAR(255)
smtp_port INT
smtp_username VARCHAR(255)
smtp_password VARCHAR(255)
imap_host VARCHAR(255)
imap_port INT
imap_username VARCHAR(255)
imap_password VARCHAR(255)
use_ssl TINYINT(1) DEFAULT 1
is_active TINYINT(1) DEFAULT 1
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### Business Hours

#### business_hours
```sql
id INT PRIMARY KEY AUTO_INCREMENT
name VARCHAR(120) NOT NULL
timezone VARCHAR(64) DEFAULT 'UTC'
is_default TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

#### business_hours_schedules
```sql
id INT PRIMARY KEY AUTO_INCREMENT
business_hours_id INT NOT NULL
day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6)
start_time TIME NOT NULL
end_time TIME NOT NULL
FOREIGN KEY (business_hours_id) REFERENCES business_hours(id) ON DELETE CASCADE
```

### Macros & Responses

#### canned_responses
```sql
id INT PRIMARY KEY AUTO_INCREMENT
title VARCHAR(160) NOT NULL
shortcut VARCHAR(40) UNIQUE
content TEXT NOT NULL
is_public TINYINT(1) DEFAULT 1
created_by INT NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (created_by) REFERENCES users(id)
```

### Time Tracking

#### time_entries
```sql
id INT PRIMARY KEY AUTO_INCREMENT
ticket_id INT NOT NULL
agent_id INT NOT NULL
duration_minutes INT NOT NULL
description TEXT
billable TINYINT(1) DEFAULT 0
started_at DATETIME NOT NULL
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
FOREIGN KEY (agent_id) REFERENCES users(id)
```

### Notifications

#### notification_preferences
```sql
id INT PRIMARY KEY AUTO_INCREMENT
user_id INT NOT NULL
event_type VARCHAR(80) NOT NULL
notify_email TINYINT(1) DEFAULT 1
notify_in_app TINYINT(1) DEFAULT 1
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id)
UNIQUE KEY (user_id, event_type)
```

#### notifications
```sql
id INT PRIMARY KEY AUTO_INCREMENT
user_id INT NOT NULL
ticket_id INT
title VARCHAR(255) NOT NULL
message TEXT
type VARCHAR(40) DEFAULT 'info'
is_read TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id)
FOREIGN KEY (ticket_id) REFERENCES tickets(id)
```

### Custom Fields

#### custom_field_definitions
```sql
id INT PRIMARY KEY AUTO_INCREMENT
entity_type VARCHAR(40) NOT NULL
field_key VARCHAR(80) NOT NULL
field_label VARCHAR(160) NOT NULL
field_type VARCHAR(40) NOT NULL
options_json JSON
is_required TINYINT(1) DEFAULT 0
sort_order INT DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
UNIQUE KEY (entity_type, field_key)
```

#### custom_field_values
```sql
id INT PRIMARY KEY AUTO_INCREMENT
field_id INT NOT NULL
entity_id INT NOT NULL
value TEXT
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id)
UNIQUE KEY (field_id, entity_id)
```

### Saved Views

#### saved_filters
```sql
id INT PRIMARY KEY AUTO_INCREMENT
user_id INT NOT NULL
name VARCHAR(160) NOT NULL
entity_type VARCHAR(40) NOT NULL
filters_json JSON NOT NULL
is_shared TINYINT(1) DEFAULT 0
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
FOREIGN KEY (user_id) REFERENCES users(id)
```

## Indexes

### High-Performance Indexes

```sql
-- Tickets
CREATE INDEX idx_tickets_status ON tickets(status_id);
CREATE INDEX idx_tickets_priority ON tickets(priority_id);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX idx_tickets_requester ON tickets(requester_id);
CREATE INDEX idx_tickets_org ON tickets(organization_id);
CREATE INDEX idx_tickets_team ON tickets(team_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- Ticket Comments
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- Ticket Events
CREATE INDEX idx_ticket_events_ticket ON ticket_events(ticket_id);

-- Ticket Attachments
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);

-- Assets
CREATE INDEX idx_assets_type ON assets(asset_type_id);
CREATE INDEX idx_assets_assigned_user ON assets(assigned_to_user_id);
CREATE INDEX idx_assets_assigned_org ON assets(assigned_to_org_id);

-- KB Articles
CREATE INDEX idx_kb_articles_category ON kb_articles(category_id);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);

-- Time Entries
CREATE INDEX idx_time_entries_ticket ON time_entries(ticket_id);
CREATE INDEX idx_time_entries_agent ON time_entries(agent_id);

-- Automation Logs
CREATE INDEX idx_automation_logs_rule ON automation_logs(rule_id);
CREATE INDEX idx_automation_logs_ticket ON automation_logs(ticket_id);

-- Saved Filters
CREATE INDEX idx_saved_filters_user ON saved_filters(user_id);

-- Canned Responses
CREATE INDEX idx_canned_responses_creator ON canned_responses(created_by);

-- Business Hours Schedules
CREATE INDEX idx_bh_schedules_bh ON business_hours_schedules(business_hours_id);

-- Satisfaction Ratings
CREATE INDEX idx_satisfaction_ticket ON satisfaction_ratings(ticket_id);

-- Custom Field Values
CREATE INDEX idx_custom_values_entity ON custom_field_values(entity_id);
```

## Relationships Overview

```
users (1) -----> (N) tickets (requester)
users (1) -----> (N) tickets (assignee)
users (1) -----> (N) ticket_comments
users (1) -----> (N) assets (assigned)
organizations (1) -----> (N) tickets
organizations (1) -----> (N) assets
teams (1) -----> (N) tickets
teams (1) -----> (N) team_members
tickets (1) -----> (N) ticket_comments
tickets (1) -----> (N) ticket_events
tickets (1) -----> (N) ticket_attachments
tickets (1) -----> (1) ticket_slas
tickets (N) <----> (N) ticket_tags
tickets (N) <----> (N) assets
kb_categories (1) -----> (N) kb_articles
sla_policies (1) -----> (N) ticket_slas
asset_types (1) -----> (N) assets
```

## Total Tables: 33

Core system provides enterprise-grade service desk functionality with comprehensive tracking, automation, and reporting capabilities.
