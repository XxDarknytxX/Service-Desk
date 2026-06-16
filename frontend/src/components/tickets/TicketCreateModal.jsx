/**
 * Ticket Create Modal
 * Multi-step flow: Mode Selection → Manual Form OR Template Gallery → Template Form
 *
 * Features:
 * - Step 1: Choose "Manual" or "From Template"
 * - Step 2a: Manual ticket form (original flow)
 * - Step 2b: Template gallery browser
 * - Step 3: Template-based form with dynamic fields
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { api, templatesApi, formsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Input, { Textarea, Select } from "../ui/Input";
import Icon from "../ui/Icon";
import TemplateGallery from "../templates/TemplateGallery";
import TemplateRenderer, { validateTemplateForm } from "../templates/TemplateRenderer";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const DEFAULT_ORG_NAME = "Vodafone"; // fallback: uses first available org

const defaultForm = {
  subject: "",
  description: "",
  priorityKey: "normal",
  typeKey: "incident",
  channelKey: "portal",
  organizationId: "",
  assigneeId: "",
  teamId: "",
  requesterId: "",
  serviceCategoryKey: "",
};

// ─── Presentational helpers (visual only) ──────────────────────────
// A labelled section heading with a tinted icon tile, mirroring the
// panel-header language used across the app's reference pages.
function SectionHeading({ icon, tone = "accent", title, hint }) {
  const toneCls = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    blue: "bg-blue-500/10 text-blue-500",
    violet: "bg-violet-500/10 text-violet-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
    indigo: "bg-indigo-500/10 text-indigo-500",
    slate: "bg-slate-500/10 text-slate-400",
  };
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", toneCls[tone] || toneCls.accent)}>
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h3>
        {hint && <p className="text-[11px] text-[var(--fg-muted)] leading-snug">{hint}</p>}
      </div>
    </div>
  );
}

// A semantic inline banner (info / error / brand etc.) used for hints
// and validation feedback.
const BANNER_TONES = {
  info: { wrap: "bg-blue-500/10 border-blue-500/20", text: "text-blue-500", icon: "info" },
  error: { wrap: "bg-red-500/10 border-red-500/20", text: "text-red-500", icon: "alert" },
  emerald: { wrap: "bg-emerald-500/5 border-emerald-500/20", text: "text-emerald-500", icon: "checkCircle" },
  muted: { wrap: "bg-[var(--bg-base)] border-[var(--border-default)]", text: "text-[var(--fg-secondary)]", icon: "info" },
};
function Banner({ tone = "info", icon, children }) {
  const t = BANNER_TONES[tone] || BANNER_TONES.info;
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", t.wrap)}>
      <Icon name={icon || t.icon} size={16} className={cn("shrink-0", t.text)} />
      <p className={cn("text-sm font-medium", t.text)}>{children}</p>
    </div>
  );
}

// Two-step progress indicator for the corporate raise-request flow.
function StepDots({ step }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--fg-muted)]">
      <span className={cn("h-1.5 w-8 rounded-full transition-colors", step >= 1 ? "bg-[var(--accent)]" : "bg-[var(--border-default)]")} />
      <span className={cn("h-1.5 w-8 rounded-full transition-colors", step >= 2 ? "bg-[var(--accent)]" : "bg-[var(--border-default)]")} />
      <span className="ml-1">Step {step} of 2</span>
    </div>
  );
}

export default function TicketCreateModal({ open, onClose, meta, user, onCreated }) {
  const toast = useToast();
  // Mode: null (choosing), 'manual', 'template_gallery', 'template_form',
  //       'form_pick', 'form_send', 'form_done'  (customer-form ticket flow)
  const [mode, setMode] = useState(null);
  const [corpStep, setCorpStep] = useState(1); // corporate flow: 1=choose, 2=details
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateValues, setTemplateValues] = useState({});
  const [templateErrors, setTemplateErrors] = useState({});
  const [users, setUsers] = useState([]);

  // Requester search state (agent-only field)
  const [createOnBehalf, setCreateOnBehalf] = useState(false);
  const [requesterSearch, setRequesterSearch] = useState("");
  const [requesterOpen, setRequesterOpen] = useState(false);
  const requesterRef = useRef(null);

  // Customer-form ticket state (agent-only third mode)
  const [customerForms, setCustomerForms] = useState([]);
  const [loadingCustomerForms, setLoadingCustomerForms] = useState(false);
  const [selectedCustomerForm, setSelectedCustomerForm] = useState(null);
  const [cfEmail, setCfEmail] = useState("");
  const [cfName, setCfName] = useState("");
  const [cfResult, setCfResult] = useState(null); // { ticketId, token }

  // Close requester dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (requesterRef.current && !requesterRef.current.contains(e.target)) {
        setRequesterOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const priorities = useMemo(() => meta?.priorities || [], [meta]);
  const types = useMemo(() => meta?.types || [], [meta]);
  const channels = useMemo(() => meta?.channels || [], [meta]);
  const teams = useMemo(() => meta?.teams || [], [meta]);
  const organizations = useMemo(() => meta?.organizations || [], [meta]);
  const serviceCategories = useMemo(() => meta?.serviceCategories || [], [meta]);
  const isAgent = user?.roles?.includes("admin") || user?.roles?.includes("agent");
  // Corporate customers raise requests only, via the category picker.
  const isCorporate = !isAgent && user?.roles?.includes("corporate_customer");

  // Find default organization (try configured name first, then fall back to first available)
  const defaultOrgId = useMemo(() => {
    const match = organizations.find((o) => o.name.toLowerCase() === DEFAULT_ORG_NAME.toLowerCase());
    if (match) return String(match.id);
    return organizations.length > 0 ? String(organizations[0].id) : "";
  }, [organizations]);

  // Full reset only when the modal transitions open. Deliberately NOT depending
  // on defaultOrgId — that resolves asynchronously after meta loads, and
  // re-running this on its change would wipe an in-progress flow (e.g. the
  // customer-form "done" screen) after the parent refetches.
  useEffect(() => {
    if (open) {
      setMode(isCorporate ? "corporate" : null);
      setCorpStep(1);
      setForm({ ...defaultForm, organizationId: defaultOrgId });
      setLoading(false);
      setTeamMembers([]);
      setSelectedTemplate(null);
      setTemplateValues({});
      setTemplateErrors({});
      setRequesterSearch("");
      setRequesterOpen(false);
      setCreateOnBehalf(false);
      setSelectedCustomerForm(null);
      setCfEmail("");
      setCfName("");
      setCfResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the org default in sync once meta resolves, without resetting the flow.
  useEffect(() => {
    if (open && defaultOrgId) {
      setForm((prev) => (prev.organizationId ? prev : { ...prev, organizationId: defaultOrgId }));
    }
  }, [open, defaultOrgId]);

  // Load customer forms when entering the picker
  useEffect(() => {
    if (mode === "form_pick" && customerForms.length === 0) {
      setLoadingCustomerForms(true);
      formsApi
        .list()
        .then((d) => setCustomerForms(d.forms || []))
        .catch((err) => toast.error(err.message || "Failed to load forms"))
        .finally(() => setLoadingCustomerForms(false));
    }
  }, [mode]);

  // Load team members when team is selected
  useEffect(() => {
    if (form.teamId && isAgent) {
      loadTeamMembers(form.teamId);
    } else {
      setTeamMembers([]);
    }
  }, [form.teamId, isAgent]);

  // Load users list for user_lookup fields
  useEffect(() => {
    if (open && users.length === 0) {
      api("/users").then((d) => setUsers(d.items || d.users || [])).catch(() => {});
    }
  }, [open]);

  async function loadTeamMembers(teamId) {
    try {
      setLoadingMembers(true);
      const data = await api(`/teams/${teamId}/members`);
      setTeamMembers(data.members || []);
    } catch (err) {
      console.error("Failed to load team members:", err);
      setTeamMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  function updateField(name, value) {
    setForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "teamId" && value !== prev.teamId) {
        updated.assigneeId = "";
      }
      return updated;
    });
  }

  // Corporate flow: advance from "choose category" to "details".
  function goToCorpStep2() {
    if (!form.serviceCategoryKey) { toast.error("Please choose a category for your request"); return; }
    setCorpStep(2);
  }

  // When a template is selected from gallery
  function handleTemplateSelected(template) {
    setSelectedTemplate(template);
    setMode("template_form");

    // Pre-fill standard fields from template defaults
    const newForm = { ...defaultForm, organizationId: defaultOrgId };
    if (template.default_subject) newForm.subject = template.default_subject;
    if (template.default_priority_key) newForm.priorityKey = template.default_priority_key;
    if (template.default_type_key) newForm.typeKey = template.default_type_key;
    if (template.default_channel_key) newForm.channelKey = template.default_channel_key;
    if (template.default_team_id) newForm.teamId = String(template.default_team_id);
    if (template.default_assignee_id) newForm.assigneeId = String(template.default_assignee_id);
    if (template.default_organization_id) newForm.organizationId = String(template.default_organization_id);
    setForm(newForm);

    // Initialize template values with defaults
    const schema = template.fields_schema || [];
    const initValues = {};
    for (const field of schema) {
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        initValues[field.id] = field.defaultValue;
      } else if (field.type === "checkbox_group" || field.type === "multiselect") {
        initValues[field.id] = [];
      } else if (field.type === "daterange") {
        initValues[field.id] = { start: "", end: "" };
      } else {
        initValues[field.id] = "";
      }
    }
    setTemplateValues(initValues);
    setTemplateErrors({});
  }

  function handleTemplateValueChange(fieldId, value) {
    setTemplateValues((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error for this field
    if (templateErrors[fieldId]) {
      setTemplateErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  // Get standard field config from template
  function getFieldVisibility(fieldName) {
    if (!selectedTemplate?.standard_field_config) return "visible";
    return selectedTemplate.standard_field_config[fieldName] || "visible";
  }

  function isStdFieldVisible(fieldName) {
    const vis = getFieldVisibility(fieldName);
    return vis === "visible" || vis === "required";
  }

  function isStdFieldRequired(fieldName) {
    return getFieldVisibility(fieldName) === "required";
  }

  async function onSubmit(e) {
    e.preventDefault();

    // Validate template fields if in template mode
    if (mode === "template_form" && selectedTemplate) {
      const schema = selectedTemplate.fields_schema || [];
      const errors = validateTemplateForm(schema, templateValues);
      if (Object.keys(errors).length > 0) {
        setTemplateErrors(errors);
        toast.error("Please fill in the highlighted required fields");
        return;
      }
    }

    // Corporate requests: category, subject and description are all required.
    if (mode === "corporate") {
      if (!form.serviceCategoryKey) { toast.error("Please choose a category for your request"); return; }
      if (!form.subject.trim()) { toast.error("Please add a subject for your request"); return; }
      if (!form.description.trim()) { toast.error("Please describe your request so the team can help"); return; }
    }

    setLoading(true);
    try {
      const payload = {
        subject: form.subject,
        description: form.description,
        priorityKey: form.priorityKey,
        typeKey: form.typeKey,
        channelKey: form.channelKey,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        requesterId: form.requesterId ? Number(form.requesterId) : undefined,
        serviceCategoryKey: form.serviceCategoryKey || undefined,
      };

      // Add template data if using a template
      if (mode === "template_form" && selectedTemplate) {
        payload.templateId = selectedTemplate.id;
        payload.templateResponses = templateValues;
      }

      const data = await api("/tickets", { method: "POST", body: payload });
      if (data.requiresApproval) {
        toast.info("Ticket created and sent for approval");
      } else {
        toast.success("Ticket created successfully");
      }
      onCreated?.(data.id);
      onClose?.();
    } catch (err) {
      toast.error(err.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (mode === "template_form") {
      setMode("template_gallery");
      setSelectedTemplate(null);
      setTemplateValues({});
      setTemplateErrors({});
    } else if (mode === "form_send") {
      setMode("form_pick");
      setSelectedCustomerForm(null);
    } else if (mode === "template_gallery" || mode === "manual" || mode === "form_pick") {
      setMode(null);
    }
  }

  function pickCustomerForm(cf) {
    setSelectedCustomerForm(cf);
    setForm((prev) => ({ ...prev, subject: cf.name, description: "" }));
    setMode("form_send");
  }

  async function onSubmitFormTicket(e) {
    e.preventDefault();
    const cleanEmail = cfEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Enter a valid recipient email address");
      return;
    }
    if (!form.teamId) {
      toast.error("Select a team to own this ticket");
      return;
    }
    setLoading(true);
    try {
      // If the recipient is an existing user, raise the ticket on their behalf
      const matched = users.find((u) => (u.email || "").toLowerCase() === cleanEmail);
      const payload = {
        subject: form.subject || selectedCustomerForm.name,
        description:
          form.description ||
          `Customer form "${selectedCustomerForm.name}" sent to ${cleanEmail}. The response will be attached to this ticket automatically.`,
        priorityKey: form.priorityKey,
        typeKey: form.typeKey,
        channelKey: form.channelKey,
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
        requesterId: matched ? matched.id : undefined,
      };
      const data = await api("/tickets", { method: "POST", body: payload });

      const invite = await formsApi.createInvite(selectedCustomerForm.id, {
        email: cleanEmail,
        name: cfName.trim() || undefined,
        ticket_id: data.id,
      });

      setCfResult({ ticketId: data.id, token: invite.token, email: cleanEmail });
      setMode("form_done");
      toast.success("Ticket created and form link generated");
      // NOTE: we intentionally do NOT call onCreated() here. Some parents
      // (e.g. the dashboard) blank to a loading skeleton while refetching,
      // which would unmount this modal and lose the done screen. The parent
      // is refreshed instead when the agent leaves the done screen.
    } catch (err) {
      toast.error(err.message || "Failed to create form ticket");
    } finally {
      setLoading(false);
    }
  }

  // ─── "Create on behalf" requester picker (shared by manual + template forms) ──
  function renderOnBehalfSection() {
    if (!isAgent) return null;
    if (!createOnBehalf) {
      return (
        <button
          type="button"
          onClick={() => setCreateOnBehalf(true)}
          className={cn(
            "group flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium w-full",
            "border border-dashed border-[var(--border-default)]",
            "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
            "hover:border-[var(--accent)] hover:bg-[var(--accent)]/5",
            "transition-all duration-150"
          )}
        >
          <span className="h-7 w-7 rounded-lg bg-[var(--bg-surface)] text-[var(--fg-muted)] flex items-center justify-center group-hover:bg-[var(--accent)]/10 group-hover:text-[var(--accent)] transition-colors">
            <Icon name="userPlus" size={15} />
          </span>
          Create on behalf of another user
        </button>
      );
    }

    const filteredUsers = users.filter((u) => {
      if (!requesterSearch) return true;
      const q = requesterSearch.toLowerCase();
      return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
    });
    const selectedRequester = users.find((u) => String(u.id) === String(form.requesterId));

    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="userPlus" size={14} className="text-[var(--accent)]" />
            <label className="text-xs font-semibold text-[var(--fg-primary)]">
              Creating on behalf of
            </label>
          </div>
          <button
            type="button"
            onClick={() => { setCreateOnBehalf(false); updateField("requesterId", ""); setRequesterSearch(""); setRequesterOpen(false); }}
            className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
        <div ref={requesterRef} className="relative">
          <div
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg cursor-text",
              "bg-[var(--bg-elevated)] border",
              requesterOpen ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-[var(--border-default)] hover:border-[var(--border-hover)]",
              "transition-all duration-150"
            )}
            onClick={() => setRequesterOpen(true)}
          >
            <Icon name="user" size={15} className="text-[var(--fg-muted)] flex-shrink-0" />
            {form.requesterId ? (
              <span className="flex-1 text-sm text-[var(--fg-primary)] font-medium">
                {selectedRequester?.full_name || selectedRequester?.email || "Selected user"}
              </span>
            ) : (
              <input
                type="text"
                placeholder="Search by name or email..."
                value={requesterSearch}
                onChange={(e) => { setRequesterSearch(e.target.value); setRequesterOpen(true); }}
                onFocus={() => setRequesterOpen(true)}
                className="flex-1 bg-transparent text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] outline-none"
              />
            )}
            {form.requesterId ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); updateField("requesterId", ""); setRequesterSearch(""); }}
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
                title="Clear requester"
              >
                <Icon name="close" size={14} />
              </button>
            ) : (
              <Icon name="chevronDown" size={14} className="text-[var(--fg-muted)] flex-shrink-0" />
            )}
          </div>

          {requesterOpen && !form.requesterId && (
            <div className={cn(
              "absolute z-50 left-0 right-0 mt-1.5 max-h-52 overflow-y-auto p-1",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
              "rounded-xl shadow-[var(--shadow-elevated)] animate-slide-down"
            )}>
              {filteredUsers.slice(0, 20).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    updateField("requesterId", String(u.id));
                    setRequesterSearch("");
                    setRequesterOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold">
                    {(u.full_name || u.email || "U")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--fg-primary)] truncate">{u.full_name || u.email}</p>
                    {u.full_name && <p className="text-xs text-[var(--fg-muted)] truncate">{u.email}</p>}
                  </div>
                  <div className="ml-auto flex-shrink-0">
                    {u.roles?.includes("admin") ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)]">Admin</span>
                    ) : u.roles?.includes("agent") ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Agent</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">User</span>
                    )}
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-[var(--fg-muted)]">No users found</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Mode Selection Screen ─────────────────────────
  function renderModeSelection() {
    const modeCards = [
      {
        key: "manual",
        icon: "pencil",
        tint: "bg-[var(--accent)]/10 text-[var(--accent)] group-hover:bg-[var(--accent)]/20",
        title: "Manual ticket",
        desc: "Capture standard fields — subject, description, priority and routing.",
        onClick: () => setMode("manual"),
      },
      {
        key: "template_gallery",
        icon: "clipboard",
        tint: "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20",
        title: "From template",
        desc: "Start from a pre-built form for common request types.",
        onClick: () => setMode("template_gallery"),
      },
      ...(isAgent
        ? [{
            key: "form_pick",
            icon: "send",
            tint: "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20",
            title: "Customer form",
            desc: "Raise a ticket that sends a form to a customer — replies attach automatically.",
            badge: "Agent",
            onClick: () => setMode("form_pick"),
          }]
        : []),
    ];

    return (
      <div className="space-y-5">
        <p className="text-sm text-[var(--fg-secondary)]">
          How would you like to create this ticket?
        </p>
        <div className={cn("grid gap-4", isAgent ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {modeCards.map((card, i) => (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              style={{ animationDelay: `${i * 60}ms` }}
              className={cn(
                "group relative flex flex-col gap-4 p-5 rounded-2xl text-left animate-fade-up",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
              )}
            >
              {card.badge && (
                <span className="absolute top-3.5 right-3.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                  {card.badge}
                </span>
              )}
              <span className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-200",
                card.tint
              )}>
                <Icon name={card.icon} size={22} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)] tracking-tight">{card.title}</h3>
                <p className="mt-1.5 text-xs text-[var(--fg-muted)] leading-relaxed">{card.desc}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 group-hover:gap-1.5 transition-all">
                Continue <Icon name="arrowRight" size={13} />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Customer Form: picker ─────────────────────────
  function renderFormPicker() {
    return (
      <div className="space-y-3">
        {loadingCustomerForms ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-[72px] rounded-2xl bg-[var(--bg-surface)] animate-pulse" />
            ))}
          </div>
        ) : customerForms.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-4">
              <Icon name="send" size={26} />
            </div>
            <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No customer forms yet</p>
            <p className="text-xs text-[var(--fg-secondary)]">
              Build one under Operations → Customer Forms first.
            </p>
          </div>
        ) : (
          customerForms.map((cf, i) => (
            <button
              key={cf.id}
              type="button"
              onClick={() => pickCustomerForm(cf)}
              style={{ animationDelay: `${i * 50}ms` }}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl text-left group animate-fade-up",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]"
              )}
            >
              <span className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110">
                <Icon name="fileText" size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--fg-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {cf.name}
                </span>
                <span className="block text-xs text-[var(--fg-muted)] truncate mt-0.5">
                  {cf.description || "No description"}
                </span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)] shrink-0">
                <Icon name="list" size={12} />
                {(cf.fields_schema || []).filter((f) => !["section_header", "info_text", "divider"].includes(f.type)).length} questions
              </span>
              <Icon name="chevronRight" size={15} className="text-[var(--fg-muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))
        )}
      </div>
    );
  }

  // ─── Customer Form: ticket config + recipient ──────
  function renderFormSend() {
    if (!selectedCustomerForm) return null;
    const matched = users.find((u) => (u.email || "").toLowerCase() === cfEmail.trim().toLowerCase());
    return (
      <form id="ticket-create-form" onSubmit={onSubmitFormTicket} className="space-y-6">
        {/* Chosen form summary */}
        <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Icon name="send" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate tracking-tight">{selectedCustomerForm.name}</h3>
            <p className="text-xs text-[var(--fg-muted)] leading-snug mt-0.5">
              The recipient gets a one-time link — their response attaches to this ticket automatically.
            </p>
          </div>
        </div>

        {/* Recipient */}
        <section className="space-y-3.5">
          <SectionHeading icon="mail" tone="emerald" title="Recipient" hint="Where the form link is sent." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Send to (email)"
                placeholder="customer@company.com"
                value={cfEmail}
                onChange={(e) => setCfEmail(e.target.value)}
                required
              />
              {matched && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-500">
                  <Icon name="userCheck" size={12} />
                  Existing user — the ticket will be raised on their behalf
                </p>
              )}
            </div>
            <Input
              label="Recipient name (optional)"
              placeholder="Customer name"
              value={cfName}
              onChange={(e) => setCfName(e.target.value)}
            />
          </div>
        </section>

        {/* Ticket details */}
        <section className="space-y-3.5">
          <SectionHeading icon="tickets" tone="accent" title="Ticket details" hint="Where the ticket lives and how it's prioritised." />
          <Input
            label="Ticket subject"
            value={form.subject}
            onChange={(e) => updateField("subject", e.target.value)}
            required
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Priority" value={form.priorityKey} onChange={(e) => updateField("priorityKey", e.target.value)}>
              {priorities.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select>
            <Select label="Team" value={form.teamId} onChange={(e) => updateField("teamId", e.target.value)} required>
              <option value="">Select a team *</option>
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <Select label="Assignee" value={form.assigneeId} onChange={(e) => updateField("assigneeId", e.target.value)} disabled={!form.teamId || loadingMembers}>
              <option value="">Unassigned (Team Queue)</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || member.email} {member.is_lead ? "(Manager)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label="Internal note (optional)"
            rows={2}
            placeholder="Context for the team — defaults to a note about the form that was sent"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
          />
        </section>
      </form>
    );
  }

  // ─── Customer Form: done ───────────────────────────
  function renderFormDone() {
    if (!cfResult) return null;
    const link = `${window.location.origin}/f/${cfResult.token}`;
    return (
      <div className="text-center py-4 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto animate-scale-in">
          <Icon name="checkCircle" size={30} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--fg-primary)] tracking-tight">Ticket created & form ready</h3>
          <p className="text-sm text-[var(--fg-secondary)] mt-1.5 max-w-md mx-auto leading-relaxed">
            Share this one-time link with <strong className="text-[var(--fg-primary)]">{cfResult.email}</strong> —
            their response will land on the ticket automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 p-2 pl-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] max-w-lg mx-auto">
          <Icon name="link" size={14} className="text-[var(--fg-muted)] shrink-0" />
          <code className="flex-1 text-[12px] text-[var(--fg-secondary)] truncate text-left">{link}</code>
          <Button
            size="xs"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success("Link copied");
              } catch {
                toast.error("Copy manually");
              }
            }}
            icon={<Icon name="copy" size={12} />}
          >
            Copy
          </Button>
        </div>
        <p className="text-[11px] text-[var(--fg-muted)] flex items-center justify-center gap-1.5">
          <Icon name="info" size={11} />
          If the ticket is set to Pending while you wait, it reopens automatically when they submit
        </p>
      </div>
    );
  }

  // ─── Corporate request (category-routed, raise-only) ──────────────
  function renderCorporateForm() {
    const cats = serviceCategories;
    const mainCats = cats.filter((c) => !c.is_triage);
    const triageCats = cats.filter((c) => c.is_triage);
    const selected = cats.find((c) => c.key === form.serviceCategoryKey);

    const tile = (c, i) => {
      const active = form.serviceCategoryKey === c.key;
      return (
        <button
          key={c.key}
          type="button"
          onClick={() => updateField("serviceCategoryKey", c.key)}
          style={{ animationDelay: `${i * 50}ms` }}
          className={cn(
            "group relative flex flex-col gap-2.5 p-4 rounded-2xl text-left animate-fade-up border min-h-[8.5rem]",
            "transition-[box-shadow,border-color,background-color] duration-200",
            active
              ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/20"
              : "border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]"
          )}
        >
          <span className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--bg-surface)] text-[var(--fg-muted)] group-hover:text-[var(--accent)]"
          )}>
            <Icon name={c.icon || "tag"} size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--fg-primary)]">{c.name}</p>
            <p className="text-xs text-[var(--fg-muted)] leading-snug mt-0.5 line-clamp-2">{c.description}</p>
          </div>
          {c.routing_team_name && (
            <p className="mt-auto inline-flex items-center gap-1 text-[10px] font-medium text-[var(--fg-subtle)]">
              <Icon name="arrowRight" size={10} /> Goes to {c.routing_team_name}
            </p>
          )}
          {active && <Icon name="checkCircle" size={16} className="text-[var(--accent)] absolute top-3 right-3" />}
        </button>
      );
    };

    // ── STEP 1 — choose a category ──────────────────────────────────
    if (corpStep === 1) {
      return (
        <div className="space-y-4">
          <StepDots step={1} />
          <SectionHeading icon="layers" tone="accent" title="What do you need help with?" hint="Pick a category — we route your request to the right team." />
          {cats.length === 0 ? (
            <Banner tone="muted">No request categories are configured yet. Please contact your account manager.</Banner>
          ) : (
            <>
              <div className="grid gap-3 grid-cols-2">{mainCats.map(tile)}</div>
              {triageCats.map((c) => {
                const active = form.serviceCategoryKey === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => updateField("serviceCategoryKey", c.key)}
                    className={cn(
                      "group relative w-full flex items-center gap-3.5 p-4 rounded-2xl text-left border transition-[box-shadow,border-color,background-color] duration-200",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/5 ring-2 ring-[var(--accent)]/20"
                        : "border-dashed border-[var(--border-hover)] bg-[var(--bg-base)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface)]"
                    )}
                  >
                    <span className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-amber-500/10 text-amber-500"
                    )}>
                      <Icon name={c.icon || "alertCircle"} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--fg-primary)]">{c.name}</p>
                      <p className="text-xs text-[var(--fg-muted)] leading-snug mt-0.5">{c.description}</p>
                    </div>
                    <span className="shrink-0 text-right text-[10px] font-medium text-[var(--fg-subtle)] leading-tight">
                      Triaged by {c.routing_team_name || "NOC"}<br />longer response time
                    </span>
                    {active && <Icon name="checkCircle" size={16} className="text-[var(--accent)] absolute top-3 right-3" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      );
    }

    // ── STEP 2 — details ────────────────────────────────────────────
    return (
      <form id="ticket-create-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <StepDots step={2} />
        {selected && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)]">
            <span className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-[var(--accent)]/10 text-[var(--accent)]">
              <Icon name={selected.icon || "tag"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--fg-primary)]">{selected.name}</p>
              <p className="text-[11px] text-[var(--fg-muted)]">
                {selected.is_triage ? "NOC will triage & route this — longer response time" : `Goes to ${selected.routing_team_name}`}
              </p>
            </div>
            <button type="button" onClick={() => setCorpStep(1)} className="text-[11px] font-medium text-[var(--accent)] hover:underline shrink-0">Change</button>
          </div>
        )}
        <SectionHeading icon="pencil" tone="violet" title="Tell us more" hint="A short summary and any useful detail." />
        <Input
          label="Subject"
          value={form.subject}
          onChange={(e) => updateField("subject", e.target.value)}
          placeholder="Short summary of your request"
          required
        />
        <Textarea
          label="Description"
          rows={4}
          required
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe the issue or request, the impact, and any reference numbers"
        />
        <Banner tone="muted" icon="info">
          Your request goes straight to the responsible team's queue and is tracked end-to-end — you'll be notified as it progresses.
        </Banner>
      </form>
    );
  }

  // ─── Manual Form ─────────────────────────
  function renderManualForm() {
    return (
      <form id="ticket-create-form" onSubmit={onSubmit} className="space-y-6">
        {/* Request details */}
        <section className="space-y-3.5">
          <SectionHeading icon="pencil" tone="accent" title="Request details" hint="Tell us what's needed and why." />
          <Input
            label="Subject"
            value={form.subject}
            onChange={(e) => updateField("subject", e.target.value)}
            placeholder="Short summary of the request"
            required
          />

          <Textarea
            label="Description"
            rows={4}
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="Provide context, impact, and desired outcome"
          />

          {/* Create on behalf — agents/admins only */}
          {renderOnBehalfSection()}
        </section>

        {/* Classification */}
        <section className="space-y-3.5">
          <SectionHeading icon="tag" tone="violet" title="Classification" hint="Helps route and prioritise the ticket." />
          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Priority" value={form.priorityKey} onChange={(e) => updateField("priorityKey", e.target.value)}>
              {priorities.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select>
            <Select label="Type" value={form.typeKey} onChange={(e) => updateField("typeKey", e.target.value)}>
              {types.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select>
            <Select label="Channel" value={form.channelKey} onChange={(e) => updateField("channelKey", e.target.value)}>
              {channels.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select>
          </div>
        </section>

        {/* Routing */}
        <section className="space-y-3.5">
          <SectionHeading icon="teams" tone="blue" title="Routing" hint="Where this ticket should land." />
          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Organization" value={form.organizationId} onChange={(e) => updateField("organizationId", e.target.value)}>
              <option value="">None</option>
              {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>

            {isAgent ? (
              <>
                <Select label="Team" value={form.teamId} onChange={(e) => updateField("teamId", e.target.value)} required>
                  <option value="">Select a team *</option>
                  {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Select label="Assignee" value={form.assigneeId} onChange={(e) => updateField("assigneeId", e.target.value)} disabled={!form.teamId || loadingMembers}>
                  <option value="">Unassigned (Team Queue)</option>
                  {loadingMembers ? (
                    <option disabled>Loading team members...</option>
                  ) : teamMembers.length === 0 && form.teamId ? (
                    <option disabled>No team members available</option>
                  ) : (
                    teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email} {member.is_lead ? "(Manager)" : ""}
                      </option>
                    ))
                  )}
                </Select>
              </>
            ) : (
              <div className="md:col-span-2 px-4 py-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] text-sm text-[var(--fg-secondary)] flex items-center gap-3">
                <Icon name="info" size={16} className="text-[var(--fg-muted)] flex-shrink-0" />
                Assignments are managed by support agents after submission.
              </div>
            )}
          </div>

          {isAgent && form.teamId && !form.assigneeId && (
            <Banner tone="info">Ticket will be added to the team queue. Any team member can pick it up.</Banner>
          )}
        </section>
      </form>
    );
  }

  // ─── Template Form ─────────────────────────
  function renderTemplateForm() {
    if (!selectedTemplate) return null;
    const schema = selectedTemplate.fields_schema || [];
    const stdConfig = selectedTemplate.standard_field_config || {};
    const hasStdDetails = isStdFieldVisible("subject") || isStdFieldVisible("description");
    const hasClassification = isStdFieldVisible("priority") || isStdFieldVisible("type") || isStdFieldVisible("channel");
    const hasRouting = isStdFieldVisible("organization") || (isAgent && (isStdFieldVisible("team") || isStdFieldVisible("assignee")));

    return (
      <form id="ticket-create-form" onSubmit={onSubmit} className="space-y-6">
        {/* Template header */}
        <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
            <Icon name={selectedTemplate.icon || "fileText"} size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate tracking-tight">{selectedTemplate.name}</h3>
            {selectedTemplate.description && (
              <p className="text-xs text-[var(--fg-muted)] leading-snug mt-0.5">{selectedTemplate.description}</p>
            )}
          </div>
        </div>

        {/* Standard ticket fields (only visible ones) */}
        {hasStdDetails && (
          <section className="space-y-3.5">
            <SectionHeading icon="pencil" tone="accent" title="Request details" />
            {isStdFieldVisible("subject") && (
              <Input
                label="Subject"
                value={form.subject}
                onChange={(e) => updateField("subject", e.target.value)}
                placeholder="Short summary of the request"
                required={isStdFieldRequired("subject")}
              />
            )}
            {isStdFieldVisible("description") && (
              <Textarea
                label="Description"
                rows={3}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Additional context"
              />
            )}
            {/* Create on behalf — agents/admins only */}
            {renderOnBehalfSection()}
          </section>
        )}

        {/* If standard details are hidden, the on-behalf picker still belongs near the top */}
        {!hasStdDetails && renderOnBehalfSection()}

        {/* Standard field row: priority, type, channel */}
        {hasClassification && (
          <section className="space-y-3.5">
            <SectionHeading icon="tag" tone="violet" title="Classification" />
            <div className="grid gap-4 md:grid-cols-3">
              {isStdFieldVisible("priority") && (
                <Select label="Priority" value={form.priorityKey} onChange={(e) => updateField("priorityKey", e.target.value)}>
                  {priorities.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </Select>
              )}
              {isStdFieldVisible("type") && (
                <Select label="Type" value={form.typeKey} onChange={(e) => updateField("typeKey", e.target.value)}>
                  {types.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </Select>
              )}
              {isStdFieldVisible("channel") && (
                <Select label="Channel" value={form.channelKey} onChange={(e) => updateField("channelKey", e.target.value)}>
                  {channels.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </Select>
              )}
            </div>
          </section>
        )}

        {/* Organization / Team / Assignee (if visible) */}
        {hasRouting && (
          <section className="space-y-3.5">
            <SectionHeading icon="teams" tone="blue" title="Routing" />
            <div className="grid gap-4 md:grid-cols-3">
              {isStdFieldVisible("organization") && (
                <Select label="Organization" value={form.organizationId} onChange={(e) => updateField("organizationId", e.target.value)}>
                  <option value="">None</option>
                  {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              )}
              {isAgent && isStdFieldVisible("team") && (
                <Select label="Team" value={form.teamId} onChange={(e) => updateField("teamId", e.target.value)}>
                  <option value="">Select a team</option>
                  {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              )}
              {isAgent && isStdFieldVisible("assignee") && (
                <Select label="Assignee" value={form.assigneeId} onChange={(e) => updateField("assigneeId", e.target.value)} disabled={!form.teamId || loadingMembers}>
                  <option value="">Unassigned (Team Queue)</option>
                  {loadingMembers ? (
                    <option disabled>Loading team members...</option>
                  ) : teamMembers.length === 0 && form.teamId ? (
                    <option disabled>No team members available</option>
                  ) : (
                    teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email} {member.is_lead ? "(Manager)" : ""}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </div>

            {/* Info banner when team selected but no assignee */}
            {isAgent && form.teamId && !form.assigneeId && isStdFieldVisible("assignee") && (
              <Banner tone="info">Ticket will be added to the team queue. Any team member can pick it up.</Banner>
            )}
          </section>
        )}

        {/* Dynamic template fields */}
        {schema.length > 0 && (
          <section className="space-y-3.5 pt-2 border-t border-[var(--border-default)]">
            <div className="pt-4">
              <SectionHeading icon="clipboard" tone="indigo" title="Template fields" hint="Specific to this request type." />
            </div>
            <TemplateRenderer
              schema={schema}
              values={templateValues}
              onChange={handleTemplateValueChange}
              errors={templateErrors}
              users={users}
            />
          </section>
        )}
      </form>
    );
  }

  // ─── Determine modal config based on mode ─────────────────────────
  const isFormMode = mode === "manual" || mode === "template_form" || mode === "form_send" || mode === "corporate";
  const modalTitle =
    mode === "corporate"
      ? "Raise a request"
      : mode === null || mode === "manual"
      ? "Create ticket"
      : mode === "template_gallery"
      ? "Choose a template"
      : mode === "template_form"
      ? `New: ${selectedTemplate?.name || "Template"}`
      : mode === "form_pick"
      ? "Choose a customer form"
      : mode === "form_send"
      ? `Send: ${selectedCustomerForm?.name || "Customer form"}`
      : "Form ticket created";

  const modalSubtitle =
    mode === "corporate"
      ? (corpStep === 1 ? "First, choose what your request is about." : "Now tell us about the issue.")
      : mode === null
      ? "Choose how you'd like to create your ticket."
      : mode === "manual"
      ? "Capture request details to route the issue quickly."
      : mode === "template_gallery"
      ? "Select a pre-built form template for your request."
      : mode === "template_form"
      ? selectedTemplate?.description || "Fill in the template fields below."
      : mode === "form_pick"
      ? "The recipient fills it from a one-time link — the response attaches to the ticket."
      : mode === "form_send"
      ? "Set the recipient and where the ticket should live."
      : "Copy the link below and send it to the customer.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      size={mode === "template_gallery" || mode === "template_form" ? "xl" : "lg"}
      actions={
        mode === "form_done" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // Refresh the parent list (it may blank to a skeleton — fine,
                // we're leaving the done screen now) then close.
                onCreated?.(cfResult?.ticketId);
                onClose?.();
              }}
            >
              Done
            </Button>
            <Button
              type="button"
              onClick={() => {
                window.location.href = `/tickets/${cfResult?.ticketId}`;
              }}
              icon={<Icon name="arrowRight" size={15} />}
            >
              Open ticket
            </Button>
          </>
        ) : mode === "corporate" ? (
          <>
            {corpStep === 2 && (
              <Button type="button" variant="ghost" onClick={() => setCorpStep(1)} icon={<Icon name="arrowLeft" size={16} />}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            {corpStep === 1 ? (
              <Button key="corp-next" type="button" onClick={goToCorpStep2} icon={<Icon name="arrowRight" size={16} />}>
                Next
              </Button>
            ) : (
              <Button key="corp-submit" type="button" onClick={onSubmit} loading={loading} icon={<Icon name="send" size={16} />}>
                {loading ? "Submitting..." : "Submit request"}
              </Button>
            )}
          </>
        ) : (
          <>
            {mode !== null && mode !== "corporate" && (
              <Button type="button" variant="ghost" onClick={goBack} icon={<Icon name="arrowLeft" size={16} />}>
                Back
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {isFormMode && (
              <Button
                type="submit"
                form="ticket-create-form"
                loading={loading}
                icon={<Icon name={mode === "form_send" || mode === "corporate" ? "send" : "plus"} size={16} />}
              >
                {loading
                  ? mode === "corporate" ? "Submitting..." : "Creating..."
                  : mode === "form_send"
                  ? "Create ticket & form link"
                  : mode === "corporate"
                  ? "Submit request"
                  : "Create ticket"}
              </Button>
            )}
          </>
        )
      }
    >
      {mode === null && renderModeSelection()}
      {mode === "corporate" && renderCorporateForm()}
      {mode === "manual" && renderManualForm()}
      {mode === "template_gallery" && (
        <TemplateGallery
          onSelectTemplate={handleTemplateSelected}
          onBack={goBack}
        />
      )}
      {mode === "template_form" && renderTemplateForm()}
      {mode === "form_pick" && renderFormPicker()}
      {mode === "form_send" && renderFormSend()}
      {mode === "form_done" && renderFormDone()}
    </Modal>
  );
}
