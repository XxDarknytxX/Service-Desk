/**
 * Seed 5 new templates based on ManageEngine ServiceDesk Plus screenshots.
 *
 * Templates:
 * 1. Request account deletion from Active Directory
 * 2. Unable to copy data from File server
 * 3. Request an account creation in Active Directory
 * 4. Request an MSSQL account
 * 5. Request reset password for an AD Account
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const pool = await mysql.createPool({
    host: process.env.DATABASE_HOST || "localhost",
    user: process.env.DATABASE_USER || "root",
    password: process.env.DATABASE_PASSWORD || "",
    database: process.env.DATABASE_NAME || "servicedesk",
    waitForConnections: true,
  });

  console.log("Connected to database.");

  // ── Add new category: Active Directory ──
  const [existingCat] = await pool.query(
    "SELECT id FROM ticket_template_categories WHERE name = ?",
    ["Active Directory"]
  );

  let adCategoryId;
  if (existingCat.length > 0) {
    adCategoryId = existingCat[0].id;
    console.log(`Category "Active Directory" already exists (id=${adCategoryId}).`);
  } else {
    const [catResult] = await pool.query(
      `INSERT INTO ticket_template_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        "Active Directory",
        "Active Directory account management - creation, deletion, password resets",
        "shield",
        5,
        1,
      ]
    );
    adCategoryId = catResult.insertId;
    console.log(`Created category "Active Directory" (id=${adCategoryId}).`);
  }

  // Get "Application Access" category id (already exists)
  const [appAccessCat] = await pool.query(
    "SELECT id FROM ticket_template_categories WHERE name = ?",
    ["Application Access"]
  );
  const appAccessId = appAccessCat[0]?.id || 1;

  // Get "General Requests" category id (already exists)
  const [generalCat] = await pool.query(
    "SELECT id FROM ticket_template_categories WHERE name = ?",
    ["General Requests"]
  );
  const generalId = generalCat[0]?.id || 3;

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 1: Request account deletion from Active Directory
  // ═══════════════════════════════════════════════════════
  const template1Schema = [
    {
      id: "login_account",
      type: "text",
      label: "Login account to be deleted",
      placeholder: "Enter the username / login account to delete",
      required: true,
      width: "half",
    },
    {
      id: "deletion_section",
      type: "section_header",
      label: "Deletion Details",
      description: "Provide context for the account deletion request",
    },
    {
      id: "reason_for_deletion",
      type: "select",
      label: "Reason for Deletion",
      required: true,
      width: "half",
      options: [
        { value: "employee_left", label: "Employee left the company" },
        { value: "role_change", label: "Role change - no longer needed" },
        { value: "security_concern", label: "Security concern" },
        { value: "duplicate_account", label: "Duplicate account" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "last_working_day",
      type: "date",
      label: "Last Working Day",
      required: false,
      width: "half",
    },
    {
      id: "manager_approval",
      type: "radio",
      label: "Manager Approval Obtained?",
      required: true,
      width: "half",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "pending", label: "Pending" },
      ],
    },
    {
      id: "additional_notes",
      type: "textarea",
      label: "Additional Notes",
      placeholder: "Any additional information about this deletion request...",
      required: false,
      width: "full",
      rows: 3,
    },
  ];

  const template1StdConfig = {
    subject: { visibility: "visible" },
    description: { visibility: "hidden" },
    priority: { visibility: "visible" },
    type: { visibility: "hidden" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 2: Unable to copy data from File server
  // ═══════════════════════════════════════════════════════
  const template2Schema = [
    {
      id: "file_server_section",
      type: "section_header",
      label: "File Server Details",
      description: "Provide information about the file server issue",
    },
    {
      id: "server_name",
      type: "text",
      label: "File Server Name / Path",
      placeholder: "e.g., \\\\fileserver01\\shared",
      required: true,
      width: "half",
    },
    {
      id: "source_path",
      type: "text",
      label: "Source Path",
      placeholder: "Path you are copying from",
      required: true,
      width: "half",
    },
    {
      id: "destination_path",
      type: "text",
      label: "Destination Path",
      placeholder: "Path you are copying to",
      required: true,
      width: "half",
    },
    {
      id: "file_size",
      type: "text",
      label: "Approximate File Size",
      placeholder: "e.g., 2 GB",
      required: false,
      width: "half",
    },
    {
      id: "error_message",
      type: "textarea",
      label: "Error Message",
      placeholder: "Paste the exact error message you see...",
      required: false,
      width: "full",
      rows: 3,
    },
    {
      id: "impact",
      type: "select",
      label: "Impact",
      required: true,
      width: "half",
      options: [
        { value: "affects_self", label: "Affects only me" },
        { value: "affects_department", label: "Affects my department" },
        { value: "affects_multiple", label: "Affects multiple departments" },
        { value: "business_critical", label: "Business critical" },
      ],
    },
    {
      id: "impact_details",
      type: "textarea",
      label: "Impact Details",
      placeholder: "Describe how this issue impacts your work...",
      required: false,
      width: "half",
      rows: 3,
    },
    {
      id: "urgency",
      type: "select",
      label: "Urgency",
      required: true,
      width: "half",
      options: [
        { value: "low", label: "Low - Can wait" },
        { value: "medium", label: "Medium - Need within a few days" },
        { value: "high", label: "High - Need today" },
        { value: "critical", label: "Critical - Blocking work now" },
      ],
    },
    {
      id: "service_category",
      type: "select",
      label: "Service Category",
      required: false,
      width: "half",
      options: [
        { value: "file_server", label: "File Server" },
        { value: "network_drive", label: "Network Drive" },
        { value: "shared_folder", label: "Shared Folder" },
        { value: "backup_restore", label: "Backup / Restore" },
      ],
    },
    {
      id: "email_notify",
      type: "text",
      label: "E-mail ID(s) To Notify",
      placeholder: "Comma-separated email addresses",
      required: false,
      width: "full",
    },
  ];

  const template2StdConfig = {
    subject: { visibility: "required" },
    description: { visibility: "visible" },
    priority: { visibility: "visible" },
    type: { visibility: "visible" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 3: Request an account creation in Active Directory
  // ═══════════════════════════════════════════════════════
  const template3Schema = [
    {
      id: "user_section",
      type: "section_header",
      label: "New User Information",
      description: "Provide details for the new Active Directory account",
    },
    {
      id: "firstname",
      type: "text",
      label: "First Name",
      placeholder: "Employee first name",
      required: true,
      width: "half",
    },
    {
      id: "lastname",
      type: "text",
      label: "Last Name",
      placeholder: "Employee last name",
      required: true,
      width: "half",
    },
    {
      id: "department",
      type: "text",
      label: "Department",
      placeholder: "e.g., Finance, IT, Marketing",
      required: true,
      width: "half",
    },
    {
      id: "job_title",
      type: "text",
      label: "Job Title",
      placeholder: "e.g., Software Engineer, Analyst",
      required: true,
      width: "half",
    },
    {
      id: "reporting_manager",
      type: "text",
      label: "Reporting Manager",
      placeholder: "Manager's full name",
      required: true,
      width: "half",
    },
    {
      id: "phone_contact",
      type: "text",
      label: "Phone Contact",
      placeholder: "Employee phone number",
      required: false,
      width: "half",
    },
    {
      id: "start_date",
      type: "date",
      label: "Start Date",
      required: true,
      width: "half",
    },
    {
      id: "account_type",
      type: "select",
      label: "Account Type",
      required: true,
      width: "half",
      options: [
        { value: "permanent", label: "Permanent Employee" },
        { value: "contractor", label: "Contractor" },
        { value: "temporary", label: "Temporary / Intern" },
        { value: "service", label: "Service Account" },
      ],
    },
    {
      id: "access_section",
      type: "section_header",
      label: "Access Requirements",
      description: "Specify what access the new account requires",
    },
    {
      id: "copy_access_from",
      type: "text",
      label: "Copy Access From (existing user)",
      placeholder: "Username of existing user to copy permissions from",
      required: false,
      width: "full",
    },
    {
      id: "additional_groups",
      type: "textarea",
      label: "Additional AD Groups Required",
      placeholder: "List any specific AD security groups needed...",
      required: false,
      width: "full",
      rows: 3,
    },
    {
      id: "email_required",
      type: "radio",
      label: "Email Account Required?",
      required: true,
      width: "half",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "vpn_required",
      type: "radio",
      label: "VPN Access Required?",
      required: false,
      width: "half",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
  ];

  const template3StdConfig = {
    subject: { visibility: "required" },
    description: { visibility: "visible" },
    priority: { visibility: "visible" },
    type: { visibility: "hidden" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 4: Request an MSSQL account
  // ═══════════════════════════════════════════════════════
  const template4Schema = [
    {
      id: "sql_section",
      type: "section_header",
      label: "MSSQL Access Details",
      description: "Provide details for the MSSQL database account request",
    },
    {
      id: "server_instance",
      type: "text",
      label: "SQL Server Instance",
      placeholder: "e.g., SQLPROD01\\INSTANCE1",
      required: true,
      width: "half",
    },
    {
      id: "database_name",
      type: "text",
      label: "Database Name",
      placeholder: "Name of the database to access",
      required: true,
      width: "half",
    },
    {
      id: "auth_type",
      type: "radio",
      label: "Authentication Type",
      required: true,
      width: "full",
      options: [
        { value: "windows", label: "Windows Authentication" },
        { value: "sql", label: "SQL Authentication" },
      ],
    },
    {
      id: "access_level",
      type: "select",
      label: "Access Level Required",
      required: true,
      width: "half",
      options: [
        { value: "read_only", label: "Read Only (db_datareader)" },
        { value: "read_write", label: "Read / Write (db_datawriter)" },
        { value: "execute", label: "Execute Stored Procedures" },
        { value: "owner", label: "Database Owner (db_owner)" },
        { value: "sysadmin", label: "Sysadmin (requires special approval)" },
      ],
    },
    {
      id: "purpose",
      type: "select",
      label: "Purpose",
      required: true,
      width: "half",
      options: [
        { value: "development", label: "Development" },
        { value: "testing", label: "Testing / QA" },
        { value: "reporting", label: "Reporting" },
        { value: "production_support", label: "Production Support" },
        { value: "migration", label: "Data Migration" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "justification",
      type: "textarea",
      label: "Business Justification",
      placeholder: "Explain why you need this access...",
      required: true,
      width: "full",
      rows: 3,
    },
    {
      id: "access_duration",
      type: "select",
      label: "Access Duration",
      required: true,
      width: "half",
      options: [
        { value: "permanent", label: "Permanent" },
        { value: "3_months", label: "3 Months" },
        { value: "6_months", label: "6 Months" },
        { value: "1_year", label: "1 Year" },
        { value: "project_based", label: "Project Based" },
      ],
    },
    {
      id: "expiry_date",
      type: "date",
      label: "Access Expiry Date (if temporary)",
      required: false,
      width: "half",
      conditions: [
        { field: "access_duration", operator: "not_equals", value: "permanent" },
      ],
    },
  ];

  const template4StdConfig = {
    subject: { visibility: "visible" },
    description: { visibility: "visible" },
    priority: { visibility: "visible" },
    type: { visibility: "hidden" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 5: Request reset password for an AD Account
  // ═══════════════════════════════════════════════════════
  const template5Schema = [
    {
      id: "account_info",
      type: "section_header",
      label: "Account Information",
      description: "Identify the account that needs a password reset",
    },
    {
      id: "ad_username",
      type: "text",
      label: "AD Username",
      placeholder: "Enter the Active Directory username",
      required: true,
      width: "half",
    },
    {
      id: "account_owner_name",
      type: "text",
      label: "Account Owner Full Name",
      placeholder: "Full name of the account owner",
      required: true,
      width: "half",
    },
    {
      id: "reset_reason",
      type: "select",
      label: "Reason for Reset",
      required: true,
      width: "half",
      options: [
        { value: "forgot_password", label: "Forgot Password" },
        { value: "account_locked", label: "Account Locked Out" },
        { value: "expired", label: "Password Expired" },
        { value: "security_incident", label: "Security Incident" },
        { value: "new_employee", label: "New Employee First Login" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "is_self_request",
      type: "radio",
      label: "Is this for your own account?",
      required: true,
      width: "half",
      options: [
        { value: "yes", label: "Yes, my own account" },
        { value: "no", label: "No, on behalf of someone else" },
      ],
    },
    {
      id: "contact_method",
      type: "select",
      label: "How should we send the new password?",
      required: true,
      width: "half",
      options: [
        { value: "phone", label: "Phone Call" },
        { value: "personal_email", label: "Personal Email" },
        { value: "manager", label: "Send to Manager" },
        { value: "in_person", label: "In Person at IT Desk" },
      ],
    },
    {
      id: "contact_info",
      type: "text",
      label: "Contact Phone / Personal Email",
      placeholder: "Phone number or personal email for password delivery",
      required: false,
      width: "half",
      conditions: [
        { field: "contact_method", operator: "not_equals", value: "in_person" },
        { field: "contact_method", operator: "not_equals", value: "manager" },
      ],
    },
    {
      id: "info_note",
      type: "info_text",
      content: "For security reasons, password resets require identity verification. Please have your employee ID ready when contacted by IT.",
      variant: "warning",
    },
  ];

  const template5StdConfig = {
    subject: { visibility: "required" },
    description: { visibility: "hidden" },
    priority: { visibility: "visible" },
    type: { visibility: "hidden" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  INSERT ALL 5 TEMPLATES
  // ═══════════════════════════════════════════════════════

  const templates = [
    {
      category_id: adCategoryId,
      name: "Request Account Deletion from Active Directory",
      description: "Request removal of an Active Directory user account for employees who have left or no longer require access",
      icon: "trash",
      fields_schema: template1Schema,
      default_subject: "AD Account Deletion Request",
      default_priority_key: "normal",
      standard_field_config: template1StdConfig,
      sort_order: 1,
    },
    {
      category_id: generalId,
      name: "Unable to Copy Data from File Server",
      description: "Report issues with copying data from file server / network drives",
      icon: "alert",
      fields_schema: template2Schema,
      default_subject: "Unable to copy data from File server",
      default_priority_key: "normal",
      standard_field_config: template2StdConfig,
      sort_order: 5,
    },
    {
      category_id: adCategoryId,
      name: "Request Account Creation in Active Directory",
      description: "Request a new Active Directory account for new employees, contractors, or service accounts",
      icon: "userPlus",
      fields_schema: template3Schema,
      default_subject: "Please create an account in Active Directory",
      default_priority_key: "normal",
      standard_field_config: template3StdConfig,
      sort_order: 2,
    },
    {
      category_id: appAccessId,
      name: "Request an MSSQL Account",
      description: "Request access to Microsoft SQL Server databases",
      icon: "hash",
      fields_schema: template4Schema,
      default_subject: "MSSQL Account Access Request",
      default_priority_key: "normal",
      standard_field_config: template4StdConfig,
      sort_order: 3,
    },
    {
      category_id: adCategoryId,
      name: "Request Password Reset for an AD Account",
      description: "Request a password reset for an Active Directory account",
      icon: "lock",
      fields_schema: template5Schema,
      default_subject: "Please reset password for my AD account",
      default_priority_key: "high",
      standard_field_config: template5StdConfig,
      sort_order: 3,
    },
  ];

  for (const t of templates) {
    // Check if already exists
    const [existing] = await pool.query(
      "SELECT id FROM ticket_templates WHERE name = ?",
      [t.name]
    );
    if (existing.length > 0) {
      console.log(`  Skipping "${t.name}" (already exists, id=${existing[0].id})`);
      continue;
    }

    const [result] = await pool.query(
      `INSERT INTO ticket_templates
        (category_id, name, description, icon, fields_schema, default_subject, default_priority_key, standard_field_config, sort_order, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2)`,
      [
        t.category_id,
        t.name,
        t.description,
        t.icon,
        JSON.stringify(t.fields_schema),
        t.default_subject,
        t.default_priority_key,
        JSON.stringify(t.standard_field_config),
        t.sort_order,
      ]
    );
    console.log(`  ✓ Created "${t.name}" (id=${result.insertId}, ${t.fields_schema.length} fields)`);
  }

  console.log("\nDone! 5 templates seeded successfully.");
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
