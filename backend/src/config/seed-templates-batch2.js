/**
 * Seed batch 2 — 5 more templates from ManageEngine screenshots.
 *
 * Templates:
 * 1. Vendor Account Creation for PAM (table-based vendor details)
 * 2. Tracker Access Form (date range access)
 * 3. Tender Link Access Request (simple access request)
 * 4. ShareDrive / FileShare Access Request (file path based)
 * 5. Vendor Account Deletion for PAM (table-based vendor details)
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

  // ── Ensure categories exist ──

  // "Application Access" (should already exist)
  const [appCat] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["Application Access"]);
  const appAccessId = appCat[0]?.id || 1;

  // "General Requests" (should already exist)
  const [genCat] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["General Requests"]);
  const generalId = genCat[0]?.id || 3;

  // New category: "Vendor Management" for PAM templates
  let vendorCatId;
  const [existingVendorCat] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["Vendor Management"]);
  if (existingVendorCat.length > 0) {
    vendorCatId = existingVendorCat[0].id;
    console.log(`Category "Vendor Management" already exists (id=${vendorCatId}).`);
  } else {
    const [catResult] = await pool.query(
      `INSERT INTO ticket_template_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ["Vendor Management", "Vendor account creation, deletion, and access management for PAM and external systems", "users", 6, 1]
    );
    vendorCatId = catResult.insertId;
    console.log(`Created category "Vendor Management" (id=${vendorCatId}).`);
  }

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 1: Vendor Account Creation for PAM
  //  Key feature: Table with 5 vendor rows (First Name, Surname, Email, Company, Reason)
  // ═══════════════════════════════════════════════════════
  const template1Schema = [
    {
      id: "vendor_section",
      type: "section_header",
      label: "Vendor Account Details",
      description: "Enter the details for each vendor account to be created in PAM. Fill in as many rows as needed.",
    },
    // Row 1
    {
      id: "info_row_instructions",
      type: "info_text",
      content: "Complete the details below for each vendor who needs a PAM account. You can fill up to 5 vendors per request. For more than 5 vendors, please submit additional requests.",
      variant: "info",
    },
    // Vendor 1
    {
      id: "v1_header",
      type: "section_header",
      label: "Vendor 1",
    },
    {
      id: "v1_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: true,
      width: "third",
    },
    {
      id: "v1_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: true,
      width: "third",
    },
    {
      id: "v1_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: true,
      width: "third",
    },
    {
      id: "v1_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: true,
      width: "half",
    },
    {
      id: "v1_reason",
      type: "text",
      label: "Reason for Access",
      placeholder: "Why does this vendor need PAM access?",
      required: true,
      width: "half",
    },
    // Vendor 2
    {
      id: "v2_header",
      type: "section_header",
      label: "Vendor 2 (if applicable)",
    },
    {
      id: "v2_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "v2_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "v2_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "v2_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "v2_reason",
      type: "text",
      label: "Reason for Access",
      placeholder: "Why does this vendor need PAM access?",
      required: false,
      width: "half",
    },
    // Vendor 3
    {
      id: "v3_header",
      type: "section_header",
      label: "Vendor 3 (if applicable)",
    },
    {
      id: "v3_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "v3_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "v3_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "v3_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "v3_reason",
      type: "text",
      label: "Reason for Access",
      placeholder: "Why does this vendor need PAM access?",
      required: false,
      width: "half",
    },
    // Vendor 4
    {
      id: "v4_header",
      type: "section_header",
      label: "Vendor 4 (if applicable)",
    },
    {
      id: "v4_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "v4_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "v4_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "v4_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "v4_reason",
      type: "text",
      label: "Reason for Access",
      placeholder: "Why does this vendor need PAM access?",
      required: false,
      width: "half",
    },
    // Vendor 5
    {
      id: "v5_header",
      type: "section_header",
      label: "Vendor 5 (if applicable)",
    },
    {
      id: "v5_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "v5_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "v5_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "v5_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "v5_reason",
      type: "text",
      label: "Reason for Access",
      placeholder: "Why does this vendor need PAM access?",
      required: false,
      width: "half",
    },
  ];

  const template1StdConfig = {
    subject: { visibility: "required" },
    description: { visibility: "required" },
    priority: { visibility: "visible" },
    type: { visibility: "hidden" },
    channel: { visibility: "hidden" },
    team: { visibility: "visible" },
    assignee: { visibility: "hidden" },
    organization: { visibility: "hidden" },
  };

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 2: Tracker Access Form
  //  Key feature: Start Date* + End Date* custom fields, pre-filled description
  // ═══════════════════════════════════════════════════════
  const template2Schema = [
    {
      id: "access_period_section",
      type: "section_header",
      label: "Access Period",
      description: "Specify the date range for tracker system access",
    },
    {
      id: "start_date",
      type: "date",
      label: "Start Date",
      required: true,
      width: "half",
    },
    {
      id: "end_date",
      type: "date",
      label: "End Date",
      required: true,
      width: "half",
    },
    {
      id: "access_type",
      type: "select",
      label: "Access Type",
      required: true,
      width: "half",
      options: [
        { value: "view_only", label: "View Only" },
        { value: "edit", label: "Edit Access" },
        { value: "admin", label: "Admin Access" },
      ],
    },
    {
      id: "project_name",
      type: "text",
      label: "Project / Tracker Name",
      placeholder: "Name of the project or tracker to access",
      required: false,
      width: "half",
    },
    {
      id: "justification",
      type: "textarea",
      label: "Business Justification",
      placeholder: "Explain why you need access to the Tracker System...",
      required: false,
      width: "full",
      rows: 3,
    },
  ];

  const template2StdConfig = {
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
  //  TEMPLATE 3: Tender Link Access Request
  //  Key feature: Simple template, pre-filled subject, default technician
  // ═══════════════════════════════════════════════════════
  const template3Schema = [
    {
      id: "tender_section",
      type: "section_header",
      label: "Tender Link Access Details",
    },
    {
      id: "tender_reference",
      type: "text",
      label: "Tender Reference Number",
      placeholder: "e.g., TND-2026-001",
      required: false,
      width: "half",
    },
    {
      id: "access_level",
      type: "select",
      label: "Access Level Required",
      required: true,
      width: "half",
      options: [
        { value: "view", label: "View Only" },
        { value: "submit", label: "Submit Tenders" },
        { value: "evaluate", label: "Evaluate Tenders" },
        { value: "admin", label: "Full Admin" },
      ],
    },
    {
      id: "department",
      type: "text",
      label: "Department",
      placeholder: "Your department name",
      required: true,
      width: "half",
    },
    {
      id: "role_in_tender",
      type: "text",
      label: "Role in Tender Process",
      placeholder: "e.g., Evaluator, Procurement Officer",
      required: false,
      width: "half",
    },
    {
      id: "tender_info_note",
      type: "info_text",
      content: "A task will be automatically created to set up your Tender Link account. You will be notified once access has been provisioned.",
      variant: "info",
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
  //  TEMPLATE 4: ShareDrive / FileShare Access Request
  //  Key feature: FileShare Path* required field, pre-filled description
  // ═══════════════════════════════════════════════════════
  const template4Schema = [
    {
      id: "fileshare_section",
      type: "section_header",
      label: "FileShare Access Details",
      description: "Provide details about the share drive or file share you need access to",
    },
    {
      id: "fileshare_path",
      type: "text",
      label: "FileShare Path",
      placeholder: "e.g., \\\\server\\share\\folder",
      required: true,
      width: "full",
    },
    {
      id: "access_type",
      type: "select",
      label: "Access Type",
      required: true,
      width: "half",
      options: [
        { value: "read", label: "Read Only" },
        { value: "read_write", label: "Read & Write" },
        { value: "full_control", label: "Full Control" },
        { value: "modify", label: "Modify (no delete)" },
      ],
    },
    {
      id: "access_duration",
      type: "select",
      label: "Access Duration",
      required: true,
      width: "half",
      options: [
        { value: "permanent", label: "Permanent" },
        { value: "temporary", label: "Temporary" },
        { value: "project_based", label: "Project Based" },
      ],
    },
    {
      id: "end_date",
      type: "date",
      label: "Access End Date (if temporary)",
      required: false,
      width: "half",
      conditions: [
        { field: "access_duration", operator: "not_equals", value: "permanent" },
      ],
    },
    {
      id: "business_reason",
      type: "textarea",
      label: "Business Reason",
      placeholder: "Why do you need access to this file share?",
      required: true,
      width: "full",
      rows: 3,
    },
    {
      id: "manager_name",
      type: "text",
      label: "Approving Manager Name",
      placeholder: "Name of the manager who approved this request",
      required: false,
      width: "half",
    },
    {
      id: "existing_user",
      type: "text",
      label: "Existing User with Same Access (if known)",
      placeholder: "Username of someone who already has this access",
      required: false,
      width: "half",
    },
  ];

  const template4StdConfig = {
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
  //  TEMPLATE 5: Vendor Account Deletion for PAM
  //  Key feature: Same table layout as creation, but for removal
  // ═══════════════════════════════════════════════════════
  const template5Schema = [
    {
      id: "vendor_del_section",
      type: "section_header",
      label: "Vendor Accounts to Remove",
      description: "Enter the details of each vendor account to be removed from PAM. Fill in as many rows as needed.",
    },
    {
      id: "info_del_instructions",
      type: "info_text",
      content: "Complete the details below for each vendor whose PAM account should be deleted. You can list up to 5 vendors per request.",
      variant: "warning",
    },
    // Vendor 1
    {
      id: "d1_header",
      type: "section_header",
      label: "Vendor 1",
    },
    {
      id: "d1_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: true,
      width: "third",
    },
    {
      id: "d1_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: true,
      width: "third",
    },
    {
      id: "d1_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: true,
      width: "third",
    },
    {
      id: "d1_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: true,
      width: "half",
    },
    {
      id: "d1_reason",
      type: "text",
      label: "Reason for Removal",
      placeholder: "Why should this vendor's access be revoked?",
      required: true,
      width: "half",
    },
    // Vendor 2
    {
      id: "d2_header",
      type: "section_header",
      label: "Vendor 2 (if applicable)",
    },
    {
      id: "d2_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "d2_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "d2_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "d2_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "d2_reason",
      type: "text",
      label: "Reason for Removal",
      placeholder: "Why should this vendor's access be revoked?",
      required: false,
      width: "half",
    },
    // Vendor 3
    {
      id: "d3_header",
      type: "section_header",
      label: "Vendor 3 (if applicable)",
    },
    {
      id: "d3_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "d3_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "d3_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "d3_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "d3_reason",
      type: "text",
      label: "Reason for Removal",
      placeholder: "Why should this vendor's access be revoked?",
      required: false,
      width: "half",
    },
    // Vendor 4
    {
      id: "d4_header",
      type: "section_header",
      label: "Vendor 4 (if applicable)",
    },
    {
      id: "d4_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "d4_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "d4_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "d4_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "d4_reason",
      type: "text",
      label: "Reason for Removal",
      placeholder: "Why should this vendor's access be revoked?",
      required: false,
      width: "half",
    },
    // Vendor 5
    {
      id: "d5_header",
      type: "section_header",
      label: "Vendor 5 (if applicable)",
    },
    {
      id: "d5_first_name",
      type: "text",
      label: "Vendor First Name",
      placeholder: "First name",
      required: false,
      width: "third",
    },
    {
      id: "d5_surname",
      type: "text",
      label: "Vendor Surname",
      placeholder: "Surname",
      required: false,
      width: "third",
    },
    {
      id: "d5_email",
      type: "text",
      label: "Email Address",
      placeholder: "vendor@company.com",
      required: false,
      width: "third",
    },
    {
      id: "d5_company",
      type: "text",
      label: "Company Name",
      placeholder: "Company",
      required: false,
      width: "half",
    },
    {
      id: "d5_reason",
      type: "text",
      label: "Reason for Removal",
      placeholder: "Why should this vendor's access be revoked?",
      required: false,
      width: "half",
    },
  ];

  const template5StdConfig = {
    subject: { visibility: "required" },
    description: { visibility: "required" },
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
      category_id: vendorCatId,
      name: "Vendor Account Creation for PAM",
      description: "Request creation of vendor user accounts in PAM (Privileged Access Management). Supports up to 5 vendors per request.",
      icon: "userPlus",
      fields_schema: template1Schema,
      default_subject: "Please create vendor user accounts in PAM",
      default_priority_key: "normal",
      standard_field_config: template1StdConfig,
      sort_order: 1,
    },
    {
      category_id: appAccessId,
      name: "Tracker Access Form",
      description: "Request access to the Tracker System for a specified date range",
      icon: "calendar",
      fields_schema: template2Schema,
      default_subject: "Please grant me access to the Tracker System",
      default_priority_key: "normal",
      standard_field_config: template2StdConfig,
      sort_order: 4,
    },
    {
      category_id: appAccessId,
      name: "Tender Link Access Request",
      description: "Request access to the Tender Link platform for tender submission and evaluation",
      icon: "fileText",
      fields_schema: template3Schema,
      default_subject: "Tender Link Access Request",
      default_priority_key: "normal",
      standard_field_config: template3StdConfig,
      sort_order: 5,
    },
    {
      category_id: generalId,
      name: "ShareDrive / FileShare Access Request",
      description: "Request access to shared drives, file shares, and network folders",
      icon: "upload",
      fields_schema: template4Schema,
      default_subject: "ShareDrive / FileShare Access Request",
      default_priority_key: "normal",
      standard_field_config: template4StdConfig,
      sort_order: 6,
    },
    {
      category_id: vendorCatId,
      name: "Vendor Account Deletion for PAM",
      description: "Request removal of vendor user accounts from PAM (Privileged Access Management). Supports up to 5 vendors per request.",
      icon: "trash",
      fields_schema: template5Schema,
      default_subject: "Please remove vendor user accounts from PAM",
      default_priority_key: "normal",
      standard_field_config: template5StdConfig,
      sort_order: 2,
    },
  ];

  for (const t of templates) {
    // Check if already exists
    const [existing] = await pool.query("SELECT id FROM ticket_templates WHERE name = ?", [t.name]);
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

  console.log("\nDone! Batch 2 — 5 templates seeded successfully.");
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
