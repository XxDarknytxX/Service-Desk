/**
 * Template Builder Page
 * Admin page for managing ticket templates with categories, form builder, and standard field config.
 */

import { useState, useEffect, useCallback } from "react";
import { api, templatesApi } from "../services/api";
import { useMeta } from "../contexts/meta";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea, Select } from "../components/ui/Input";
import Tabs from "../components/ui/Tabs";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import TemplateCategoryManager from "../components/templates/TemplateCategoryManager";
import TemplateFormBuilder from "../components/templates/TemplateFormBuilder";
import TemplateApprovalFlow from "../components/templates/TemplateApprovalFlow";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* Per-card accent palette — static class strings (no dynamic Tailwind). */
const CARD_ACCENTS = [
  { tile: "bg-violet-500/10 text-violet-500 border-violet-500/15", glow: "bg-violet-500" },
  { tile: "bg-blue-500/10 text-blue-500 border-blue-500/15", glow: "bg-blue-500" },
  { tile: "bg-cyan-500/10 text-cyan-500 border-cyan-500/15", glow: "bg-cyan-500" },
  { tile: "bg-teal-500/10 text-teal-500 border-teal-500/15", glow: "bg-teal-500" },
  { tile: "bg-indigo-500/10 text-indigo-500 border-indigo-500/15", glow: "bg-indigo-500" },
  { tile: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", glow: "bg-emerald-500" },
];

const iconOptions = [
  { value: "lock", label: "Lock" },
  { value: "shield", label: "Shield" },
  { value: "clipboard", label: "Clipboard" },
  { value: "fileText", label: "File Text" },
  { value: "settings", label: "Settings" },
  { value: "users", label: "Users" },
  { value: "check", label: "Check" },
  { value: "alert", label: "Alert" },
  { value: "info", label: "Info" },
  { value: "mail", label: "Mail" },
  { value: "phone", label: "Phone" },
  { value: "hash", label: "Hash" },
];

const standardFields = [
  { key: "subject", label: "Subject", hasDefault: true, defaultType: "text" },
  { key: "description", label: "Description", hasDefault: false },
  { key: "priority", label: "Priority", hasDefault: true, defaultType: "priority" },
  { key: "type", label: "Type", hasDefault: true, defaultType: "type" },
  { key: "channel", label: "Channel", hasDefault: true, defaultType: "channel" },
  { key: "team", label: "Team", hasDefault: true, defaultType: "team" },
  { key: "assignee", label: "Assignee", hasDefault: true, defaultType: "assignee" },
  { key: "organization", label: "Organization", hasDefault: true, defaultType: "organization" },
];

const visibilityOptions = [
  { value: "required", label: "Required" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
];

const defaultFormState = {
  name: "",
  description: "",
  category_id: "",
  icon: "fileText",
  fields_schema: [],
  standard_field_config: {},
  default_subject: "",
  default_priority_key: "",
  default_type_key: "",
  default_channel_key: "",
  default_team_id: "",
  default_assignee_id: "",
  default_organization_id: "",
  sort_order: 0,
  is_active: true,
};

export default function TemplateBuilder() {
  const { meta } = useMeta();
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState({ ...defaultFormState });
  const [submitting, setSubmitting] = useState(false);

  const priorities = meta?.priorities || [];
  const types = meta?.types || [];
  const channels = meta?.channels || [];
  const teams = meta?.teams || [];
  const organizations = meta?.organizations || [];

  // Team members for assignee default selector
  const [defaultTeamMembers, setDefaultTeamMembers] = useState([]);
  const [loadingDefaultMembers, setLoadingDefaultMembers] = useState(false);

  // --- Data Loading ---

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCategoryId) params.category_id = selectedCategoryId;
      if (search.trim()) params.search = search.trim();
      const data = await templatesApi.getTemplates(params);
      setTemplates(data.templates || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
      toast.error(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId, search]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await templatesApi.getCategories();
      setCategories(data.categories || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Load team members when default team changes (for assignee dropdown)
  useEffect(() => {
    if (form.default_team_id) {
      setLoadingDefaultMembers(true);
      api(`/teams/${form.default_team_id}/members`)
        .then((data) => setDefaultTeamMembers(data.members || []))
        .catch(() => setDefaultTeamMembers([]))
        .finally(() => setLoadingDefaultMembers(false));
    } else {
      setDefaultTeamMembers([]);
    }
  }, [form.default_team_id]);

  // --- Modal Handlers ---

  function openCreateModal() {
    setEditingTemplate(null);
    setForm({ ...defaultFormState });
    setActiveTab("basic");
    setShowModal(true);
  }

  function openEditModal(template) {
    setEditingTemplate(template);
    setForm({
      name: template.name || "",
      description: template.description || "",
      category_id: template.category_id ? String(template.category_id) : "",
      icon: template.icon || "fileText",
      fields_schema: template.fields_schema || [],
      standard_field_config: template.standard_field_config || {},
      default_subject: template.default_subject || "",
      default_priority_key: template.default_priority_key || "",
      default_type_key: template.default_type_key || "",
      default_channel_key: template.default_channel_key || "",
      default_team_id: template.default_team_id ? String(template.default_team_id) : "",
      default_assignee_id: template.default_assignee_id ? String(template.default_assignee_id) : "",
      default_organization_id: template.default_organization_id ? String(template.default_organization_id) : "",
      sort_order: template.sort_order || 0,
      is_active: template.is_active === 1 || template.is_active === true,
    });
    setActiveTab("basic");
    setShowModal(true);
  }

  // --- CRUD Operations ---

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Template name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        default_team_id: form.default_team_id ? Number(form.default_team_id) : null,
        default_assignee_id: form.default_assignee_id ? Number(form.default_assignee_id) : null,
        default_organization_id: form.default_organization_id ? Number(form.default_organization_id) : null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active ? 1 : 0,
      };

      if (editingTemplate) {
        await templatesApi.updateTemplate(editingTemplate.id, payload);
      } else {
        await templatesApi.createTemplate(payload);
      }
      setShowModal(false);
      loadTemplates();
    } catch (err) {
      toast.error(err.message || "Failed to save template.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(template) {
    confirm({
      title: "Delete template?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{template.name}</strong>{" "}
          and its approval flow. Tickets already created from it are not
          affected.
        </>
      ),
      confirmText: "Delete Template",
      onConfirm: async () => {
        try {
          await templatesApi.deleteTemplate(template.id);
          toast.success("Template deleted");
          loadTemplates();
        } catch (err) {
          toast.error(err.message || "Failed to delete template.");
        }
      },
    });
  }

  async function handleDuplicate(id) {
    try {
      await templatesApi.duplicateTemplate(id);
      toast.success("Template duplicated");
      loadTemplates();
    } catch (err) {
      toast.error(err.message || "Failed to duplicate template.");
    }
  }

  async function toggleActive(template) {
    try {
      await templatesApi.updateTemplate(template.id, {
        is_active: template.is_active ? 0 : 1,
      });
      loadTemplates();
    } catch (err) {
      toast.error(err.message || "Failed to update template.");
    }
  }

  // --- Standard Field Config Helpers ---

  function getFieldVisibility(fieldKey) {
    return form.standard_field_config?.[fieldKey]?.visibility || "visible";
  }

  function setFieldVisibility(fieldKey, visibility) {
    setForm((prev) => ({
      ...prev,
      standard_field_config: {
        ...prev.standard_field_config,
        [fieldKey]: {
          ...prev.standard_field_config?.[fieldKey],
          visibility,
        },
      },
    }));
  }

  function getDefaultValueForField(fieldDef) {
    switch (fieldDef.defaultType) {
      case "text":
        return form.default_subject;
      case "priority":
        return form.default_priority_key;
      case "type":
        return form.default_type_key;
      case "channel":
        return form.default_channel_key;
      case "team":
        return form.default_team_id;
      case "assignee":
        return form.default_assignee_id;
      case "organization":
        return form.default_organization_id;
      default:
        return "";
    }
  }

  function setDefaultValueForField(fieldDef, value) {
    switch (fieldDef.defaultType) {
      case "text":
        setForm((prev) => ({ ...prev, default_subject: value }));
        break;
      case "priority":
        setForm((prev) => ({ ...prev, default_priority_key: value }));
        break;
      case "type":
        setForm((prev) => ({ ...prev, default_type_key: value }));
        break;
      case "channel":
        setForm((prev) => ({ ...prev, default_channel_key: value }));
        break;
      case "team":
        // Clear assignee when team changes
        setForm((prev) => ({ ...prev, default_team_id: value, default_assignee_id: "" }));
        break;
      case "assignee":
        setForm((prev) => ({ ...prev, default_assignee_id: value }));
        break;
      case "organization":
        setForm((prev) => ({ ...prev, default_organization_id: value }));
        break;
      default:
        break;
    }
  }

  function renderDefaultValueInput(fieldDef) {
    if (!fieldDef.hasDefault) return <span className="text-xs text-[var(--fg-muted)]">--</span>;

    const currentVal = getDefaultValueForField(fieldDef);

    switch (fieldDef.defaultType) {
      case "text":
        return (
          <input
            type="text"
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            placeholder="Default subject..."
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "placeholder:text-[var(--fg-muted)]",
              "transition-all duration-200"
            )}
          />
        );
      case "priority":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200"
            )}
          >
            <option value="">No default</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        );
      case "type":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200"
            )}
          >
            <option value="">No default</option>
            {types.map((t) => (
              <option key={t.id} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        );
      case "channel":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200"
            )}
          >
            <option value="">No default</option>
            {channels.map((c) => (
              <option key={c.id} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        );
      case "team":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200"
            )}
          >
            <option value="">No default</option>
            {teams.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        );
      case "assignee":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            disabled={!form.default_team_id || loadingDefaultMembers}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200",
              (!form.default_team_id || loadingDefaultMembers) && "opacity-50 cursor-not-allowed"
            )}
          >
            <option value="">
              {!form.default_team_id
                ? "Select a team first"
                : loadingDefaultMembers
                ? "Loading members..."
                : "Unassigned (Team Queue)"}
            </option>
            {defaultTeamMembers.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.full_name || m.email} {m.is_lead ? "(Manager)" : ""}
              </option>
            ))}
          </select>
        );
      case "organization":
        return (
          <select
            value={currentVal}
            onChange={(e) => setDefaultValueForField(fieldDef, e.target.value)}
            className={cn(
              "w-full px-3 py-1.5 text-sm rounded-lg",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-all duration-200"
            )}
          >
            <option value="">No default</option>
            {organizations.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        );
      default:
        return <span className="text-xs text-[var(--fg-muted)]">--</span>;
    }
  }

  // --- Tab Definitions ---

  const tabs = [
    { key: "basic", label: "Basic Info", icon: "info" },
    { key: "standard", label: "Standard Fields", icon: "list" },
    { key: "builder", label: "Form Builder", icon: "settings" },
    { key: "approvals", label: "Approval Flow", icon: "shield" },
  ];

  // --- Render ---

  return (
    <div className="flex flex-col h-[calc(100vh-64px-4rem)] animate-fade-in">
      {/* Page Header — fixed, never scrolls */}
      <div className="flex-shrink-0 mb-5">
        <PageHeader
          icon="clipboard"
          title="Ticket Templates"
          subtitle="Create and manage templates for standardized ticket creation"
          actions={
            <>
              <button
                onClick={() => loadTemplates()}
                title="Refresh templates"
                className={cn(
                  "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                  "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
                )}
              >
                <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
              </button>
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Create Template
              </Button>
            </>
          }
        />
      </div>

      {/* Main 2-Column Layout — fills remaining height */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left Sidebar - Category Manager (self-scrolling) */}
        <div className="w-64 flex-shrink-0 overflow-y-auto scrollbar-none animate-fade-up">
          <TemplateCategoryManager
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            onCategoriesChanged={loadCategories}
          />
        </div>

        {/* Right Main Area — flex column so search stays pinned, grid scrolls */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Search — pinned at top, never scrolls */}
          <div className="flex-shrink-0 mb-4">
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
                <Icon name="search" size={18} />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 text-sm",
                  "bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
                  "border border-[var(--border-default)]",
                  "placeholder:text-[var(--fg-muted)]",
                  "focus:outline-none focus:border-[var(--accent)]",
                  "focus:ring-2 focus:ring-[var(--accent)]/20",
                  "transition-all duration-200"
                )}
              />
            </div>
          </div>

          {/* Template Grid — THIS is the only part that scrolls */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 scrollbar-none">
            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <Skeleton className="h-10 w-10" rounded="rounded-lg" />
                      <div className="flex-1 space-y-2 pt-0.5">
                        <Skeleton className="h-4 w-40" rounded="rounded-md" />
                        <Skeleton className="h-3 w-full" rounded="rounded-md" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-24 mb-4" rounded="rounded-full" />
                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-[var(--border-default)]">
                      {Array.from({ length: 3 }).map((__, j) => (
                        <div key={j} className="space-y-1.5">
                          <Skeleton className="h-2.5 w-12" rounded="rounded-md" />
                          <Skeleton className="h-4 w-8" rounded="rounded-md" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
                <EmptyState
                  icon="clipboard"
                  title="No templates found"
                  description={
                    search || selectedCategoryId
                      ? "Try adjusting your search or category filter."
                      : "Create your first template to get started."
                  }
                  action={
                    !search && !selectedCategoryId ? (
                      <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                        Create First Template
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-2">
                {templates.map((template, idx) => {
                  const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
                  const fieldCount =
                    (template.fields_schema?.length || 0) +
                    Object.keys(template.standard_field_config || {}).length;
                  const usageCount = template.usage_count || 0;

                  return (
                    <div
                      key={template.id}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl p-5",
                        "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                        "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                        "animate-fade-up",
                        !template.is_active && "opacity-75"
                      )}
                      style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                    >
                      {/* decorative corner glow */}
                      <div
                        className={cn(
                          "pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.14]",
                          accent.glow
                        )}
                      />

                      {/* Header */}
                      <div className="relative flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                              "transition-transform duration-200 group-hover:scale-110",
                              accent.tile
                            )}
                          >
                            <Icon name={template.icon || "fileText"} size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-base font-semibold text-[var(--fg-primary)] truncate">
                                {template.name}
                              </h3>
                              {template.is_active ? (
                                <Badge tone="emerald" size="sm" dot>Active</Badge>
                              ) : (
                                <Badge tone="slate" size="sm">Inactive</Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-xs text-[var(--fg-secondary)] leading-relaxed line-clamp-2">
                                {template.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                          <button
                            onClick={() => toggleActive(template)}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              template.is_active
                                ? "text-emerald-500 hover:bg-emerald-500/10"
                                : "text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                            )}
                            title={template.is_active ? "Disable template" : "Enable template"}
                          >
                            <Icon name={template.is_active ? "check" : "close"} size={14} />
                          </button>
                          <button
                            onClick={() => openEditModal(template)}
                            className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all"
                            title="Edit template"
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            onClick={() => handleDuplicate(template.id)}
                            className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-all"
                            title="Duplicate template"
                          >
                            <Icon name="copy" size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(template)}
                            className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                            title="Delete template"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Meta Info */}
                      {template.category_name && (
                        <div className="relative flex flex-wrap gap-2 mb-4">
                          <Badge tone="violet" size="sm" icon={<Icon name="tag" size={11} />}>
                            {template.category_name}
                          </Badge>
                        </div>
                      )}

                      {/* Footer Stats */}
                      <div className="relative pt-3 border-t border-[var(--border-default)]">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-label mb-0.5">Fields</p>
                            <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums">{fieldCount}</p>
                          </div>
                          <div>
                            <p className="text-label mb-0.5">Uses</p>
                            <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums">{usageCount}</p>
                          </div>
                          <div>
                            <p className="text-label mb-0.5">Order</p>
                            <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums">{template.sort_order || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Template Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingTemplate ? "Edit Template" : "Create Template"}
        subtitle={
          editingTemplate
            ? "Update template configuration and form fields"
            : "Define a new template for standardized ticket creation"
        }
        size="xl"
        fillContent
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col flex-1 min-h-0">
        {/* Tabs */}
        <div className="mb-6 shrink-0">
          <Tabs
            variant="pills"
            value={activeTab}
            onChange={setActiveTab}
            tabs={tabs.map((tab) => ({ value: tab.key, label: tab.label, icon: tab.icon }))}
            className="w-full flex-wrap"
          />
        </div>

        {/* Tab 1: Basic Info */}
        {activeTab === "basic" && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Template Name"
                placeholder="e.g., Access Request"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Select
                label="Category"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </option>
                ))}
              </Select>
            </div>

            <Textarea
              label="Description"
              placeholder="Describe what this template is used for..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Icon</label>
                <div className="grid grid-cols-6 gap-2">
                  {iconOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, icon: opt.value })}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-lg",
                        "transition-all duration-200 border",
                        form.icon === opt.value
                          ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]"
                          : cn(
                              "bg-[var(--bg-base)] border-[var(--border-default)]",
                              "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]",
                              "hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)]"
                            )
                      )}
                      title={opt.label}
                    >
                      <Icon name={opt.value} size={18} />
                      <span className="text-[9px] mt-1 leading-none">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Sort Order"
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  helperText="Lower numbers appear first"
                />

                <label
                  className={cn(
                    "flex items-center gap-3 cursor-pointer p-4 rounded-lg",
                    "bg-[var(--bg-base)] border border-[var(--border-default)]",
                    "hover:border-[var(--border-hover)] transition-all duration-200"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--fg-primary)]">Template is Active</p>
                    <p className="text-xs text-[var(--fg-muted)]">
                      Only active templates appear in the gallery
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Tab 2: Standard Fields */}
        {activeTab === "standard" && (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/15">
              <span className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Icon name="info" size={16} />
              </span>
              <p className="text-xs text-[var(--fg-secondary)] leading-relaxed pt-1">
                Configure which standard ticket fields are shown when using this template. Set visibility
                and default values for each field.
              </p>
            </div>

            <div
              className={cn(
                "rounded-2xl overflow-hidden",
                "border border-[var(--border-default)]",
                "bg-[var(--bg-elevated)] shadow-[var(--shadow-card)]"
              )}
            >
              {/* Table Header */}
              <div
                className={cn(
                  "grid grid-cols-[180px_160px_1fr] gap-4 px-5 py-3",
                  "bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]"
                )}
              >
                <span className="text-label">Field Name</span>
                <span className="text-label">Visibility</span>
                <span className="text-label">Default Value</span>
              </div>

              {/* Table Rows */}
              {standardFields.map((field, idx) => (
                <div
                  key={field.key}
                  className={cn(
                    "grid grid-cols-[180px_160px_1fr] gap-4 px-5 py-3 items-center",
                    idx < standardFields.length - 1 && "border-b border-[var(--border-default)]",
                    "hover:bg-[var(--bg-surface)] transition-colors duration-150"
                  )}
                >
                  {/* Field Name */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--fg-primary)]">{field.label}</span>
                  </div>

                  {/* Visibility */}
                  <select
                    value={getFieldVisibility(field.key)}
                    onChange={(e) => setFieldVisibility(field.key, e.target.value)}
                    className={cn(
                      "w-full px-3 py-1.5 text-sm rounded-lg",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)]",
                      "transition-all duration-200"
                    )}
                  >
                    {visibilityOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {/* Default Value */}
                  <div>{renderDefaultValueInput(field)}</div>
                </div>
              ))}
            </div>
          </div>
          </div>
        )}

        {/* Tab 3: Form Builder — flex-1 so it fills remaining modal space, columns scroll independently */}
        {activeTab === "builder" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TemplateFormBuilder
              schema={form.fields_schema}
              onChange={(newSchema) => setForm({ ...form, fields_schema: newSchema })}
            />
          </div>
        )}

        {activeTab === "approvals" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TemplateApprovalFlow
              templateId={editingTemplate?.id || null}
              fieldsSchema={form.fields_schema}
            />
          </div>
        )}
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
