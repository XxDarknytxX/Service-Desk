// Seeds the two customer-facing service forms from the source documents:
//   1. ICT Product Requirements Form (ICT_Product_Requirements_Form_v3.xlsx)
//   2. Microsoft 365 Onboarding — Client Requirements Form (M365_Onboarding_Requirements_Form.docx)
// Idempotent: skips a form if one with the same name already exists.
import "dotenv/config";
import mysql from "mysql2/promise";

const unquote = (v) => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const sec = (id, label, description) => ({ id, type: "section_header", label, description });
const text = (id, label, opts = {}) => ({ id, type: "text", label, width: "half", ...opts });
const textarea = (id, label, opts = {}) => ({ id, type: "textarea", label, width: "full", rows: 3, ...opts });
const radio = (id, label, options, opts = {}) => ({
  id, type: "radio", label, width: "half",
  options: options.map((o) => ({ value: o.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: o })),
  ...opts,
});
const checks = (id, label, options, opts = {}) => ({
  id, type: "checkbox_group", label, width: "full",
  options: options.map((o) => ({ value: o.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: o })),
  ...opts,
});
const date = (id, label, opts = {}) => ({ id, type: "date", label, width: "half", ...opts });
const yesNo = (id, label, opts = {}) => radio(id, label, ["Yes", "No"], opts);

// ─────────────────────────────────────────────────────────────────
// 1) ICT Product Requirements Form  (customer-facing sections only)
// ─────────────────────────────────────────────────────────────────
const ICT_SCHEMA = [
  sec("s_customer", "Customer Information", "Tell us who you are and how to reach you"),
  text("company_name", "Company Name", { required: true }),
  text("industry", "Industry"),
  text("primary_contact", "Primary Contact Person", { required: true }),
  text("designation", "Designation"),
  text("contact_email", "Email Address", { required: true, placeholder: "name@company.com" }),
  text("contact_phone", "Phone Number", { required: true }),
  textarea("locations", "Location / Branches", { rows: 2, placeholder: "Head office and any branch locations" }),

  sec("s_business", "Business Overview", "Help us understand your organisation"),
  textarea("business_description", "Business Description", { required: true }),
  text("employee_count", "Number of Employees"),
  text("it_user_count", "Number of IT Users"),
  radio("current_environment", "Current IT Environment", ["On-Prem", "Cloud", "Hybrid"], { required: true }),

  sec("s_requirement", "Requirement Overview", "What are you looking to achieve?"),
  checks("solution_type", "Solution Type", [
    "Cloud (Azure/AWS/OCI/VF Cloud)", "Microsoft 365", "Cybersecurity", "Networking", "Backup & DR",
  ], { required: true }),
  textarea("business_objective", "Business Objective", { required: true }),
  textarea("desired_outcome", "Desired Outcome"),

  sec("s_current", "Current Setup"),
  textarea("existing_systems", "Existing Systems", { placeholder: "Servers, applications, platforms currently in use" }),
  text("service_providers", "Current Service Providers", { width: "full" }),
  checks("pain_points", "Pain Points", [
    "High Cost", "Downtime", "Security Issues", "Scalability Limits", "Poor Support",
  ]),

  sec("s_technical", "Technical Requirements"),
  text("users_seats", "Number of Users / Seats", { required: true }),
  text("storage_requirements", "Storage Requirements", { placeholder: "e.g. 2 TB total" }),
  textarea("compute_requirements", "Compute Requirements", { rows: 2, placeholder: "vCPU / RAM / workloads" }),
  yesNo("email_hosting", "Email Hosting Needed"),
  text("domain_name", "Domain Name", { placeholder: "company.com" }),

  sec("s_security", "Security"),
  checks("security_needs", "Security Needs", [
    "Email Security", "Endpoint Protection", "Firewall", "MFA", "Compliance",
  ]),

  sec("s_integration", "Integration"),
  yesNo("integration_required", "Integration Required"),
  textarea("systems_to_integrate", "Systems to Integrate", { rows: 2 }),

  sec("s_performance", "Performance & Availability"),
  radio("required_uptime", "Required Uptime", ["99.9%", "99.95%", "99.99%"]),
  textarea("critical_applications", "Critical Applications", { rows: 2 }),
  textarea("backup_requirements", "Backup Requirements", { rows: 2 }),
  textarea("dr_rpo_rto", "Disaster Recovery (RPO / RTO)", { rows: 2 }),

  sec("s_budget", "Budget & Timeline"),
  radio("budget_range", "Budget Range", ["< $1k", "$1k - $5k", "$5k+"]),
  radio("project_timeline", "Project Timeline", ["Immediate", "1-3 Months", "3-6 Months"]),

  sec("s_compliance", "Compliance"),
  textarea("regulatory_requirements", "Regulatory Requirements", { rows: 2 }),
  radio("data_sensitivity", "Data Sensitivity", ["Low", "Medium", "High"]),

  sec("s_support", "Support"),
  radio("support_level", "Support Level", ["Business Hours", "24/7"]),
  yesNo("managed_service", "Managed Service Required"),

  sec("s_notes", "Additional Notes"),
  textarea("additional_notes", "Notes", { placeholder: "Anything else we should know?" }),
];

