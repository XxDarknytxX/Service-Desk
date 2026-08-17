-- =====================================================
-- COMPLETE SERVICE DESK SCHEMA
-- =====================================================
-- This is the complete, consolidated schema for the Service Desk system
-- Run this file to set up a fresh database with all tables and features

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(200) NULL,
  title VARCHAR(120) NULL,
  department_id INT UNSIGNED NULL,
  phone VARCHAR(50) NULL,
  timezone VARCHAR(64) NULL,
  locale VARCHAR(12) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Roles (many-to-many)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NULL,
  industry VARCHAR(120) NULL,
  size VARCHAR(80) NULL,
  website VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY organizations_domain_unique (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id INT NOT NULL,
  user_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT fk_org_members_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- HIERARCHY AND DEPARTMENTS
-- =====================================================

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_department_id INT UNSIGNED NULL,
  head_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_parent_dept (parent_department_id),
  INDEX idx_head_user (head_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add department FK to users
ALTER TABLE users ADD CONSTRAINT fk_users_department
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NULL,
  department_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  is_lead TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Module Access (per-team access provisioning)
-- Queried on every login (authController.getTeamContext) — a team member's login
-- errors outright if this table is absent, so it belongs in the base schema.
-- No rows for a team = unrestricted; rows = restricted to those module keys.
CREATE TABLE IF NOT EXISTS team_module_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  module_key VARCHAR(60) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_team_module (team_id, module_key),
  CONSTRAINT fk_tma_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Hierarchy (reporting structure)
CREATE TABLE IF NOT EXISTS user_hierarchy (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT 'Employee',
  manager_id INT NOT NULL COMMENT 'Direct manager/supervisor',
  level INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Hierarchy level (1=direct manager, 2=manager of manager, etc)',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_manager (user_id, manager_id),
  INDEX idx_user (user_id),
  INDEX idx_manager (manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TICKET SYSTEM
-- =====================================================

-- Ticket Statuses
CREATE TABLE IF NOT EXISTS ticket_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Priorities
CREATE TABLE IF NOT EXISTS ticket_priorities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  response_sla_minutes INT NULL,
  resolve_sla_minutes INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Types
CREATE TABLE IF NOT EXISTS ticket_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Channels
CREATE TABLE IF NOT EXISTS ticket_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(30) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status_id INT NOT NULL,
  approval_status ENUM('not_required', 'pending', 'approved', 'rejected') DEFAULT 'not_required',
  requires_approval BOOLEAN DEFAULT FALSE,
  priority_id INT NOT NULL,
  type_id INT NOT NULL,
  channel_id INT NOT NULL,
  requester_id INT NOT NULL,
  assignee_id INT NULL,
  team_id INT NULL,
  organization_id INT NULL,
  due_at DATETIME NULL,
  estimated_cost DECIMAL(10,2) NULL DEFAULT NULL,
  actual_cost DECIMAL(10,2) NULL DEFAULT NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  solved_at DATETIME NULL,
  reopened_count INT NOT NULL DEFAULT 0,
  first_responded_at DATETIME NULL,
  CONSTRAINT fk_tickets_status FOREIGN KEY (status_id) REFERENCES ticket_statuses(id),
  CONSTRAINT fk_tickets_priority FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id),
  CONSTRAINT fk_tickets_type FOREIGN KEY (type_id) REFERENCES ticket_types(id),
  CONSTRAINT fk_tickets_channel FOREIGN KEY (channel_id) REFERENCES ticket_channels(id),
  CONSTRAINT fk_tickets_requester FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_tickets_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_tickets_status (status_id),
  KEY idx_tickets_approval_status (approval_status),
  KEY idx_tickets_priority (priority_id),
  KEY idx_tickets_assignee (assignee_id),
  KEY idx_tickets_requester (requester_id),
  KEY idx_tickets_org (organization_id),
  KEY idx_tickets_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  author_id INT NOT NULL,
  body TEXT NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_comments_author FOREIGN KEY (author_id) REFERENCES users(id),
  KEY idx_ticket_comments_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Tags
CREATE TABLE IF NOT EXISTS ticket_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Tag Links
CREATE TABLE IF NOT EXISTS ticket_tag_links (
  ticket_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (ticket_id, tag_id),
  CONSTRAINT fk_ticket_tag_links_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_tag_links_tag FOREIGN KEY (tag_id) REFERENCES ticket_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Attachments
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(120) NULL,
  file_size INT NULL,
  storage_path VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  KEY idx_ticket_attachments_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Events (audit trail)
CREATE TABLE IF NOT EXISTS ticket_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  actor_id INT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  KEY idx_ticket_events_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Multi-team support for tickets
CREATE TABLE IF NOT EXISTS ticket_teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  team_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by INT NULL,
  status ENUM('active', 'completed', 'transferred') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  completed_at DATETIME NULL,
  completed_by INT NULL,
  completion_notes TEXT NULL,
  CONSTRAINT fk_ticket_teams_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_teams_team FOREIGN KEY (team_id) REFERENCES teams(id),
  CONSTRAINT fk_ticket_teams_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE KEY unique_ticket_team (ticket_id, team_id),
  KEY idx_ticket_teams_ticket (ticket_id),
  KEY idx_ticket_teams_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket reassignment history
CREATE TABLE IF NOT EXISTS ticket_reassignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  from_team_id INT NULL,
  to_team_id INT NULL,
  from_assignee_id INT NULL,
  to_assignee_id INT NULL,
  reason TEXT NULL,
  reassigned_by INT NOT NULL,
  reassigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reassign_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_reassign_from_team FOREIGN KEY (from_team_id) REFERENCES teams(id),
  CONSTRAINT fk_reassign_to_team FOREIGN KEY (to_team_id) REFERENCES teams(id),
  CONSTRAINT fk_reassign_from_user FOREIGN KEY (from_assignee_id) REFERENCES users(id),
  CONSTRAINT fk_reassign_to_user FOREIGN KEY (to_assignee_id) REFERENCES users(id),
  CONSTRAINT fk_reassign_by FOREIGN KEY (reassigned_by) REFERENCES users(id),
  KEY idx_reassign_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SLA SYSTEM
-- =====================================================

-- Business Hours
CREATE TABLE IF NOT EXISTS business_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Business Hours Schedules
CREATE TABLE IF NOT EXISTS business_hours_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_hours_id INT NOT NULL,
  day_of_week INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT fk_bh_schedules_bh FOREIGN KEY (business_hours_id) REFERENCES business_hours(id) ON DELETE CASCADE,
  CONSTRAINT chk_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
  KEY idx_bh_schedules_bh (business_hours_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SLA Policies
CREATE TABLE IF NOT EXISTS sla_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  response_minutes INT NOT NULL,
  resolve_minutes INT NOT NULL,
  applies_to_priority_id INT NULL,
  applies_to_team_id INT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  business_hours_id INT NULL,
  use_business_hours TINYINT(1) NOT NULL DEFAULT 0,
  escalation_minutes INT NULL,
  notify_at_risk_minutes INT NULL DEFAULT 60,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sla_priority FOREIGN KEY (applies_to_priority_id) REFERENCES ticket_priorities(id),
  CONSTRAINT fk_sla_team FOREIGN KEY (applies_to_team_id) REFERENCES teams(id),
  CONSTRAINT fk_sla_business_hours FOREIGN KEY (business_hours_id) REFERENCES business_hours(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket SLAs
CREATE TABLE IF NOT EXISTS ticket_slas (
  ticket_id INT NOT NULL PRIMARY KEY,
  policy_id INT NOT NULL,
  response_due_at DATETIME NULL,
  resolve_due_at DATETIME NULL,
  response_breached TINYINT(1) NOT NULL DEFAULT 0,
  resolve_breached TINYINT(1) NOT NULL DEFAULT 0,
  response_met_at DATETIME NULL,
  resolve_met_at DATETIME NULL,
  paused_at DATETIME NULL,
  response_remaining_ms BIGINT NULL,
  resolve_remaining_ms BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_slas_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_slas_policy FOREIGN KEY (policy_id) REFERENCES sla_policies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- APPROVAL SYSTEM
-- =====================================================

-- Approval Rules
CREATE TABLE IF NOT EXISTS approval_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  applies_to_priority_id INT NULL,
  applies_to_type_id INT NULL,
  applies_to_department_id INT UNSIGNED NULL,
  applies_to_team_id INT NULL,
  min_estimated_cost DECIMAL(10,2) NULL,
  requires_approval BOOLEAN DEFAULT TRUE,
  approval_levels INT UNSIGNED DEFAULT 1,
  auto_approve_after_hours INT UNSIGNED NULL,
  priority_order INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  FOREIGN KEY (applies_to_priority_id) REFERENCES ticket_priorities(id) ON DELETE SET NULL,
  FOREIGN KEY (applies_to_type_id) REFERENCES ticket_types(id) ON DELETE SET NULL,
  FOREIGN KEY (applies_to_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (applies_to_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_active (is_active),
  INDEX idx_priority (applies_to_priority_id),
  INDEX idx_type (applies_to_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Approvals
CREATE TABLE IF NOT EXISTS ticket_approvals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  approval_rule_id INT UNSIGNED NULL,
  approval_level INT UNSIGNED NOT NULL DEFAULT 1,
  total_levels INT UNSIGNED NOT NULL DEFAULT 1,
  approver_id INT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'auto_approved', 'skipped') DEFAULT 'pending',
  approved_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  approver_comments TEXT NULL,
  require_all_at_level BOOLEAN DEFAULT FALSE,
  return_to_agent_id INT NULL,
  return_to_team_id INT NULL,
  notified_at TIMESTAMP NULL,
  reminded_at TIMESTAMP NULL,
  reminder_count INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_rule_id) REFERENCES approval_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (return_to_agent_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (return_to_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  INDEX idx_ticket (ticket_id),
  INDEX idx_status (status),
  INDEX idx_approver (approver_id),
  INDEX idx_pending_approvals (status, approver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Approval History
CREATE TABLE IF NOT EXISTS approval_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  approval_id INT UNSIGNED NOT NULL,
  actor_id INT NOT NULL,
  action ENUM('approved', 'rejected', 'requested', 'reminded', 'auto_approved') NOT NULL,
  comments TEXT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_id) REFERENCES ticket_approvals(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ticket (ticket_id),
  INDEX idx_approval (approval_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SATISFACTION AND FEEDBACK
-- =====================================================

-- Satisfaction Ratings
CREATE TABLE IF NOT EXISTS satisfaction_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  rating INT NOT NULL,
  comment TEXT NULL,
  rated_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_satisfaction_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_satisfaction_user FOREIGN KEY (rated_by) REFERENCES users(id),
  CONSTRAINT chk_rating_range CHECK (rating >= 1 AND rating <= 5),
  UNIQUE KEY unique_ticket_rating (ticket_id),
  KEY idx_satisfaction_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- AUTOMATION
-- =====================================================

-- Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  trigger_event VARCHAR(80) NOT NULL,
  conditions_json JSON NULL,
  actions_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  execution_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Automation Logs
CREATE TABLE IF NOT EXISTS automation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  ticket_id INT NULL,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success TINYINT(1) NOT NULL,
  error_message TEXT NULL,
  CONSTRAINT fk_automation_logs_rule FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_automation_logs_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  KEY idx_automation_logs_rule (rule_id),
  KEY idx_automation_logs_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- KNOWLEDGE BASE
-- =====================================================

-- KB Categories
CREATE TABLE IF NOT EXISTS kb_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- KB Articles
CREATE TABLE IF NOT EXISTS kb_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  title VARCHAR(255) NOT NULL,
  body LONGTEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  author_id INT NOT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_kb_articles_category FOREIGN KEY (category_id) REFERENCES kb_categories(id),
  CONSTRAINT fk_kb_articles_author FOREIGN KEY (author_id) REFERENCES users(id),
  KEY idx_kb_articles_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ASSET MANAGEMENT
-- =====================================================

-- Asset Types
CREATE TABLE IF NOT EXISTS asset_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NULL,
  icon VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_tag VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  asset_type_id INT NOT NULL,
  serial_number VARCHAR(255) NULL,
  manufacturer VARCHAR(200) NULL,
  model VARCHAR(200) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  assigned_to_user_id INT NULL,
  assigned_to_org_id INT NULL,
  location VARCHAR(255) NULL,
  purchase_date DATE NULL,
  purchase_cost DECIMAL(12,2) NULL,
  warranty_expiry_date DATE NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assets_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id),
  CONSTRAINT fk_assets_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  CONSTRAINT fk_assets_org FOREIGN KEY (assigned_to_org_id) REFERENCES organizations(id),
  KEY idx_assets_type (asset_type_id),
  KEY idx_assets_assigned_user (assigned_to_user_id),
  KEY idx_assets_assigned_org (assigned_to_org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Asset Ticket Links
CREATE TABLE IF NOT EXISTS asset_ticket_links (
  asset_id INT NOT NULL,
  ticket_id INT NOT NULL,
  PRIMARY KEY (asset_id, ticket_id),
  CONSTRAINT fk_asset_ticket_links_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_ticket_links_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- PRODUCTIVITY FEATURES
-- =====================================================

-- Canned Responses / Macros
CREATE TABLE IF NOT EXISTS canned_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  shortcut VARCHAR(40) NULL UNIQUE,
  content TEXT NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_canned_responses_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_canned_responses_creator (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Time Tracking
CREATE TABLE IF NOT EXISTS time_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  agent_id INT NOT NULL,
  duration_minutes INT NOT NULL,
  description TEXT NULL,
  billable TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_time_entries_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_entries_agent FOREIGN KEY (agent_id) REFERENCES users(id),
  KEY idx_time_entries_ticket (ticket_id),
  KEY idx_time_entries_agent (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  notify_email TINYINT(1) NOT NULL DEFAULT 1,
  notify_in_app TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_event (user_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ticket_id INT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  KEY idx_notifications_user (user_id),
  KEY idx_notifications_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- CUSTOM FIELDS
-- =====================================================

-- Custom Field Definitions
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  field_label VARCHAR(160) NOT NULL,
  field_type VARCHAR(40) NOT NULL,
  options_json JSON NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_entity_field (entity_type, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Custom Field Values
CREATE TABLE IF NOT EXISTS custom_field_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_id INT NOT NULL,
  entity_id INT NOT NULL,
  value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_custom_values_field FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  UNIQUE KEY unique_field_entity (field_id, entity_id),
  KEY idx_custom_values_entity (entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- REPORTING
-- =====================================================

-- Saved Filters
CREATE TABLE IF NOT EXISTS saved_filters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  filters_json JSON NOT NULL,
  is_shared TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_saved_filters_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_saved_filters_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email Integration (optional)
CREATE TABLE IF NOT EXISTS email_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  smtp_host VARCHAR(255) NULL,
  smtp_port INT NULL,
  smtp_username VARCHAR(255) NULL,
  smtp_password VARCHAR(255) NULL,
  imap_host VARCHAR(255) NULL,
  imap_port INT NULL,
  imap_username VARCHAR(255) NULL,
  imap_password VARCHAR(255) NULL,
  use_ssl TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'System administrator'),
  ('agent', 'Support agent'),
  ('requester', 'Customer requester')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Ticket Statuses
INSERT INTO ticket_statuses (`key`, label, is_closed, sort_order) VALUES
  ('draft', 'Draft', 0, 1),
  ('open', 'Open', 0, 2),
  ('pending', 'Pending', 0, 3),
  ('in_progress', 'In Progress', 0, 4),
  ('on_hold', 'On Hold', 0, 5),
  ('solved', 'Solved', 1, 6),
  ('closed', 'Closed', 1, 7)
ON DUPLICATE KEY UPDATE label = VALUES(label), is_closed = VALUES(is_closed), sort_order = VALUES(sort_order);

-- Ticket Priorities
INSERT INTO ticket_priorities (`key`, label, sort_order, response_sla_minutes, resolve_sla_minutes) VALUES
  ('low', 'Low', 1, 240, 1440),
  ('normal', 'Normal', 2, 120, 960),
  ('high', 'High', 3, 60, 480),
  ('urgent', 'Urgent', 4, 30, 240)
ON DUPLICATE KEY UPDATE label = VALUES(label), sort_order = VALUES(sort_order),
  response_sla_minutes = VALUES(response_sla_minutes), resolve_sla_minutes = VALUES(resolve_sla_minutes);

-- Ticket Types
INSERT INTO ticket_types (`key`, label) VALUES
  ('incident', 'Incident'),
  ('service_request', 'Service request'),
  ('problem', 'Problem'),
  ('change', 'Change')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Ticket Channels
INSERT INTO ticket_channels (`key`, label) VALUES
  ('portal', 'Portal'),
  ('email', 'Email'),
  ('phone', 'Phone'),
  ('chat', 'Chat'),
  ('api', 'API')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Asset Types
INSERT INTO asset_types (name, description, icon) VALUES
  ('Computer', 'Desktop and laptop computers', 'computer'),
  ('Mobile Device', 'Smartphones and tablets', 'mobile'),
  ('Monitor', 'Display monitors', 'monitor'),
  ('Printer', 'Printers and scanners', 'printer'),
  ('Network Equipment', 'Routers, switches, and access points', 'network'),
  ('Software License', 'Software licenses and subscriptions', 'license')
ON DUPLICATE KEY UPDATE description = VALUES(description), icon = VALUES(icon);

-- Default Business Hours
INSERT INTO business_hours (name, timezone, is_default) VALUES
  ('Default Business Hours', 'UTC', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Default Business Hours Schedule (Monday-Friday, 9 AM - 5 PM)
SET @default_bh_id = (SELECT id FROM business_hours WHERE name = 'Default Business Hours' LIMIT 1);

INSERT INTO business_hours_schedules (business_hours_id, day_of_week, start_time, end_time) VALUES
  (@default_bh_id, 1, '09:00:00', '17:00:00'),
  (@default_bh_id, 2, '09:00:00', '17:00:00'),
  (@default_bh_id, 3, '09:00:00', '17:00:00'),
  (@default_bh_id, 4, '09:00:00', '17:00:00'),
  (@default_bh_id, 5, '09:00:00', '17:00:00')
ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time);
