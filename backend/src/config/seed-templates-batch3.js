/**
 * Seed batch 3 — 5 more templates from ManageEngine screenshots.
 *
 * Templates:
 * 1. ZTNA Access for Overseas Travel (travel table rows)
 * 2. ZTNA Resource Access Request (resource table rows)
 * 3. ZTNA Resource Access Revocation Request (resource + revocation details)
 * 4. Request a DID extension (simple telecom request)
 * 5. Request a mobile phone for on-call support (simple equipment request)
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

  const [genCat] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["General Requests"]);
  const generalId = genCat[0]?.id || 3;

  // New category: ZTNA / Network Access
  let ztnaCatId;
  const [existingZtna] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["ZTNA / Network Access"]);
  if (existingZtna.length > 0) {
    ztnaCatId = existingZtna[0].id;
    console.log(`Category "ZTNA / Network Access" already exists (id=${ztnaCatId}).`);
  } else {
    const [catResult] = await pool.query(
      `INSERT INTO ticket_template_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ["ZTNA / Network Access", "Zero Trust Network Access requests for travel, resource access, and revocation", "shield", 7, 1]
    );
    ztnaCatId = catResult.insertId;
    console.log(`Created category "ZTNA / Network Access" (id=${ztnaCatId}).`);
  }

  // New category: Telecom & Equipment
  let telecomCatId;
  const [existingTelecom] = await pool.query("SELECT id FROM ticket_template_categories WHERE name = ?", ["Telecom & Equipment"]);
  if (existingTelecom.length > 0) {
    telecomCatId = existingTelecom[0].id;
    console.log(`Category "Telecom & Equipment" already exists (id=${telecomCatId}).`);
  } else {
    const [catResult] = await pool.query(
      `INSERT INTO ticket_template_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      ["Telecom & Equipment", "Phone extensions, mobile devices, and equipment requests", "phone", 8, 1]
    );
    telecomCatId = catResult.insertId;
    console.log(`Created category "Telecom & Equipment" (id=${telecomCatId}).`);
  }

  // Helper: generate N travel rows
  function travelRows(count) {
    const fields = [];
    for (let i = 1; i <= count; i++) {
      const req = i === 1;
      fields.push(
        { id: `tr${i}_header`, type: "section_header", label: `Trip ${i}${i > 1 ? " (if applicable)" : ""}` },
        { id: `tr${i}_country`, type: "text", label: "Destination Country", placeholder: "e.g., Australia, United States", required: req, width: "half" },
        { id: `tr${i}_arrival`, type: "date", label: "Date of Arrival", required: req, width: "half" },
        { id: `tr${i}_return`, type: "date", label: "Date of Return", required: req, width: "half" },
        { id: `tr${i}_purpose`, type: "text", label: "Purpose of Travel", placeholder: "e.g., Client meeting, Conference, Training", required: req, width: "half" }
      );
    }
    return fields;
  }

  // Helper: generate N resource access rows (6 columns)
  function resourceRows(count) {
    const fields = [];
    for (let i = 1; i <= count; i++) {
      const req = i === 1;
      fields.push(
        { id: `res${i}_header`, type: "section_header", label: `Resource ${i}${i > 1 ? " (if applicable)" : ""}` },
        { id: `res${i}_app_name`, type: "text", label: "Application Name", placeholder: "Name of the application", required: req, width: "third" },
        { id: `res${i}_hostname`, type: "text", label: "Hostname", placeholder: "e.g., app-server-01", required: req, width: "third" },
        { id: `res${i}_ip`, type: "text", label: "IP Address", placeholder: "e.g., 10.0.1.50", required: false, width: "third" },
        { id: `res${i}_port`, type: "text", label: "Port", placeholder: "e.g., 443, 8080", required: false, width: "third" },
        { id: `res${i}_url`, type: "text", label: "URL", placeholder: "e.g., https://app.internal.com", required: false, width: "third" },
        { id: `res${i}_service`, type: "text", label: "Service", placeholder: "e.g., HTTPS, SSH, RDP", required: false, width: "third" },
        { id: `res${i}_desc`, type: "text", label: "Description", placeholder: "Brief description of access needed", required: false, width: "full" }
      );
    }
    return fields;
  }

  // Helper: generate N revocation rows (8 columns — adds reason + users)
  function revocationRows(count) {
    const fields = [];
    for (let i = 1; i <= count; i++) {
      const req = i === 1;
      fields.push(
        { id: `rev${i}_header`, type: "section_header", label: `Resource ${i}${i > 1 ? " (if applicable)" : ""}` },
        { id: `rev${i}_app_name`, type: "text", label: "Application Name", placeholder: "Name of the application", required: req, width: "third" },
        { id: `rev${i}_hostname`, type: "text", label: "Hostname", placeholder: "e.g., app-server-01", required: req, width: "third" },
        { id: `rev${i}_ip`, type: "text", label: "IP Address", placeholder: "e.g., 10.0.1.50", required: false, width: "third" },
        { id: `rev${i}_port`, type: "text", label: "Port", placeholder: "e.g., 443", required: false, width: "third" },
        { id: `rev${i}_url`, type: "text", label: "URL", placeholder: "e.g., https://app.internal.com", required: false, width: "third" },
        { id: `rev${i}_service`, type: "text", label: "Service", placeholder: "e.g., HTTPS, SSH", required: false, width: "third" },
        { id: `rev${i}_reason`, type: "text", label: "Reason for Revoking Access", placeholder: "Why should access be revoked?", required: req, width: "half" },
        { id: `rev${i}_users`, type: "text", label: "Users (First Name and Last Name)", placeholder: "e.g., John Smith, Jane Doe", required: req, width: "half" }
      );
    }
    return fields;
  }

  // ═══════════════════════════════════════════════════════
  //  TEMPLATE 1: ZTNA Access for Overseas Travel
  // ═══════════════════════════════════════════════════════
  const template1Schema = [
    {
      id: "travel_section",
      type: "section_header",
      label: "Overseas Travel Details",
      description: "Provide ZTNA access details for each overseas trip. Fill in up to 6 trips per request.",
    },
    {
      id: "travel_info",
      type: "info_text",
      content: "ZTNA access will be configured for the specified travel dates and destinations. Please submit this request at least 5 business days before travel.",
      variant: "info",
    },
    ...travelRows(6),
  ];

  const template1StdConfig = {
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
  //  TEMPLATE 2: ZTNA Resource Access Request
  // ═══════════════════════════════════════════════════════
  const template2Schema = [
    {
      id: "resource_section",
      type: "section_header",
      label: "Resources Requiring ZTNA Access",
      description: "List each application or resource that needs ZTNA access. Fill up to 6 resources per request.",
    },
    {
      id: "resource_info",
      type: "info_text",
      content: "Provide as much detail as possible for each resource (hostname, IP, port, URL) to ensure accurate ZTNA policy configuration.",
      variant: "info",
    },
    ...resourceRows(6),
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
  //  TEMPLATE 3: ZTNA Resource Access Revocation Request
  // ═══════════════════════════════════════════════════════
  const template3Schema = [
    {
      id: "revoke_section",
      type: "section_header",
      label: "Resources to Revoke ZTNA Access",
      description: "List each application or resource that should have ZTNA access revoked, along with the reason and affected users.",
    },
    {
      id: "revoke_info",
      type: "info_text",
      content: "Specify the reason for revocation and the users affected. Revocation will be processed within 1 business day.",
      variant: "warning",
    },
    ...revocationRows(5),
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
  //  TEMPLATE 4: Request a DID extension
  // ═══════════════════════════════════════════════════════
  const template4Schema = [
    {
      id: "did_section",
      type: "section_header",
      label: "DID Extension Details",
      description: "Provide details for the DID (Direct Inward Dialing) extension request",
    },
    {
      id: "extension_type",
      type: "select",
      label: "Extension Type",
      required: true,
      width: "half",
      options: [
        { value: "new", label: "New Extension" },
        { value: "transfer", label: "Transfer Existing" },
        { value: "additional", label: "Additional Line" },
      ],
    },
    {
      id: "location",
      type: "text",
      label: "Office Location / Desk Number",
      placeholder: "e.g., Building A, Level 3, Desk 42",
      required: true,
      width: "half",
    },
    {
      id: "phone_type",
      type: "select",
      label: "Phone Type",
      required: false,
      width: "half",
      options: [
        { value: "desk_phone", label: "Desk Phone (Physical)" },
        { value: "softphone", label: "Softphone (Software)" },
        { value: "both", label: "Both" },
      ],
    },
    {
      id: "forwarding",
      type: "radio",
      label: "Call Forwarding Required?",
      required: false,
      width: "half",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "forwarding_number",
      type: "text",
      label: "Forward to Number",
      placeholder: "Phone number to forward calls to",
      required: false,
      width: "half",
      conditions: [
        { field: "forwarding", operator: "equals", value: "yes" },
      ],
    },
    {
      id: "voicemail",
      type: "radio",
      label: "Voicemail Required?",
      required: false,
      width: "half",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
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
  //  TEMPLATE 5: Request a mobile phone for on-call support
  // ═══════════════════════════════════════════════════════
  const template5Schema = [
    {
      id: "mobile_section",
      type: "section_header",
      label: "Mobile Phone Request Details",
      description: "Provide details for the on-call support mobile phone request",
    },
    {
      id: "oncall_role",
      type: "text",
      label: "On-Call Role / Team",
      placeholder: "e.g., Infrastructure Support L2, DBA On-Call",
      required: true,
      width: "half",
    },
    {
      id: "duration",
      type: "select",
      label: "Duration Needed",
      required: true,
      width: "half",
      options: [
        { value: "permanent", label: "Permanent (ongoing on-call)" },
        { value: "1_month", label: "1 Month" },
        { value: "3_months", label: "3 Months" },
        { value: "6_months", label: "6 Months" },
        { value: "project_based", label: "Project Based" },
      ],
    },
    {
      id: "phone_preference",
      type: "select",
      label: "Phone Preference",
      required: false,
      width: "half",
      options: [
        { value: "any", label: "No Preference" },
        { value: "iphone", label: "iPhone" },
        { value: "android", label: "Android" },
        { value: "basic", label: "Basic Phone (calls only)" },
      ],
    },
    {
      id: "data_plan",
      type: "radio",
      label: "Data Plan Required?",
      required: true,
      width: "half",
      options: [
        { value: "yes", label: "Yes — need email & apps" },
        { value: "no", label: "No — calls & SMS only" },
      ],
    },
    {
      id: "manager_name",
      type: "text",
      label: "Approving Manager",
      placeholder: "Manager who approved this request",
      required: true,
      width: "half",
    },
    {
      id: "return_date",
      type: "date",
      label: "Expected Return Date (if temporary)",
      required: false,
      width: "half",
      conditions: [
        { field: "duration", operator: "not_equals", value: "permanent" },
      ],
    },
    {
      id: "mobile_info",
      type: "info_text",
      content: "On-call mobile phones must be returned when no longer needed for on-call duties. Devices are tracked as IT assets.",
      variant: "info",
    },
  ];

  const template5StdConfig = {
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
  //  INSERT ALL 5 TEMPLATES
  // ═══════════════════════════════════════════════════════

  const templates = [
    {
      category_id: ztnaCatId,
      name: "ZTNA Access for Overseas Travel",
      description: "Request ZTNA (Zero Trust Network Access) configuration for overseas travel with destination and date details",
      icon: "shield",
      fields_schema: template1Schema,
      default_subject: "ZTNA Access for Overseas Travel",
      default_priority_key: "normal",
      standard_field_config: template1StdConfig,
      sort_order: 1,
    },
    {
      category_id: ztnaCatId,
      name: "ZTNA Resource Access Request",
      description: "Request ZTNA access to specific applications, servers, and network resources",
      icon: "lock",
      fields_schema: template2Schema,
      default_subject: "Access to Resources via ZTNA",
      default_priority_key: "normal",
      standard_field_config: template2StdConfig,
      sort_order: 2,
    },
    {
      category_id: ztnaCatId,
      name: "ZTNA Resource Access Revocation Request",
      description: "Request revocation of ZTNA access for applications and resources, including affected users and reasons",
      icon: "close",
      fields_schema: template3Schema,
      default_subject: "Access to Resources via ZTNA",
      default_priority_key: "normal",
      standard_field_config: template3StdConfig,
      sort_order: 3,
    },
    {
      category_id: telecomCatId,
      name: "Request a DID Extension",
      description: "Request a Direct Inward Dialing (DID) phone extension for your desk or softphone",
      icon: "phone",
      fields_schema: template4Schema,
      default_subject: "Please provide me a DID extension",
      default_priority_key: "normal",
      standard_field_config: template4StdConfig,
      sort_order: 1,
    },
    {
      category_id: telecomCatId,
      name: "Request a Mobile Phone for On-Call Support",
      description: "Request a mobile phone device for on-call support duties",
      icon: "phone",
      fields_schema: template5Schema,
      default_subject: "Please provide me a mobile for on-call support",
      default_priority_key: "normal",
      standard_field_config: template5StdConfig,
      sort_order: 2,
    },
  ];

  for (const t of templates) {
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
        t.category_id, t.name, t.description, t.icon,
        JSON.stringify(t.fields_schema), t.default_subject, t.default_priority_key,
        JSON.stringify(t.standard_field_config), t.sort_order,
      ]
    );
    console.log(`  ✓ Created "${t.name}" (id=${result.insertId}, ${t.fields_schema.length} fields)`);
  }

  console.log("\nDone! Batch 3 — 5 templates seeded successfully.");
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
