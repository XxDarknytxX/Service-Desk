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
import { api, templatesApi } from "../../services/api";
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
};

export default function TicketCreateModal({ open, onClose, meta, user, onCreated }) {
  const toast = useToast();
  // Mode: null (choosing), 'manual', 'template_gallery', 'template_form'
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  const isAgent = user?.roles?.includes("admin") || user?.roles?.includes("agent");

  // Find default organization (try configured name first, then fall back to first available)
  const defaultOrgId = useMemo(() => {
    const match = organizations.find((o) => o.name.toLowerCase() === DEFAULT_ORG_NAME.toLowerCase());
    if (match) return String(match.id);
    return organizations.length > 0 ? String(organizations[0].id) : "";
  }, [organizations]);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setMode(null);
      setForm({ ...defaultForm, organizationId: defaultOrgId });
      setError("");
      setLoading(false);
      setTeamMembers([]);
      setSelectedTemplate(null);
      setTemplateValues({});
      setTemplateErrors({});
      setRequesterSearch("");
      setRequesterOpen(false);
      setCreateOnBehalf(false);
    }
  }, [open, defaultOrgId]);

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
    setError("");

    // Validate template fields if in template mode
    if (mode === "template_form" && selectedTemplate) {
      const schema = selectedTemplate.fields_schema || [];
      const errors = validateTemplateForm(schema, templateValues);
      if (Object.keys(errors).length > 0) {
        setTemplateErrors(errors);
        return;
      }
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
      setError(err.message);
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
    } else if (mode === "template_gallery" || mode === "manual") {
      setMode(null);
    }
  }

  // ─── Mode Selection Screen ─────────────────────────
  function renderModeSelection() {
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--fg-secondary)] text-center">
          How would you like to create this ticket?
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Manual Option */}
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "group relative flex flex-col items-center gap-4 p-6 rounded-xl",
              "bg-[var(--bg-surface)] border border-[var(--border-default)]",
              "hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface-hover)]",
              "transition-all duration-200 text-left"
            )}
          >
            <div className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center",
              "bg-[var(--accent)]/10 text-[var(--accent)]",
              "group-hover:bg-[var(--accent)]/20 transition-colors"
            )}>
              <Icon name="pencil" size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Manual Ticket</h3>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                Create with standard fields — subject, description, priority, and more
              </p>
            </div>
          </button>

          {/* Template Option */}
          <button
            type="button"
            onClick={() => setMode("template_gallery")}
            className={cn(
              "group relative flex flex-col items-center gap-4 p-6 rounded-xl",
              "bg-[var(--bg-surface)] border border-[var(--border-default)]",
              "hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface-hover)]",
              "transition-all duration-200 text-left"
            )}
          >
            <div className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center",
              "bg-blue-500/10 text-blue-400",
              "group-hover:bg-blue-500/20 transition-colors"
            )}>
              <Icon name="clipboard" size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">From Template</h3>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                Use a pre-built form template for common request types
              </p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── Manual Form ─────────────────────────
  function renderManualForm() {
    return (
      <form id="ticket-create-form" onSubmit={onSubmit} className="space-y-5">
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

        {/* Create on behalf toggle — agents/admins only */}
        {isAgent && !createOnBehalf && (
          <button
            type="button"
            onClick={() => setCreateOnBehalf(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium w-full",
              "border border-dashed border-[var(--border-default)]",
              "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
              "hover:border-[var(--accent)] hover:bg-[var(--accent)]/5",
              "transition-all duration-150"
            )}
          >
            <Icon name="users" size={16} className="text-[var(--fg-muted)]" />
            Create on behalf of another user
          </button>
        )}

        {isAgent && createOnBehalf && (
          <div className={cn(
            "rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3 space-y-2"
          )}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--fg-secondary)]">
                Creating on behalf of
              </label>
              <button
                type="button"
                onClick={() => { setCreateOnBehalf(false); updateField("requesterId", ""); setRequesterSearch(""); setRequesterOpen(false); }}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
            <div ref={requesterRef} className="relative">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg cursor-text",
                  "bg-[var(--bg-elevated)] border",
                  requesterOpen ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-[var(--border-default)]",
                  "transition-all duration-150"
                )}
                onClick={() => setRequesterOpen(true)}
              >
                <Icon name="user" size={15} className="text-[var(--fg-muted)] flex-shrink-0" />
                {form.requesterId ? (
                  <span className="flex-1 text-sm text-[var(--fg-primary)]">
                    {users.find(u => String(u.id) === String(form.requesterId))?.full_name ||
                     users.find(u => String(u.id) === String(form.requesterId))?.email ||
                     "Selected user"}
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

              {/* Dropdown */}
              {requesterOpen && !form.requesterId && (
                <div className={cn(
                  "absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                  "rounded-lg shadow-lg"
                )}>
                  {users
                    .filter(u => {
                      if (!requesterSearch) return true;
                      const q = requesterSearch.toLowerCase();
                      return (u.full_name || "").toLowerCase().includes(q) ||
                             (u.email || "").toLowerCase().includes(q);
                    })
                    .slice(0, 20)
                    .map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateField("requesterId", String(u.id));
                          setRequesterSearch("");
                          setRequesterOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                          "hover:bg-[var(--bg-surface-hover)] transition-colors"
                        )}
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
                  {users.filter(u => {
                    if (!requesterSearch) return true;
                    const q = requesterSearch.toLowerCase();
                    return (u.full_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
                  }).length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-[var(--fg-muted)]">No users found</div>
                )}
              </div>
            )}
          </div>
          </div>
        )}

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
            <div className={cn("md:col-span-2 px-4 py-3 rounded-lg", "bg-[var(--bg-base)]", "border border-[var(--border-default)]", "text-sm text-[var(--fg-secondary)]", "flex items-center gap-3")}>
              <Icon name="info" size={16} className="text-[var(--fg-muted)] flex-shrink-0" />
              Assignments are managed by support agents after submission.
            </div>
          )}
        </div>

        {isAgent && form.teamId && !form.assigneeId && (
          <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", "bg-blue-500/10", "border border-blue-500/20")}>
            <Icon name="info" size={16} className="text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-400">Ticket will be added to the team queue. Any team member can pick it up.</p>
          </div>
        )}

        {error && (
          <div className={cn("flex items-center gap-3 p-4 rounded-lg", "bg-red-500/10", "border border-red-500/20")}>
            <Icon name="alert" size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm font-medium text-red-400">{error}</p>
          </div>
        )}
      </form>
    );
  }

  // ─── Template Form ─────────────────────────
  function renderTemplateForm() {
    if (!selectedTemplate) return null;
    const schema = selectedTemplate.fields_schema || [];
    const stdConfig = selectedTemplate.standard_field_config || {};

    return (
      <form id="ticket-create-form" onSubmit={onSubmit} className="space-y-6">
        {/* Template header */}
        <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", "bg-[var(--accent)]/5", "border border-[var(--accent)]/20")}>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", "bg-[var(--accent)]/10 text-[var(--accent)]")}>
            <Icon name={selectedTemplate.icon || "fileText"} size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--fg-primary)]">{selectedTemplate.name}</h3>
            {selectedTemplate.description && (
              <p className="text-xs text-[var(--fg-muted)]">{selectedTemplate.description}</p>
            )}
          </div>
        </div>

        {/* Standard ticket fields (only visible ones) */}
        {(isStdFieldVisible("subject") || isStdFieldVisible("description")) && (
          <div className="space-y-4">
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
          </div>
        )}

        {/* Create on behalf toggle — agents/admins only */}
        {isAgent && !createOnBehalf && (
          <button
            type="button"
            onClick={() => setCreateOnBehalf(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium w-full",
              "border border-dashed border-[var(--border-default)]",
              "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
              "hover:border-[var(--accent)] hover:bg-[var(--accent)]/5",
              "transition-all duration-150"
            )}
          >
            <Icon name="users" size={16} className="text-[var(--fg-muted)]" />
            Create on behalf of another user
          </button>
        )}

        {isAgent && createOnBehalf && (
          <div className={cn(
            "rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3 space-y-2"
          )}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--fg-secondary)]">
                Creating on behalf of
              </label>
              <button
                type="button"
                onClick={() => { setCreateOnBehalf(false); updateField("requesterId", ""); setRequesterSearch(""); setRequesterOpen(false); }}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
            <div ref={requesterRef} className="relative">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg cursor-text",
                  "bg-[var(--bg-elevated)] border",
                  requesterOpen ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20" : "border-[var(--border-default)]",
                  "transition-all duration-150"
                )}
                onClick={() => setRequesterOpen(true)}
              >
                <Icon name="user" size={15} className="text-[var(--fg-muted)] flex-shrink-0" />
                {form.requesterId ? (
                  <span className="flex-1 text-sm text-[var(--fg-primary)]">
                    {users.find(u => String(u.id) === String(form.requesterId))?.full_name ||
                     users.find(u => String(u.id) === String(form.requesterId))?.email || "Selected user"}
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
                  <button type="button" onClick={(e) => { e.stopPropagation(); updateField("requesterId", ""); setRequesterSearch(""); }} className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors">
                    <Icon name="close" size={14} />
                  </button>
                ) : (
                  <Icon name="chevronDown" size={14} className="text-[var(--fg-muted)] flex-shrink-0" />
                )}
              </div>
              {requesterOpen && !form.requesterId && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg">
                  {users.filter(u => { if (!requesterSearch) return true; const q = requesterSearch.toLowerCase(); return (u.full_name||"").toLowerCase().includes(q)||(u.email||"").toLowerCase().includes(q); }).slice(0,20).map(u => (
                    <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); updateField("requesterId", String(u.id)); setRequesterSearch(""); setRequesterOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-surface-hover)] transition-colors">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold">{(u.full_name||u.email||"U")[0].toUpperCase()}</div>
                      <div className="min-w-0"><p className="text-sm font-medium text-[var(--fg-primary)] truncate">{u.full_name||u.email}</p>{u.full_name&&<p className="text-xs text-[var(--fg-muted)] truncate">{u.email}</p>}</div>
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
                  {users.filter(u => { if (!requesterSearch) return true; const q = requesterSearch.toLowerCase(); return (u.full_name||"").toLowerCase().includes(q)||(u.email||"").toLowerCase().includes(q); }).length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-[var(--fg-muted)]">No users found</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Standard field row: priority, type, channel */}
        {(isStdFieldVisible("priority") || isStdFieldVisible("type") || isStdFieldVisible("channel")) && (
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
        )}

        {/* Organization / Team / Assignee (if visible) */}
        {(isStdFieldVisible("organization") || (isAgent && (isStdFieldVisible("team") || isStdFieldVisible("assignee")))) && (
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
        )}

        {/* Info banner when team selected but no assignee */}
        {isAgent && form.teamId && !form.assigneeId && isStdFieldVisible("assignee") && (
          <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", "bg-blue-500/10", "border border-blue-500/20")}>
            <Icon name="info" size={16} className="text-blue-400 flex-shrink-0" />
            <p className="text-sm text-blue-400">Ticket will be added to the team queue. Any team member can pick it up.</p>
          </div>
        )}

        {/* Divider before template fields */}
        {schema.length > 0 && (
          <div className="border-t border-[var(--border-default)]" />
        )}

        {/* Dynamic template fields */}
        <TemplateRenderer
          schema={schema}
          values={templateValues}
          onChange={handleTemplateValueChange}
          errors={templateErrors}
          users={users}
        />

        {error && (
          <div className={cn("flex items-center gap-3 p-4 rounded-lg", "bg-red-500/10", "border border-red-500/20")}>
            <Icon name="alert" size={16} className="text-red-400 flex-shrink-0" />
            <p className="text-sm font-medium text-red-400">{error}</p>
          </div>
        )}
      </form>
    );
  }

  // ─── Determine modal config based on mode ─────────────────────────
  const isFormMode = mode === "manual" || mode === "template_form";
  const modalTitle = mode === null
    ? "Create ticket"
    : mode === "manual"
    ? "Create ticket"
    : mode === "template_gallery"
    ? "Choose a template"
    : `New: ${selectedTemplate?.name || "Template"}`;

  const modalSubtitle = mode === null
    ? "Choose how you'd like to create your ticket."
    : mode === "manual"
    ? "Capture request details to route the issue quickly."
    : mode === "template_gallery"
    ? "Select a pre-built form template for your request."
    : selectedTemplate?.description || "Fill in the template fields below.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      size={mode === "template_gallery" || mode === "template_form" ? "xl" : "lg"}
      actions={
        <>
          {mode !== null && (
            <Button type="button" variant="ghost" onClick={goBack}>
              <Icon name="arrowLeft" size={16} />
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
              icon={<Icon name="plus" size={16} />}
            >
              {loading ? "Creating..." : "Create ticket"}
            </Button>
          )}
        </>
      }
    >
      {mode === null && renderModeSelection()}
      {mode === "manual" && renderManualForm()}
      {mode === "template_gallery" && (
        <TemplateGallery
          onSelectTemplate={handleTemplateSelected}
          onBack={goBack}
        />
      )}
      {mode === "template_form" && renderTemplateForm()}
    </Modal>
  );
}
