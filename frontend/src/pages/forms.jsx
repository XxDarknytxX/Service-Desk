/**
 * Customer Forms — full workflow workspace.
 *
 * List view  →  open a form into its workspace:
 *   1. Build    — name/description + drag-and-drop question builder
 *   2. Preview  — exactly what the customer sees, scrollable in-page,
 *                 plus "Open full preview" in a new tab
 *   3. Send     — one-time links per recipient (internal users or external emails)
 *   4. Results  — per-form dashboard: KPIs, per-question breakdowns,
 *                 and every individual response
 *
 * URL-driven (?id=…&tab=…) so refresh and deep-links work.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formsApi } from "../services/api";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import TemplateFormBuilder from "../components/templates/TemplateFormBuilder";
import TemplateRenderer from "../components/templates/TemplateRenderer";
import VodafoneLogo from "../components/ui/VodafoneLogo";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const formTints = ["violet", "blue", "cyan", "teal", "indigo", "emerald"];

const INVITE_STATUS = {
  pending: { tone: "amber", label: "Pending" },
  completed: { tone: "emerald", label: "Completed" },
  revoked: { tone: "slate", label: "Revoked" },
};

const INPUT_TYPES = new Set([
  "text", "textarea", "richtext", "select", "multiselect", "checkbox_group",
  "radio", "number", "date", "daterange", "user_lookup",
]);
const CHOICE_TYPES = new Set(["select", "radio", "multiselect", "checkbox_group"]);

const WORKSPACE_TABS = [
  { key: "build", label: "Build", icon: "edit", step: 1 },
  { key: "preview", label: "Preview", icon: "eye", step: 2 },
  { key: "send", label: "Send", icon: "send", step: 3 },
  { key: "results", label: "Results", icon: "barChart", step: 4 },
];

function countInputFields(schema) {
  return (schema || []).filter((f) => INPUT_TYPES.has(f.type)).length;
}

function fieldOptions(field) {
  return field.groups?.length
    ? field.groups.flatMap((g) => g.options || [])
    : field.options || [];
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every(isEmptyValue);
  return false;
}

function initialValues(schema) {
  const init = {};
  for (const f of schema || []) {
    if (f.defaultValue !== undefined && f.defaultValue !== null) init[f.id] = f.defaultValue;
    else if (f.type === "checkbox_group" || f.type === "multiselect") init[f.id] = [];
    else if (f.type === "daterange") init[f.id] = { start: "", end: "" };
    else init[f.id] = "";
  }
  return init;
}

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-FJ", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.round(hrs / 24)}d`;
}

export default function Forms() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = searchParams.get("id");
  const activeTab = searchParams.get("tab") || "build";

  // ── List state ──
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  // ── Workspace state ──
  const [form, setForm] = useState(null);
  const [invites, setInvites] = useState([]);
  const [loadingForm, setLoadingForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", fields_schema: [] });
  const [saving, setSaving] = useState(false);

  // Preview state
  const [previewValues, setPreviewValues] = useState({});

  // Send state
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [newLink, setNewLink] = useState(null);

  // Results state
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [viewingSub, setViewingSub] = useState(null);

  const isDirty =
    form &&
    (draft.name !== form.name ||
      (draft.description || "") !== (form.description || "") ||
      JSON.stringify(draft.fields_schema) !== JSON.stringify(form.fields_schema || []));

  // ── Loaders ──
  useEffect(() => {
    loadForms();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setForm(null);
      return;
    }
    let alive = true;
    setLoadingForm(true);
    formsApi
      .get(selectedId)
      .then((data) => {
        if (!alive) return;
        setForm(data.form);
        setInvites(data.invites || []);
        setDraft({
          name: data.form.name,
          description: data.form.description || "",
          fields_schema: Array.isArray(data.form.fields_schema) ? data.form.fields_schema : [],
        });
        setPreviewValues(initialValues(data.form.fields_schema));
        setNewLink(null);
      })
      .catch((e) => {
        toast.error(e.message || "Failed to load form");
        closeWorkspace();
      })
      .finally(() => alive && setLoadingForm(false));
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId && activeTab === "results") {
      setLoadingSubs(true);
      formsApi
        .submissions(selectedId)
        .then((d) => setSubmissions(d.submissions || []))
        .catch((e) => toast.error(e.message || "Failed to load responses"))
        .finally(() => setLoadingSubs(false));
    }
  }, [selectedId, activeTab]);

  useEffect(() => {
    if (selectedId && activeTab === "send" && allUsers.length === 0) {
      api("/users").then((d) => setAllUsers(d.items || [])).catch(() => {});
    }
  }, [selectedId, activeTab]);

  async function loadForms() {
    try {
      setLoading(true);
      const data = await formsApi.list();
      setForms(data.forms || []);
    } catch (e) {
      toast.error(e.message || "Failed to load forms");
    } finally {
      setLoading(false);
    }
  }

  // ── Navigation helpers ──
  function openWorkspace(id, tab = "build") {
    setSearchParams({ id: String(id), tab });
  }
  function switchTab(tab) {
    setSearchParams({ id: selectedId, tab });
  }
  function closeWorkspace() {
    setSearchParams({});
    loadForms();
  }

  // ── Create / save / delete ──
  async function handleCreate() {
    if (!createDraft.name.trim()) {
      toast.error("Give the form a name");
      return;
    }
    setCreating(true);
    try {
      const res = await formsApi.create({ ...createDraft, fields_schema: [] });
      toast.success("Form created — now add your questions");
      setShowCreate(false);
      setCreateDraft({ name: "", description: "" });
      openWorkspace(res.id, "build");
    } catch (e) {
      toast.error(e.message || "Failed to create form");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave({ silent } = {}) {
    if (!draft.name.trim()) {
      toast.error("Form name can't be empty");
      return false;
    }
    setSaving(true);
    try {
      await formsApi.update(form.id, draft);
      setForm((prev) => ({ ...prev, ...draft }));
      if (!silent) toast.success("Form saved");
      return true;
    } catch (e) {
      toast.error(e.message || "Failed to save form");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(target) {
    confirm({
      title: "Archive form?",
      message: (
        <>
          <strong className="text-[var(--fg-primary)]">{target.name}</strong> will no
          longer be available and its pending links will stop working. Existing
          responses are kept.
        </>
      ),
      confirmText: "Archive Form",
      onConfirm: async () => {
        try {
          await formsApi.remove(target.id);
          toast.success("Form archived");
          if (String(target.id) === String(selectedId)) closeWorkspace();
          else loadForms();
        } catch (e) {
          toast.error(e.message || "Failed to archive form");
        }
      },
    });
  }

  async function openFullPreview() {
    if (isDirty) {
      const ok = await handleSave({ silent: true });
      if (!ok) return;
      toast.info("Saved — opening full preview");
    }
    window.open(`/forms/preview/${form.id}`, "_blank", "noopener");
  }

  // ── Invites ──
  const userSuggestions = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter(
        (u) =>
          (u.email || "").toLowerCase().includes(q) ||
          (u.full_name || "").toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [userQuery, allUsers]);

  const fillLink = (token) => `${window.location.origin}/f/${token}`;

  async function copyLink(token) {
    try {
      await navigator.clipboard.writeText(fillLink(token));
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy — copy it manually");
    }
  }

  async function refreshInvites() {
    const detail = await formsApi.get(form.id);
    setInvites(detail.invites || []);
  }

  async function handleCreateInvite() {
    if (!recipientEmail.trim()) {
      toast.error("Enter the recipient's email address");
      return;
    }
    if (countInputFields(draft.fields_schema) === 0) {
      toast.error("Add at least one question before sending");
      switchTab("build");
      return;
    }
    if (isDirty) {
      const ok = await handleSave({ silent: true });
      if (!ok) return;
    }
    setCreatingInvite(true);
    try {
      const invite = await formsApi.createInvite(form.id, {
        email: recipientEmail.trim(),
        name: recipientName.trim() || undefined,
      });
      setNewLink(invite);
      setRecipientEmail("");
      setRecipientName("");
      setUserQuery("");
      await refreshInvites();
      toast.success(`Form link created for ${invite.recipient_email}`);
    } catch (e) {
      toast.error(e.message || "Failed to create link");
    } finally {
      setCreatingInvite(false);
    }
  }

  function handleRevoke(invite) {
    confirm({
      title: "Revoke link?",
      message: (
        <>
          The link sent to{" "}
          <strong className="text-[var(--fg-primary)]">{invite.recipient_email}</strong>{" "}
          will stop working immediately.
        </>
      ),
      confirmText: "Revoke",
      onConfirm: async () => {
        try {
          await formsApi.revokeInvite(invite.id);
          toast.success("Link revoked");
          await refreshInvites();
        } catch (e) {
          toast.error(e.message || "Failed to revoke");
        }
      },
    });
  }

  // ── Results aggregation ──
  const stats = useMemo(() => {
    const active = invites.filter((i) => i.status !== "revoked");
    const completed = invites.filter((i) => i.status === "completed");
    const durations = completed
      .map((i) => new Date(i.submitted_at) - new Date(i.created_at))
      .filter((ms) => Number.isFinite(ms) && ms > 0);
    return {
      sent: active.length,
      completed: completed.length,
      pending: active.length - completed.length,
      rate: active.length ? Math.round((completed.length / active.length) * 100) : 0,
      avgTime: durations.length
        ? humanDuration(durations.reduce((a, b) => a + b, 0) / durations.length)
        : "—",
      lastAt: completed.length
        ? completed.reduce((m, i) => (i.submitted_at > m ? i.submitted_at : m), completed[0].submitted_at)
        : null,
    };
  }, [invites]);

  const questionBreakdowns = useMemo(() => {
    if (!form) return [];
    const schema = form.fields_schema || [];
    return schema
      .filter((f) => INPUT_TYPES.has(f.type))
      .map((f) => {
        const answers = submissions
          .map((s) => s.response_data?.[f.id])
          .filter((v) => !isEmptyValue(v));
        if (CHOICE_TYPES.has(f.type)) {
          const opts = fieldOptions(f);
          const counts = Object.fromEntries(opts.map((o) => [o.value, 0]));
          answers.forEach((v) =>
            (Array.isArray(v) ? v : [v]).forEach((val) => {
              if (counts[val] !== undefined) counts[val] += 1;
            })
          );
          const max = Math.max(1, ...Object.values(counts));
          return {
            field: f,
            kind: "choice",
            answered: answers.length,
            options: opts.map((o) => ({ ...o, count: counts[o.value], pct: counts[o.value] / max })),
          };
        }
        return {
          field: f,
          kind: "text",
          answered: answers.length,
          recent: answers.slice(0, 4).map((v) =>
            typeof v === "object" ? JSON.stringify(v) : String(v)
          ),
        };
      });
  }, [form, submissions]);

  const filtered = forms.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // ════════════════════════════════════════════════════════════════
  // WORKSPACE VIEW
  // ════════════════════════════════════════════════════════════════
  if (selectedId) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Workspace header */}
        <div className="relative overflow-hidden rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-5 py-4 sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-40" />
          <div className="relative flex flex-wrap items-center gap-3">
            <button
              onClick={closeWorkspace}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-all"
            >
              <Icon name="arrowLeft" size={15} />
              All forms
            </button>
            <span className="hidden sm:flex shrink-0 h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/15 shadow-[0_2px_12px_rgba(230,0,0,0.12)]">
              <Icon name="fileText" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-semibold text-[var(--fg-primary)] tracking-tight truncate leading-tight">
                {loadingForm ? "Loading…" : draft.name || form?.name}
              </h1>
              <p className="mt-0.5 text-xs text-[var(--fg-muted)] flex flex-wrap items-center gap-x-1.5">
                <span className="tabular-nums">{countInputFields(draft.fields_schema)} questions</span>
                <span className="text-[var(--fg-subtle)]">·</span>
                <span className="tabular-nums">{stats.sent} sent</span>
                <span className="text-[var(--fg-subtle)]">·</span>
                <span className="tabular-nums">{stats.completed} completed</span>
                {isDirty && (
                  <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium text-[10px]">
                    <span className="w-1 h-1 rounded-full bg-amber-500" />
                    Unsaved changes
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === "build" && (
                <Button onClick={() => handleSave()} loading={saving} disabled={!isDirty} icon={<Icon name="check" size={15} />}>
                  Save
                </Button>
              )}
              {activeTab === "preview" && (
                <>
                  <Button variant="secondary" onClick={openFullPreview} icon={<Icon name="externalLink" size={14} />}>
                    Open full preview
                  </Button>
                  <Button onClick={() => switchTab("send")} icon={<Icon name="send" size={14} />}>
                    Looks good — Send
                  </Button>
                </>
              )}
              {activeTab === "send" && (
                <Button variant="secondary" onClick={() => switchTab("results")} icon={<Icon name="barChart" size={14} />}>
                  View results
                </Button>
              )}
              {activeTab === "results" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoadingSubs(true);
                    Promise.all([formsApi.submissions(selectedId), refreshInvites()])
                      .then(([d]) => setSubmissions(d.submissions || []))
                      .finally(() => setLoadingSubs(false));
                  }}
                  icon={<Icon name="refresh" size={14} />}
                >
                  Refresh
                </Button>
              )}
            </div>
          </div>

          {/* Pipeline tabs */}
          <div className="relative mt-4 inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] overflow-x-auto max-w-full scrollbar-none">
            {WORKSPACE_TABS.map((t, i) => (
              <div key={t.key} className="flex items-center">
                <button
                  onClick={() => switchTab(t.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 whitespace-nowrap",
                    activeTab === t.key
                      ? "bg-[var(--accent)] text-white shadow-[0_2px_8px_rgba(230,0,0,0.25)]"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-elevated)]"
                  )}
                >
                  <span
                    className={cn(
                      "w-[18px] h-[18px] min-w-[18px] min-h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center transition-colors",
                      activeTab === t.key
                        ? "bg-white/20 text-white"
                        : "bg-[var(--bg-base)] text-[var(--fg-muted)]"
                    )}
                  >
                    {t.step}
                  </span>
                  {t.label}
                </button>
                {i < WORKSPACE_TABS.length - 1 && (
                  <Icon name="chevronRight" size={12} className="text-[var(--fg-subtle)] mx-0.5 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {loadingForm ? (
          <div className="space-y-5">
            <Skeleton className="h-32" rounded="rounded-2xl" />
            <Skeleton className="h-[460px]" rounded="rounded-2xl" />
          </div>
        ) : (
          <>
            {/* ── BUILD ── */}
            {activeTab === "build" && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                    <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                      <Icon name="fileText" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                      Form details
                    </h2>
                  </div>
                  <div className="p-5">
                    <div className="grid lg:grid-cols-2 gap-4">
                      <Input
                        label="Form name"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        required
                      />
                      <Textarea
                        label="Description (shown to the customer)"
                        rows={2}
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up" style={{ animationDelay: "80ms" }}>
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                    <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
                      <Icon name="list" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                      Questions
                    </h2>
                    <Badge tone="slate" size="sm">{countInputFields(draft.fields_schema)}</Badge>
                  </div>
                  <div className="p-4">
                    <div className="h-[calc(100vh-440px)] min-h-[460px] flex flex-col">
                      <TemplateFormBuilder
                        schema={draft.fields_schema}
                        onChange={(schema) => setDraft({ ...draft, fields_schema: schema })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── PREVIEW (in-page, fully scrollable) ── */}
            {activeTab === "preview" && (
              <div data-theme="light" className="rounded-2xl bg-[#F4F5F7] border border-black/[0.06] px-4 sm:px-8 py-8">
                <div className="max-w-[760px] mx-auto">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111318] text-amber-300 text-[11px] font-semibold uppercase tracking-wider">
                      <Icon name="eye" size={12} /> Customer view
                    </span>
                    <span className="text-[11px] text-black/40">
                      Interactive — try it exactly as your recipient will
                    </span>
                  </div>

                  {/* Header card */}
                  <div className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_16px_44px_rgba(20,3,5,0.08)] overflow-hidden mb-5">
                    <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #E60000, #ff4d4d)" }} />
                    <div className="p-6 sm:p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-xl font-semibold tracking-tight text-[#111318] leading-snug">
                            {draft.name || "Untitled form"}
                          </h2>
                          {draft.description && (
                            <p className="mt-2 text-sm text-black/55 leading-relaxed">{draft.description}</p>
                          )}
                        </div>
                        <VodafoneLogo size={40} className="shrink-0" />
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_16px_44px_rgba(20,3,5,0.08)] p-5 sm:p-7">
                    {countInputFields(draft.fields_schema) === 0 ? (
                      <div className="text-center py-12">
                        <Icon name="list" size={28} className="text-black/25 mx-auto mb-3" />
                        <p className="text-sm font-medium text-[#111318] mb-1">No questions yet</p>
                        <p className="text-xs text-black/45 mb-4">Add questions in the Build step to see them here</p>
                        <Button size="sm" variant="secondary" onClick={() => switchTab("build")}>
                          Go to Build
                        </Button>
                      </div>
                    ) : (
                      <TemplateRenderer
                        schema={draft.fields_schema}
                        values={previewValues}
                        onChange={(fieldId, value) =>
                          setPreviewValues((p) => ({ ...p, [fieldId]: value }))
                        }
                      />
                    )}
                  </div>

                  {countInputFields(draft.fields_schema) > 0 && (
                    <div className="mt-5 flex items-center justify-between">
                      <button
                        onClick={() => setPreviewValues(initialValues(draft.fields_schema))}
                        className="text-[12px] font-medium text-black/45 hover:text-black/70 transition-colors"
                      >
                        Reset answers
                      </button>
                      <span title="Submissions are disabled in preview">
                        <Button size="lg" disabled icon={<Icon name="send" size={15} />}>
                          Submit response
                        </Button>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SEND ── */}
            {activeTab === "send" && (
              <div className="grid lg:grid-cols-5 gap-5 items-start">
                {/* New recipient */}
                <div className="lg:col-span-2 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up">
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                    <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                      <Icon name="userPlus" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                      New recipient
                    </h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="relative">
                      <Input
                        label="Email address"
                        placeholder="customer@company.com"
                        value={recipientEmail}
                        onChange={(e) => {
                          setRecipientEmail(e.target.value);
                          setUserQuery(e.target.value);
                        }}
                        icon="mail"
                        helperText="Works for anyone — existing users are linked automatically"
                      />
                      {userSuggestions.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-elevated)] overflow-hidden animate-slide-down">
                          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--fg-muted)] border-b border-[var(--border-default)]">
                            Existing users
                          </p>
                          {userSuggestions.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setRecipientEmail(u.email);
                                setRecipientName(u.full_name || "");
                                setUserQuery("");
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--bg-surface)] transition-colors"
                            >
                              <span className="h-6 w-6 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold flex items-center justify-center">
                                {(u.full_name || u.email)[0].toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] text-[var(--fg-primary)] truncate">
                                  {u.full_name || u.email}
                                </span>
                                <span className="block text-[11px] text-[var(--fg-muted)] truncate">{u.email}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input
                      label="Name (optional)"
                      placeholder="Recipient name"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      icon="user"
                    />
                    <Button
                      className="w-full"
                      onClick={handleCreateInvite}
                      loading={creatingInvite}
                      icon={<Icon name="link" size={14} />}
                    >
                      Create one-time link
                    </Button>

                    {newLink && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/25 animate-fade-in">
                        <Icon name="checkCircle" size={15} className="text-emerald-400 shrink-0" />
                        <code className="flex-1 text-[11px] text-[var(--fg-secondary)] truncate">
                          {fillLink(newLink.token)}
                        </code>
                        <Button size="xs" variant="secondary" onClick={() => copyLink(newLink.token)} icon={<Icon name="copy" size={12} />}>
                          Copy
                        </Button>
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <Icon name="info" size={14} className="text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[12px] text-[var(--fg-secondary)] leading-relaxed">
                        Copy the link into an email to the customer. Each link works{" "}
                        <strong className="text-[var(--fg-primary)]">once</strong> — after they
                        submit, it locks and the response lands in Results.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sent links */}
                <div className="lg:col-span-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "80ms" }}>
                  <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                    <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Icon name="send" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                      Sent links
                    </h2>
                    <Badge tone="slate" size="sm">{invites.length}</Badge>
                  </div>
                  {invites.length === 0 ? (
                    <EmptyState
                      icon="send"
                      title="Nothing sent yet"
                      description="Create a one-time link on the left to share this form with a recipient."
                      compact
                    />
                  ) : (
                    <div className="divide-y divide-[var(--border-default)] max-h-[520px] overflow-y-auto">
                      {invites.map((inv) => {
                        const st = INVITE_STATUS[inv.status] || INVITE_STATUS.pending;
                        return (
                          <div key={inv.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--bg-surface)] transition-colors">
                            <span className="h-9 w-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[11px] font-bold text-[var(--fg-secondary)] shrink-0">
                              {(inv.recipient_name || inv.recipient_email)[0].toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-[var(--fg-primary)] truncate">
                                {inv.recipient_name || inv.recipient_email}
                                {inv.recipient_user_id && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                                    Existing user
                                  </span>
                                )}
                                {inv.ticket_number && (
                                  <a
                                    href={`/tickets/${inv.ticket_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--accent)]/10 text-[var(--accent)] hover:underline"
                                    title="Open linked ticket"
                                  >
                                    {inv.ticket_number}
                                  </a>
                                )}
                              </p>
                              <p className="text-[11px] text-[var(--fg-muted)] truncate">
                                {inv.recipient_email} ·{" "}
                                {inv.status === "completed"
                                  ? `submitted ${fmtDateTime(inv.submitted_at)}`
                                  : `created ${fmtDateTime(inv.created_at)}`}
                              </p>
                            </div>
                            <Badge tone={st.tone} size="sm" dot={inv.status === "pending"}>
                              {st.label}
                            </Badge>
                            {inv.status === "pending" && (
                              <>
                                <button
                                  onClick={() => copyLink(inv.token)}
                                  title="Copy link"
                                  className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all"
                                >
                                  <Icon name="copy" size={14} />
                                </button>
                                <button
                                  onClick={() => handleRevoke(inv)}
                                  title="Revoke link"
                                  className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── RESULTS ── */}
            {activeTab === "results" && (
              <div className="space-y-5">
                {/* KPI rail */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Links sent", value: stats.sent, icon: "send", iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15" },
                    { label: "Completed", value: stats.completed, icon: "checkCircle", iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15" },
                    { label: "Completion rate", value: `${stats.rate}%`, icon: "trendingUp", iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15" },
                    { label: "Avg time to complete", value: stats.avgTime, icon: "clock", iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15" },
                  ].map((k, i) => (
                    <div
                      key={k.label}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl p-5",
                        "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                        "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                        "animate-kpi-rise"
                      )}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-label">{k.label}</span>
                        <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110", k.iconCls)}>
                          <Icon name={k.icon} size={16} />
                        </span>
                      </div>
                      <p className="text-[28px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
                        {k.value}
                      </p>
                    </div>
                  ))}
                </div>

                {loadingSubs ? (
                  <div className="grid lg:grid-cols-3 gap-5 items-start">
                    <Skeleton className="lg:col-span-2 h-64" rounded="rounded-2xl" />
                    <Skeleton className="h-64" rounded="rounded-2xl" />
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
                    <EmptyState
                      icon="barChart"
                      title="No responses yet"
                      description="Results appear here the moment a recipient submits the form."
                      action={
                        <Button size="sm" variant="secondary" onClick={() => switchTab("send")} icon={<Icon name="send" size={13} />}>
                          Send the form
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="grid lg:grid-cols-3 gap-5 items-start">
                    {/* Question breakdowns */}
                    <div className="lg:col-span-2 space-y-4">
                      {questionBreakdowns.map((q, qi) => (
                        <div
                          key={q.field.id}
                          className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5 animate-fade-up"
                          style={{ animationDelay: `${qi * 60}ms` }}
                        >
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <p className="text-sm font-semibold text-[var(--fg-primary)] leading-snug">
                              {q.field.label}
                            </p>
                            <Badge tone="slate" size="sm">
                              {q.answered}/{submissions.length} answered
                            </Badge>
                          </div>

                          {q.kind === "choice" ? (
                            <div className="space-y-2.5">
                              {q.options.map((o) => (
                                <div key={o.value} className="flex items-center gap-3">
                                  <span className="w-40 shrink-0 text-[12px] text-[var(--fg-secondary)] truncate" title={o.label}>
                                    {o.label}
                                  </span>
                                  <div className="flex-1 h-5 rounded-md bg-[var(--bg-surface)] overflow-hidden">
                                    <div
                                      className="h-full rounded-md transition-all duration-700 ease-out"
                                      style={{
                                        width: `${Math.max(o.count > 0 ? 8 : 0, o.pct * 100)}%`,
                                        background: "linear-gradient(90deg, var(--accent), #ff4d4d)",
                                      }}
                                    />
                                  </div>
                                  <span className="w-8 text-right text-[12px] font-semibold text-[var(--fg-primary)] tabular-nums">
                                    {o.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : q.recent.length > 0 ? (
                            <div className="space-y-2">
                              {q.recent.map((ans, i) => (
                                <p
                                  key={i}
                                  className="text-[13px] text-[var(--fg-secondary)] px-3 py-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] line-clamp-2"
                                >
                                  “{ans}”
                                </p>
                              ))}
                              {q.answered > q.recent.length && (
                                <p className="text-[11px] text-[var(--fg-muted)]">
                                  +{q.answered - q.recent.length} more in individual responses
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[12px] text-[var(--fg-muted)]">No answers yet</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Individual responses */}
                    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "120ms" }}>
                      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                        <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                          <Icon name="inbox" size={16} />
                        </span>
                        <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                          Responses
                        </h2>
                        <Badge tone="emerald" size="sm">{submissions.length}</Badge>
                      </div>
                      <div className="divide-y divide-[var(--border-default)] max-h-[560px] overflow-y-auto">
                        {submissions.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => setViewingSub(sub)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-surface)] transition-colors group"
                          >
                            <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                              {(sub.recipient_name || sub.recipient_email)[0].toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-[var(--fg-primary)] truncate">
                                {sub.recipient_name || sub.recipient_email}
                                {sub.ticket_number && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-mono bg-[var(--accent)]/10 text-[var(--accent)]">
                                    {sub.ticket_number}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[11px] text-[var(--fg-muted)]">
                                {fmtDateTime(sub.submitted_at)}
                              </span>
                            </span>
                            <Icon name="chevronRight" size={14} className="text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Individual response viewer */}
        <Modal
          open={!!viewingSub}
          onClose={() => setViewingSub(null)}
          title={`Response — ${viewingSub?.recipient_name || viewingSub?.recipient_email || ""}`}
          subtitle={viewingSub && `Submitted ${fmtDateTime(viewingSub.submitted_at)}`}
          size="lg"
          actions={<Button variant="secondary" onClick={() => setViewingSub(null)}>Close</Button>}
        >
          {viewingSub && (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4">
              <TemplateRenderer
                schema={form?.fields_schema || []}
                values={viewingSub.response_data || {}}
                readOnly
              />
            </div>
          )}
        </Modal>

        {confirmDialog}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <PageHeader
        icon="send"
        title="Customer Forms"
        subtitle="Build, preview, send one-time links and track results — all in one place"
        actions={
          <Button onClick={() => setShowCreate(true)} icon={<Icon name="plus" size={16} />}>
            New Form
          </Button>
        }
      />

      {/* Search toolbar */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search forms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm",
                "bg-[var(--bg-base)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                "transition-all duration-200"
              )}
            />
          </div>
          <Badge tone="slate" size="md">{filtered.length} {filtered.length === 1 ? "form" : "forms"}</Badge>
        </div>
      </div>

      {/* Forms grid */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64" rounded="rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="send"
            title={search ? "No forms found" : "No customer forms yet"}
            description={
              search
                ? "Try a different search term, or clear the search to see all forms."
                : "Create your first form and send it to a customer in minutes."
            }
            action={
              !search && (
                <Button onClick={() => setShowCreate(true)} icon={<Icon name="plus" size={16} />}>
                  Create a form
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 stagger">
          {filtered.map((f, idx) => {
            const tint = formTints[idx % formTints.length];
            const tintIcon = {
              violet: "bg-violet-500/10 text-violet-500",
              blue: "bg-blue-500/10 text-blue-500",
              cyan: "bg-cyan-500/10 text-cyan-500",
              teal: "bg-teal-500/10 text-teal-500",
              indigo: "bg-indigo-500/10 text-indigo-500",
              emerald: "bg-emerald-500/10 text-emerald-500",
            }[tint];
            const questionCount = countInputFields(f.fields_schema);
            const completion = f.invite_count > 0
              ? Math.round((f.completed_count / f.invite_count) * 100)
              : null;
            return (
              <div
                key={f.id}
                onClick={() => openWorkspace(f.id, "build")}
                className={cn(
                  "group relative flex flex-col rounded-2xl p-5 cursor-pointer",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                  "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]",
                  "hover:border-[var(--border-hover)] hover:-translate-y-0.5",
                  "transition-all duration-200"
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110", tintIcon)}>
                    <Icon name="fileText" size={20} />
                  </div>
                  <div className="flex items-center gap-2">
                    {questionCount > 0 ? (
                      <Badge tone="emerald" size="sm" dot>Ready</Badge>
                    ) : (
                      <Badge tone="slate" size="sm">Draft</Badge>
                    )}
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => window.open(`/forms/preview/${f.id}`, "_blank", "noopener")}
                        title="Open full preview"
                        className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all"
                      >
                        <Icon name="externalLink" size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(f)}
                        title="Archive form"
                        className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                      >
                        <Icon name="archive" size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] leading-snug mb-1.5 group-hover:text-[var(--accent)] transition-colors">
                  {f.name}
                </h3>
                <p className="text-[13px] text-[var(--fg-secondary)] line-clamp-2 mb-4 min-h-[36px]">
                  {f.description || "No description"}
                </p>

                <div className="flex items-center gap-4 text-xs text-[var(--fg-muted)] mb-4">
                  <span className="flex items-center gap-1.5">
                    <Icon name="list" size={12} />
                    {questionCount} questions
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="send" size={12} />
                    {f.invite_count || 0} sent
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <Icon name="checkCircle" size={12} />
                    {f.completed_count || 0}
                  </span>
                </div>

                {/* Completion bar */}
                {completion !== null && (
                  <div className="mb-4">
                    <div className="h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(completion, completion > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-[var(--fg-muted)] tabular-nums">{completion}% completion</p>
                  </div>
                )}

                <div
                  className="mt-auto pt-4 border-t border-[var(--border-default)] grid grid-cols-3 gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="sm" variant="secondary" onClick={() => openWorkspace(f.id, "preview")} icon={<Icon name="eye" size={13} />}>
                    Preview
                  </Button>
                  <Button size="sm" onClick={() => openWorkspace(f.id, "send")} icon={<Icon name="send" size={13} />}>
                    Send
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openWorkspace(f.id, "results")} icon={<Icon name="barChart" size={13} />}>
                    Results
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal — quick details, then straight into the workspace */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Customer Form"
        subtitle="Name it now — you'll add questions in the builder next"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={creating} icon={<Icon name="arrowRight" size={14} />}>
              Create & open builder
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Form name"
            placeholder="e.g. Network Readiness Assessment"
            value={createDraft.name}
            onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
            required
            autoFocus
          />
          <Textarea
            label="Description (shown to the customer)"
            placeholder="A short intro the recipient sees at the top of the form"
            rows={3}
            value={createDraft.description}
            onChange={(e) => setCreateDraft({ ...createDraft, description: e.target.value })}
          />
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