// ─────────────────────────────────────────────────────────────────
// 2) Microsoft 365 Onboarding — Client Requirements Form
// ─────────────────────────────────────────────────────────────────
const M365_SCHEMA = [
  {
    id: "intro_note", type: "info_text", variant: "info", width: "full",
    label: "Please complete all sections below to help us prepare for your Microsoft 365 onboarding. Provide as much detail as possible to ensure a smooth and timely deployment.",
  },

  sec("s_org", "1. Organization Details"),
  text("company_name", "Company Name", { required: true }),
  text("business_reg_no", "Business Registration Number", { placeholder: "If applicable" }),
  textarea("office_address", "Office Address", { rows: 2, required: true }),
  text("primary_contact_number", "Primary Contact Number", { required: true }),
  text("industry", "Industry"),

  sec("s_domain", "2. Domain & DNS Information"),
  text("primary_domain", "Primary Domain Name", { required: true, placeholder: "e.g. company.com" }),
  text("additional_domains", "Additional Domains", { placeholder: "If any" }),
  text("domain_registrar", "Domain Registrar", { placeholder: "e.g. GoDaddy, CrazyDomains" }),
  text("dns_provider", "DNS Hosting Provider", { placeholder: "e.g. Cloudflare, ISP, Registrar" }),
  yesNo("dns_portal_access", "Do you have access to your DNS management portal?", { required: true }),
  text("dns_admin_name", "DNS Admin Contact — Name"),
  text("dns_admin_email", "DNS Admin Contact — Email"),
  text("dns_admin_phone", "DNS Admin Contact — Phone"),

  sec("s_email_env", "3. Current Email Environment"),
  radio("current_email_platform", "Current Email Platform", [
    "Microsoft Exchange (On-Prem)", "Microsoft 365", "Google Workspace", "ISP Email", "Other",
  ], { required: true, width: "full" }),
  text("email_platform_other", "If Other, please specify", { width: "full" }),
  text("mailbox_count", "Approximate Total Mailbox Count"),
  yesNo("shared_mailboxes", "Are Shared Mailboxes in use?"),
  yesNo("distribution_lists", "Are Distribution Lists in use?"),
  yesNo("email_migration_required", "Is Email Migration required?"),
  textarea("downtime_restrictions", "Downtime restrictions or blackout windows", { rows: 2, placeholder: "If any" }),

  sec("s_users", "4. User List, License Allocation & Mailbox Sizes"),
  text("total_users", "Total Number of Users", { required: true }),
  textarea("user_list", "User List", {
    rows: 6, required: true,
    placeholder: "One user per line:  Name,  Email,  Role/Dept,  Mailbox Size (GB),  License Type",
    helpText: "List every user to be onboarded — name, email address, role or department, current mailbox size and required license.",
  }),
  checks("license_types", "License Types Required", [
    "Business Basic", "Business Standard", "Business Premium", "E1", "E3", "E5", "Other",
  ]),
  text("license_other", "If Other license, please specify", { width: "full" }),

  sec("s_email_security", "5. Email Security & Filtering"),
  radio("email_protection", "Current Email Protection Solution", ["Built-in", "Third-party", "None"]),
  text("email_protection_vendor", "If third-party, please specify", { placeholder: "e.g. Mimecast, Barracuda" }),
  yesNo("spam_filtering", "Is Spam Filtering currently in place?"),
  yesNo("email_encryption", "Is Email Encryption required?"),
  yesNo("defender_in_scope", "Is Microsoft Defender for M365 part of the scope?"),
  radio("defender_license", "If Yes, which Defender license?", [
    "Defender for Office 365 Plan 1", "Defender for Office 365 Plan 2", "Included in E5", "Not Sure",
  ], { width: "full" }),
  text("defender_quantity", "Defender License Quantity"),

  sec("s_identity", "6. Identity & Access Management"),
  radio("directory_type", "Current Directory Type", ["Active Directory (On-Prem)", "Azure AD Only", "Hybrid"], { required: true }),
  text("ad_user_count", "Number of Active Directory Users"),
  radio("azure_ad_connect", "Is Azure AD Connect required?", ["Yes", "No", "Not Sure"]),
  radio("mfa_requirement", "Multi-Factor Authentication (MFA)", [
    "Required for All Users", "Required for Specific Roles", "Not Required",
  ], { width: "full" }),

  sec("s_migration", "7. Data Migration Scope"),
  yesNo("migrate_email", "Email Migration Required?"),
  yesNo("migrate_onedrive", "OneDrive Migration Required?"),
  yesNo("migrate_sharepoint", "SharePoint Migration Required?"),
  yesNo("migrate_fileserver", "File Server Migration Required?"),
  text("data_volume", "Approximate Total Data Volume", { placeholder: "GB / TB" }),
  textarea("special_migration", "Special Migration Requirements", { rows: 2 }),

  sec("s_backup", "8. Backup"),
  yesNo("backup_required", "Is Microsoft 365 Backup required?"),
  radio("backup_solution", "If Yes, preferred Backup Solution", ["Veeam", "Arcserve", "Not Sure"]),
  checks("backup_scope", "Backup Scope", ["Exchange Online", "SharePoint", "OneDrive", "Teams"]),

  sec("s_stakeholders", "9. Project Stakeholders", "Contact details for key project stakeholders"),
  text("sponsor_name", "Executive Sponsor — Name"),
  text("sponsor_email", "Executive Sponsor — Email"),
  text("itmgr_name", "IT Manager — Name"),
  text("itmgr_email", "IT Manager — Email"),
  text("tech_name", "Technical Contact — Name"),
  text("tech_email", "Technical Contact — Email"),
  text("billing_name", "Billing Contact — Name"),
  text("billing_email", "Billing Contact — Email"),

  sec("s_signoff", "10. Authorization & Sign-Off"),
  {
    id: "signoff_note", type: "info_text", variant: "warning", width: "full",
    label: "By submitting this form, I confirm that the information provided is accurate and complete to the best of my knowledge.",
  },
  text("signoff_name", "Client Representative Name", { required: true, helpText: "Your typed full name acts as your signature" }),
  date("signoff_date", "Date", { required: true }),
];

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT || 3306),
    user: unquote(process.env.DATABASE_USER),
    password: unquote(process.env.DATABASE_PASSWORD),
    database: unquote(process.env.DATABASE_NAME),
  });

  const [admins] = await conn.query(
    "SELECT id FROM users WHERE email = 'admin@servicedesk.local' LIMIT 1"
  );
  const adminId = admins[0]?.id || null;

  const forms = [
    {
      name: "ICT Product Requirements Form",
      description:
        "Tell us about your business and technical requirements so our ICT team can design the right solution for you.",
      schema: ICT_SCHEMA,
    },
    {
      name: "Microsoft 365 Onboarding — Client Requirements",
      description:
        "Complete this form to help us prepare your Microsoft 365 onboarding for a smooth and timely deployment.",
      schema: M365_SCHEMA,
    },
  ];

  for (const f of forms) {
    const [existing] = await conn.query(
      "SELECT id FROM service_forms WHERE name = ? LIMIT 1",
      [f.name]
    );
    if (existing.length) {
      console.log(`⏭️  "${f.name}" already exists (id=${existing[0].id}) — skipping`);
      continue;
    }
    const [result] = await conn.query(
      `INSERT INTO service_forms (name, description, fields_schema, created_by) VALUES (?, ?, ?, ?)`,
      [f.name, f.description, JSON.stringify(f.schema), adminId]
    );
    console.log(`✅ Seeded "${f.name}" (id=${result.insertId}, ${f.schema.length} fields)`);
  }

  await conn.end();
  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
