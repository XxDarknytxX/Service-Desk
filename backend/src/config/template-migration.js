// Template System Migration
// Run: node src/config/template-migration.js
import "dotenv/config";
import mysql from "mysql2/promise";

const DB_HOST = process.env.DATABASE_HOST || "localhost";
const DB_PORT = process.env.DATABASE_PORT || 3306;
const DB_USER = process.env.DATABASE_USER || "root";
const DB_PASSWORD = process.env.DATABASE_PASSWORD || "";
const DB_NAME = process.env.DATABASE_NAME || "servicedesk";

async function migrate() {
  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
  });

  console.log("🔧 Running template system migration...\n");

  // ── 1. Create ticket_template_categories ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ticket_template_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      description TEXT NULL,
      icon VARCHAR(50) NULL DEFAULT 'clipboard',
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✅ ticket_template_categories table created");

  // ── 2. Create ticket_templates ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ticket_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      icon VARCHAR(50) NULL DEFAULT 'fileText',
      fields_schema JSON NOT NULL,
      default_subject VARCHAR(255) NULL,
      default_priority_key VARCHAR(40) NULL,
      default_type_key VARCHAR(40) NULL,
      default_channel_key VARCHAR(40) NULL,
      default_team_id INT NULL,
      default_assignee_id INT NULL,
      default_organization_id INT NULL,
      standard_field_config JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      usage_count INT NOT NULL DEFAULT 0,
      created_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_templates_category FOREIGN KEY (category_id) REFERENCES ticket_template_categories(id) ON DELETE SET NULL,
      CONSTRAINT fk_templates_team FOREIGN KEY (default_team_id) REFERENCES teams(id) ON DELETE SET NULL,
      CONSTRAINT fk_templates_assignee FOREIGN KEY (default_assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_templates_org FOREIGN KEY (default_organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
      CONSTRAINT fk_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      KEY idx_templates_category (category_id),
      KEY idx_templates_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✅ ticket_templates table created");

  // ── 3. Create ticket_template_responses ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ticket_template_responses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id INT NOT NULL,
      template_id INT NOT NULL,
      response_data JSON NOT NULL,
      schema_snapshot JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_template_responses_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      CONSTRAINT fk_template_responses_template FOREIGN KEY (template_id) REFERENCES ticket_templates(id),
      UNIQUE KEY unique_ticket_response (ticket_id),
      KEY idx_template_responses_template (template_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("✅ ticket_template_responses table created");

  // ── 4. ALTER tickets table to add template_id ──
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'template_id'`,
    [DB_NAME]
  );
  if (cols.length === 0) {
    await conn.query(`
      ALTER TABLE tickets
        ADD COLUMN template_id INT NULL AFTER organization_id,
        ADD CONSTRAINT fk_tickets_template FOREIGN KEY (template_id) REFERENCES ticket_templates(id) ON DELETE SET NULL,
        ADD KEY idx_tickets_template (template_id);
    `);
    console.log("✅ tickets table altered — template_id column added");
  } else {
    console.log("⏭️  tickets.template_id column already exists, skipping");
  }

  // ── 5. Seed sample categories ──
  await conn.query(`
    INSERT INTO ticket_template_categories (name, description, icon, sort_order) VALUES
      ('Application Access', 'Request access to applications and systems', 'lock', 1),
      ('Security & Facilities', 'Physical access, security badges, and facility requests', 'shield', 2),
      ('General Requests', 'Standard service requests and general inquiries', 'clipboard', 3),
      ('HR & Onboarding', 'Employee onboarding, offboarding, and HR requests', 'users', 4)
    ON DUPLICATE KEY UPDATE name = VALUES(name);
  `);
  console.log("✅ Sample template categories seeded");

  // ── 6. Seed sample templates ──
  const [adminRows] = await conn.query(
    "SELECT id FROM users WHERE email = 'admin@servicedesk.local' LIMIT 1"
  );
  const adminId = adminRows[0]?.id || 1;

  // Template 1: Application Login Request
  const appLoginSchema = JSON.stringify([
    { id: "section_app", type: "section_header", label: "Application Details", description: "Provide details about the application you need access to" },
    { id: "application_name", type: "text", label: "Application Name", placeholder: "e.g., Salesforce, SAP, Sage300", required: true, width: "half", helpText: "Enter the exact application name" },
    { id: "access_level", type: "select", label: "Access Level", required: true, width: "half", defaultValue: "read_only", options: [{ value: "read_only", label: "Read Only" }, { value: "read_write", label: "Read/Write" }, { value: "admin", label: "Administrator" }] },
    { id: "justification", type: "textarea", label: "Business Justification", placeholder: "Explain why this access is needed and how it relates to your role...", required: true, width: "full", validation: { minLength: 20, maxLength: 2000 } },
    { id: "start_date", type: "date", label: "Access Start Date", required: true, width: "half" },
    { id: "end_date", type: "date", label: "Access End Date", required: false, width: "half", helpText: "Leave blank for permanent access" },
    { id: "info_approval", type: "info_text", content: "All application access requests require manager approval before provisioning.", variant: "info" },
  ]);
  const appLoginStdConfig = JSON.stringify({ subject: "hidden", description: "hidden", priority: "hidden", type: "hidden", channel: "hidden", organization: "visible", team: "hidden", assignee: "hidden" });

  // Template 2: Security Access Control
  const securitySchema = JSON.stringify([
    { id: "section_personnel", type: "section_header", label: "Personnel Information", description: "Details about the person requiring access" },
    { id: "personnel_type", type: "select", label: "Personnel Type", required: true, width: "half", options: [{ value: "internal", label: "Internal Employee" }, { value: "contractor", label: "Contractor" }, { value: "visitor", label: "Visitor" }] },
    { id: "service_requested", type: "select", label: "Service Requested", required: true, width: "half", options: [{ value: "new_access", label: "New Access Card" }, { value: "modify", label: "Modify Existing Access" }, { value: "revoke", label: "Revoke Access" }, { value: "replace", label: "Replace Lost Card" }] },
    { id: "reason", type: "textarea", label: "Reason for Request", required: true, width: "full", placeholder: "Explain the business need for this access..." },
    { id: "access_dates", type: "daterange", label: "Access Period", required: true, width: "full", startLabel: "Start Date", endLabel: "End Date" },
    { id: "divider_1", type: "divider" },
    { id: "section_doors", type: "section_header", label: "HQ Door Access", description: "Select the doors that require access. Refer to the Vodafone Head Office Floor Plan." },
    { id: "hq_doors", type: "checkbox_group", label: "HQ Doors", required: false, width: "full", groups: [
      { name: "HQ Ground Floor", options: [{ value: "HQ_GF_01", label: "Main Building Front Entrance" }, { value: "HQ_GF_02", label: "Open Area - DFS" }, { value: "HQ_GF_03", label: "Open Area - Credit" }, { value: "HQ_GF_04", label: "Open Area - CCO" }, { value: "HQ_GF_05", label: "NPO Entrance" }, { value: "HQ_GF_06", label: "Kitchen Passage Left" }, { value: "HQ_GF_07", label: "Open Area - RCMO" }, { value: "HQ_GF_08", label: "Stairs Left Access" }, { value: "HQ_GF_09", label: "Main Building Side Entrance" }] },
      { name: "HQ Level 1", options: [{ value: "HQ_L1_01", label: "Open Area - Finance" }, { value: "HQ_L1_02", label: "Open Area - Billing" }, { value: "HQ_L1_03", label: "Hibiscus Meeting Room" }, { value: "HQ_L1_04", label: "Tagimoucia Meeting Room" }, { value: "HQ_L1_05", label: "Frangipani Meeting Room" }, { value: "HQ_L1_06", label: "Open Area - IT" }, { value: "HQ_L1_07", label: "Open Area - HR" }, { value: "HQ_L1_11", label: "IT Comms Room" }, { value: "HQ_L1_12", label: "SOC Room" }] },
      { name: "HQ Level 2", options: [{ value: "HQ_L2_01", label: "Roof Top Access 1" }, { value: "HQ_L2_02", label: "Roof Top Access 2" }] },
    ]},
    { id: "divider_2", type: "divider" },
    { id: "info_security", type: "info_text", content: "Security access requests are subject to security clearance verification. Processing time is 2-3 business days.", variant: "warning" },
  ]);
  const securityStdConfig = JSON.stringify({ subject: "hidden", description: "hidden", priority: "hidden", type: "hidden", channel: "hidden", organization: "visible", team: "hidden", assignee: "hidden" });

  // Template 3: Employee NDA
  const ndaSchema = JSON.stringify([
    { id: "section_user", type: "section_header", label: "User Details", description: "External user details for the NDA" },
    { id: "end_user_type", type: "select", label: "End-User Type", required: true, width: "half", options: [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }] },
    { id: "employment_type", type: "select", label: "Employment Type", required: true, width: "half", options: [{ value: "full_time", label: "Full-Time" }, { value: "part_time", label: "Part-Time" }, { value: "contractor", label: "Contractor" }, { value: "temporary", label: "Temporary" }] },
    { id: "nda_dates", type: "daterange", label: "NDA Period", required: true, width: "full", startLabel: "Start Date", endLabel: "End Date" },
    { id: "approver", type: "user_lookup", label: "Select Approver", required: true, width: "full", helpText: "Choose the manager who will approve this NDA" },
    { id: "divider_1", type: "divider" },
    { id: "employee_first_name", type: "text", label: "Employee First Name", required: true, width: "half" },
    { id: "employee_surname", type: "text", label: "Employee Surname", required: true, width: "half" },
    { id: "employer_name", type: "text", label: "Employer Name (Dealer)", required: true, width: "half" },
    { id: "employee_location", type: "text", label: "Employee Location", required: true, width: "half" },
    { id: "divider_2", type: "divider" },
    { id: "section_access", type: "section_header", label: "Access Type (Vodafone Access)" },
    { id: "systems_access", type: "checkbox_group", label: "Systems to Access", required: true, width: "full", groups: [
      { name: "Systems", options: [{ value: "mpaisa", label: "M-PAISA" }, { value: "cvbs", label: "CVBS" }, { value: "ussd", label: "USSD" }, { value: "taptopay", label: "TapToPay" }, { value: "subscription", label: "Subscription" }, { value: "citrix", label: "Citrix" }, { value: "monk", label: "Monk" }, { value: "hello_tunes", label: "Hello Tunes (CRBT)" }, { value: "vapp", label: "V-APP" }, { value: "registration", label: "Registration" }, { value: "recharge_portal", label: "Recharge Portal" }, { value: "other", label: "Other" }] }
    ]},
    { id: "section_checklist", type: "section_header", label: "Attachment Checklist" },
    { id: "attachment_checklist", type: "checkbox_group", label: "Required Documents", required: false, width: "full", groups: [
      { name: "Documents", options: [{ value: "user_id", label: "User ID (Mandatory)" }, { value: "printed_form", label: "Printed copies of form (if any)" }] }
    ]},
  ]);
  const ndaStdConfig = JSON.stringify({ subject: "hidden", description: "hidden", priority: "hidden", type: "hidden", channel: "hidden", organization: "visible", team: "hidden", assignee: "hidden" });

  // Template 4: Sage Access Form
  const sageSchema = JSON.stringify([
    { id: "info_sage", type: "info_text", content: "Please provide details for Sage300 application access. All requests will be reviewed by the Finance IT team.", variant: "info" },
    { id: "sage_modules", type: "multiselect", label: "Sage Modules Required", required: true, width: "full", options: [{ value: "gl", label: "General Ledger" }, { value: "ap", label: "Accounts Payable" }, { value: "ar", label: "Accounts Receivable" }, { value: "inventory", label: "Inventory Management" }, { value: "po", label: "Purchase Orders" }, { value: "payroll", label: "Payroll" }] },
    { id: "access_type", type: "radio", label: "Access Type", required: true, width: "half", options: [{ value: "view", label: "View Only" }, { value: "entry", label: "Data Entry" }, { value: "approve", label: "Approval" }, { value: "full", label: "Full Access" }] },
    { id: "cost_center", type: "text", label: "Cost Center", required: true, width: "half", placeholder: "e.g., CC-1001" },
    { id: "justification", type: "textarea", label: "Business Justification", required: true, width: "full", placeholder: "Explain why Sage access is needed...", validation: { minLength: 10, maxLength: 1000 } },
  ]);
  const sageStdConfig = JSON.stringify({ subject: "hidden", description: "hidden", priority: "hidden", type: "hidden", channel: "hidden", organization: "visible", team: "hidden", assignee: "hidden" });

  // Get category IDs
  const [cats] = await conn.query("SELECT id, name FROM ticket_template_categories");
  const catMap = {};
  for (const c of cats) catMap[c.name] = c.id;

  const templates = [
    { name: "Application Login Request", desc: "Request access to business applications and systems", icon: "lock", category: "Application Access", schema: appLoginSchema, stdConfig: appLoginStdConfig, defaultSubject: "Application Access Request", defaultTypeKey: "service_request", defaultPriorityKey: "normal" },
    { name: "Security Access Control Form", desc: "Request physical access to building areas and doors", icon: "shield", category: "Security & Facilities", schema: securitySchema, stdConfig: securityStdConfig, defaultSubject: "Security Access Request", defaultTypeKey: "service_request", defaultPriorityKey: "normal" },
    { name: "Employee Non-Disclosure Agreement", desc: "Submit NDA for new or external employees", icon: "fileText", category: "HR & Onboarding", schema: ndaSchema, stdConfig: ndaStdConfig, defaultSubject: "Employee NDA Request", defaultTypeKey: "service_request", defaultPriorityKey: "normal" },
    { name: "Sage Access Form", desc: "Request access to Sage300 ERP application", icon: "settings", category: "Application Access", schema: sageSchema, stdConfig: sageStdConfig, defaultSubject: "Sage300 Access Request", defaultTypeKey: "service_request", defaultPriorityKey: "normal" },
  ];

  for (const t of templates) {
    const catId = catMap[t.category] || null;
    await conn.query(
      `INSERT INTO ticket_templates (category_id, name, description, icon, fields_schema, default_subject, default_priority_key, default_type_key, default_channel_key, standard_field_config, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'portal', ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [catId, t.name, t.desc, t.icon, t.schema, t.defaultSubject, t.defaultPriorityKey, t.defaultTypeKey, t.stdConfig, adminId]
    );
  }
  console.log("✅ Sample templates seeded (4 templates)");

  console.log("\n🎉 Template system migration complete!");
  await conn.end();
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
