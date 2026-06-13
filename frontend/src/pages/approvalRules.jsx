/**
 * Approval Rules Management Page — Vodafone Service Desk
 *
 * Admin page to configure when approvals are required. Premium, branded
 * presentation: a PageHeader, KPI summary, elevated rule cards with clear
 * condition / approver chips, and a grouped rule-builder modal. Supports
 * dynamic approver types: specific_user, manager_chain, department_head,
 * team_lead.
 *
 * This is a visual / layout redesign only — every piece of state, effect,
 * event handler, API call, and feature is preserved exactly.
 */

import { useState, useEffect, useRef } from "react";
import { approvalsApi } from "../services/api";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import Modal from "../components/ui/Modal";
import Input, { Textarea, Select } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Per-rule accent tints — full static class strings (no dynamic Tailwind).
const RULE_TINTS = [
  { tile: "bg-violet-500/10 text-violet-500 border-violet-500/15", glow: "bg-violet-500" },
  { tile: "bg-blue-500/10 text-blue-500 border-blue-500/15", glow: "bg-blue-500" },
  { tile: "bg-cyan-500/10 text-cyan-500 border-cyan-500/15", glow: "bg-cyan-500" },
  { tile: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", glow: "bg-emerald-500" },
  { tile: "bg-indigo-500/10 text-indigo-500 border-indigo-500/15", glow: "bg-indigo-500" },
  { tile: "bg-amber-500/10 text-amber-500 border-amber-500/15", glow: "bg-amber-500" },
];

// Static tint class strings for approver chips / avatars (no dynamic Tailwind).
const APPROVER_TONE = {
  specific_user: {
    chip: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    avatar: "bg-violet-500/10 text-violet-500",
    pill: "bg-violet-500/10 text-violet-500",
  },
  manager_chain: {
    chip: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    avatar: "bg-amber-500/10 text-amber-500",
    pill: "bg-amber-500/10 text-amber-500",
  },
  department_head: {
    chip: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    avatar: "bg-cyan-500/10 text-cyan-500",
    pill: "bg-cyan-500/10 text-cyan-500",
  },
  team_lead: {
    chip: "bg-teal-500/10 text-teal-500 border-teal-500/20",
    avatar: "bg-teal-500/10 text-teal-500",
    pill: "bg-teal-500/10 text-teal-500",
  },
};

// Approver type definitions
const APPROVER_TYPES = [
  { value: "specific_user", label: "Specific User", icon: "users", description: "Select a specific person to approve" },
  { value: "manager_chain", label: "Requester's Manager", icon: "userPlus", description: "Auto-resolve from user hierarchy" },
  { value: "department_head", label: "Department Head", icon: "building", description: "Head of the requester's department" },
  { value: "team_lead", label: "Team Manager", icon: "teams", description: "Manager of the ticket's assigned team" },
];

function getApproverTypeLabel(type) {
  return APPROVER_TYPES.find((t) => t.value === type)?.label || "Specific User";
}

function getApproverTypeIcon(type) {
  return APPROVER_TYPES.find((t) => t.value === type)?.icon || "users";
}

const EMPTY_FORM = {
  name: "",
  description: "",
  applies_to_priority_key: "",
  applies_to_type_key: "",
  applies_to_team_id: "",
  applies_to_department_id: "",
  min_estimated_cost: "",
  approval_levels: 1,
  auto_approve_after_hours: "",
  priority_order: 0,
  is_active: true,
  after_approval_agent_id: "",
  after_approval_team_id: "",
  default_approvers: [],
  notes_template: "",
  require_all_approvers: false,
};

// Shared label for the modal's small section sub-fields.
const fieldLabelCls = "block text-sm font-medium text-[var(--fg-primary)] mb-2";

/** A grouped section inside the rule-builder modal. */
function FormSection({ icon, tint, title, description, badge, children }) {
  return (
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/40">
        <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center border", tint)}>
          <Icon name={icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h4>
          {description && (
            <p className="text-[11px] text-[var(--fg-muted)] mt-0.5 leading-snug">{description}</p>
          )}
        </div>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function ApprovalRules() {
  const { meta } = useMeta();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Approver search (for specific_user type)
  const [approvers, setApprovers] = useState([]);
  const [approverSearch, setApproverSearch] = useState("");
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const approverRef = useRef(null);

  // Add approver type selector
  const [addApproverType, setAddApproverType] = useState("specific_user");
  const [managerLevel, setManagerLevel] = useState(1);

  const teams = meta?.teams || [];
  const priorities = meta?.priorities || [];
  const types = meta?.types || [];
  const agents = meta?.agents || [];
  const departments = meta?.departments || [];

  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadRules();
    loadApprovers();
  }, []);

  // Close approver dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (approverRef.current && !approverRef.current.contains(e.target)) {
        setShowApproverDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadRules() {
    try {
      setLoading(true);
      const data = await approvalsApi.getRules();
      setRules(data.rules || []);
    } catch (error) {
      console.error("Failed to load rules:", error);
      toast.error(error.message || "Failed to load approval rules");
    } finally {
      setLoading(false);
    }
  }

  async function loadApprovers() {
    try {
      const data = await approvalsApi.getApprovers();
      setApprovers(data.approvers || []);
    } catch (error) {
      console.error("Failed to load approvers:", error);
    }
  }

  function openCreateModal() {
    setEditingRule(null);
    setForm({ ...EMPTY_FORM, default_approvers: [] });
    setApproverSearch("");
    setAddApproverType("specific_user");
    setManagerLevel(1);
    setShowModal(true);
  }

  function openEditModal(rule) {
    setEditingRule(rule);
    setForm({
      name: rule.name || "",
      description: rule.description || "",
      applies_to_priority_key: rule.applies_to_priority_key || "",
      applies_to_type_key: rule.applies_to_type_key || "",
      applies_to_team_id: rule.applies_to_team_id ? String(rule.applies_to_team_id) : "",
      applies_to_department_id: rule.applies_to_department_id ? String(rule.applies_to_department_id) : "",
      min_estimated_cost: rule.min_estimated_cost || "",
      approval_levels: rule.approval_levels || 1,
      auto_approve_after_hours: rule.auto_approve_after_hours || "",
      priority_order: rule.priority_order || 0,
      is_active: rule.is_active === 1 || rule.is_active === true,
      after_approval_agent_id: rule.after_approval_agent_id ? String(rule.after_approval_agent_id) : "",
      after_approval_team_id: rule.after_approval_team_id ? String(rule.after_approval_team_id) : "",
      default_approvers: Array.isArray(rule.default_approvers) ? rule.default_approvers : [],
      notes_template: rule.notes_template || "",
      require_all_approvers: rule.require_all_approvers === 1 || rule.require_all_approvers === true,
    });
    setApproverSearch("");
    setAddApproverType("specific_user");
    setManagerLevel(1);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        applies_to_priority_key: form.applies_to_priority_key || null,
        applies_to_type_key: form.applies_to_type_key || null,
        applies_to_team_id: form.applies_to_team_id ? Number(form.applies_to_team_id) : null,
        applies_to_department_id: form.applies_to_department_id ? Number(form.applies_to_department_id) : null,
        min_estimated_cost: form.min_estimated_cost ? Number(form.min_estimated_cost) : null,
        auto_approve_after_hours: form.auto_approve_after_hours ? Number(form.auto_approve_after_hours) : null,
        is_active: form.is_active ? 1 : 0,
        after_approval_agent_id: form.after_approval_agent_id ? Number(form.after_approval_agent_id) : null,
        after_approval_team_id: form.after_approval_team_id ? Number(form.after_approval_team_id) : null,
        default_approvers: form.default_approvers.length > 0 ? form.default_approvers : null,
        notes_template: form.notes_template.trim() || null,
        require_all_approvers: form.require_all_approvers ? 1 : 0,
      };

      if (editingRule) {
        await approvalsApi.updateRule(editingRule.id, payload);
      } else {
        await approvalsApi.createRule(payload);
      }
      setShowModal(false);
      toast.success(editingRule ? "Rule updated" : "Rule created");
      loadRules();
    } catch (error) {
      toast.error(error.message || "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(rule) {
    confirm({
      title: "Delete approval rule?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{rule.name}</strong>.
          Tickets currently pending approval under this rule are not affected,
          but new tickets will no longer match it.
        </>
      ),
      confirmText: "Delete Rule",
      onConfirm: async () => {
        try {
          await approvalsApi.deleteRule(rule.id);
          toast.success("Rule deleted");
          loadRules();
        } catch (error) {
          toast.error(error.message || "Failed to delete rule");
        }
      },
    });
  }

  async function toggleActive(rule) {
    try {
      await approvalsApi.updateRule(rule.id, { is_active: rule.is_active ? 0 : 1 });
      toast.success(rule.is_active ? "Rule disabled" : "Rule enabled");
      loadRules();
    } catch (error) {
      toast.error(error.message || "Failed to update rule");
    }
  }

  // ── Approver helpers ──
  function addSpecificUser(user) {
    const already = form.default_approvers.find((a) => a.type === "specific_user" && a.user_id === user.id);
    if (already) return;
    const maxLevel = form.default_approvers.reduce((m, a) => Math.max(m, a.approval_level || a.level || 1), 0);
    setForm({
      ...form,
      default_approvers: [
        ...form.default_approvers,
        {
          type: "specific_user",
          user_id: user.id,
          full_name: user.full_name,
          email: user.email,
          approval_level: maxLevel || 1,
        },
      ],
    });
    setApproverSearch("");
    setShowApproverDropdown(false);
  }

  function addDynamicApprover(type) {
    // Prevent duplicate dynamic types (except manager_chain with different levels)
    if (type === "department_head" || type === "team_lead") {
      const existing = form.default_approvers.find((a) => a.type === type);
      if (existing) return;
    }
    if (type === "manager_chain") {
      const existing = form.default_approvers.find((a) => a.type === "manager_chain" && a.manager_level === managerLevel);
      if (existing) return;
    }

    const maxLevel = form.default_approvers.reduce((m, a) => Math.max(m, a.approval_level || a.level || 1), 0);
    const entry = { type, approval_level: maxLevel || 1 };

    if (type === "manager_chain") {
      entry.manager_level = managerLevel;
    }

    setForm({
      ...form,
      default_approvers: [...form.default_approvers, entry],
    });
  }

  function removeApproverEntry(idx) {
    setForm({
      ...form,
      default_approvers: form.default_approvers.filter((_, i) => i !== idx),
    });
  }

  function setEntryLevel(idx, level) {
    setForm({
      ...form,
      default_approvers: form.default_approvers.map((a, i) =>
        i === idx ? { ...a, approval_level: Math.max(1, parseInt(level) || 1) } : a
      ),
    });
  }

  function moveApprover(idx, dir) {
    const arr = [...form.default_approvers];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setForm({ ...form, default_approvers: arr });
  }

  const filteredApprovers = approverSearch.trim()
    ? approvers.filter(
        (u) =>
          !form.default_approvers.find((a) => a.type === "specific_user" && a.user_id === u.id) &&
          ((u.full_name || "").toLowerCase().includes(approverSearch.toLowerCase()) ||
            (u.email || "").toLowerCase().includes(approverSearch.toLowerCase()))
      )
    : [];

  // ── Resolve display for rule cards ──
  function getApproverDisplayName(entry) {
    const type = entry.type || "specific_user";
    switch (type) {
      case "specific_user": {
        const found = approvers.find((u) => u.id === entry.user_id);
        return found?.full_name || entry.full_name || `User #${entry.user_id}`;
      }
      case "manager_chain":
        return `Manager (Level ${entry.manager_level || 1})`;
      case "department_head":
        return "Department Head";
      case "team_lead":
        return "Team Manager";
      default:
        return entry.full_name || "Unknown";
    }
  }

  function getApproverBadgeTone(type) {
    switch (type) {
      case "manager_chain": return "amber";
      case "department_head": return "cyan";
      case "team_lead": return "teal";
      default: return "violet";
    }
  }

  // Resolve department name for cards
  function getDeptName(deptId) {
    if (!deptId) return null;
    return departments.find((d) => d.id === deptId)?.name || `Dept #${deptId}`;
  }

  // ── Derived summary metrics (display only) ──
  const activeCount = rules.filter((r) => r.is_active).length;
  const inactiveCount = rules.length - activeCount;
  const dynamicCount = rules.filter((r) =>
    Array.isArray(r.default_approvers) &&
    r.default_approvers.some((a) => a.type && a.type !== "specific_user")
  ).length;

  const summaryStats = [
    {
      label: "Total rules",
      value: rules.length,
      icon: "settings",
      iconCls: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15",
    },
    {
      label: "Active",
      value: activeCount,
      icon: "checkCircle",
      iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
    },
    {
      label: "Disabled",
      value: inactiveCount,
      icon: "close",
      iconCls: "bg-slate-500/10 text-slate-400 border-slate-500/15",
    },
    {
      label: "Use dynamic approvers",
      value: dynamicCount,
      icon: "userPlus",
      iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="shield"
        title="Approval Rules"
        subtitle="Configure when tickets require manager approval and who signs off"
        actions={
          <>
            <button
              onClick={() => loadRules()}
              title="Refresh"
              className={cn(
                "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
              )}
            >
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </button>
            <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
              Create Rule
            </Button>
          </>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              "relative overflow-hidden rounded-2xl p-5",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
              "animate-kpi-rise"
            )}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-label">{stat.label}</span>
              <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border", stat.iconCls)}>
                <Icon name={stat.icon} size={16} />
              </span>
            </div>
            <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Info Card */}
      <div
        className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4 animate-fade-up"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/15 flex items-center justify-center shrink-0">
            <Icon name="info" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--fg-primary)]">How approval rules work</p>
            <p className="text-xs text-[var(--fg-secondary)] mt-1 leading-relaxed">
              When a ticket matches the conditions of an approval rule, it is routed through the configured approvers.
              You can use dynamic approver types like "Requester's Manager" (auto-resolved from hierarchy),
              "Department Head", or "Team Manager" alongside specific users. Add department conditions to route
              tickets from specific departments to different approvers.
            </p>
          </div>
        </div>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10" rounded="rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" rounded="rounded-md" />
                  <Skeleton className="h-3 w-56" rounded="rounded-md" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20" rounded="rounded-full" />
                <Skeleton className="h-5 w-24" rounded="rounded-full" />
                <Skeleton className="h-5 w-16" rounded="rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[var(--border-default)]">
                {[0, 1, 2].map((c) => (
                  <Skeleton key={c} className="h-8 w-full" rounded="rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="shield"
            title="No approval rules"
            description="Create rules to define when tickets require manager approval and who needs to sign off."
            action={
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Create First Rule
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rules.map((rule, idx) => {
            const ruleApprovers = Array.isArray(rule.default_approvers) ? rule.default_approvers : [];
            const tint = RULE_TINTS[idx % RULE_TINTS.length];
            const hasConditions =
              rule.applies_to_type_key || rule.applies_to_priority_key || rule.team_name ||
              rule.applies_to_department_id || rule.min_estimated_cost;
            return (
              <div
                key={rule.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl flex flex-col",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                  "animate-fade-up",
                  !rule.is_active && "opacity-[0.85]"
                )}
                style={{ animationDelay: `${120 + idx * 60}ms` }}
              >
                {/* decorative tint glow */}
                <div className={cn("pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full blur-3xl opacity-[0.08]", tint.glow)} />

                {/* Card head */}
                <div className="relative flex items-start gap-3 p-5 pb-4">
                  <span className={cn("h-10 w-10 shrink-0 rounded-xl flex items-center justify-center border", tint.tile)}>
                    <Icon name="shield" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight truncate">
                        {rule.name}
                      </h3>
                      {rule.is_active ? (
                        <Badge tone="emerald" size="sm" dot>Active</Badge>
                      ) : (
                        <Badge tone="slate" size="sm">Disabled</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-[var(--fg-secondary)] leading-relaxed mt-1 line-clamp-2">
                        {rule.description}
                      </p>
                    )}
                  </div>

                  {/* Row actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(rule)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        rule.is_active
                          ? "text-emerald-500 hover:bg-emerald-500/10"
                          : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
                      )}
                      title={rule.is_active ? "Disable rule" : "Enable rule"}
                    >
                      <Icon name={rule.is_active ? "check" : "close"} size={15} />
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all"
                      title="Edit rule"
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                      title="Delete rule"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>

                <div className="relative px-5 pb-5 space-y-4 flex-1">
                  {/* Conditions */}
                  <div>
                    <p className="text-label mb-2 flex items-center gap-1.5">
                      <Icon name="filter" size={12} className="text-[var(--fg-muted)]" />
                      Applies when
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {rule.applies_to_type_key && (
                        <Badge tone="blue" size="sm">Type: {rule.applies_to_type_key}</Badge>
                      )}
                      {rule.applies_to_priority_key && (
                        <Badge tone="amber" size="sm">Priority: {rule.applies_to_priority_key}</Badge>
                      )}
                      {rule.team_name && (
                        <Badge tone="violet" size="sm">Team: {rule.team_name}</Badge>
                      )}
                      {rule.applies_to_department_id && (
                        <Badge tone="cyan" size="sm">Dept: {getDeptName(rule.applies_to_department_id)}</Badge>
                      )}
                      {rule.min_estimated_cost && (
                        <Badge tone="emerald" size="sm">Cost &ge; ${rule.min_estimated_cost}</Badge>
                      )}
                      {!hasConditions && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)]">
                          <Icon name="list" size={11} />
                          All tickets (no conditions)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Approvers */}
                  <div>
                    <p className="text-label mb-2 flex items-center gap-1.5">
                      <Icon name="users" size={12} className="text-[var(--fg-muted)]" />
                      Approvers
                    </p>
                    {ruleApprovers.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {ruleApprovers.map((a, i) => {
                          const type = a.type || "specific_user";
                          const tone = APPROVER_TONE[type] || APPROVER_TONE.specific_user;
                          return (
                            <span
                              key={a.id || a.user_id || `approver-${i}`}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border",
                                tone.chip
                              )}
                            >
                              <Icon name={getApproverTypeIcon(type)} size={11} />
                              <span className="font-medium">{getApproverDisplayName(a)}</span>
                              <span className="opacity-70 font-mono text-[10px]">L{a.approval_level || a.level || 1}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] italic px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)]">
                        <Icon name="userPlus" size={11} />
                        Uses requester's manager hierarchy
                      </span>
                    )}
                  </div>

                  {/* After Approval Actions */}
                  {(rule.after_agent_name || rule.after_team_name) && (
                    <div>
                      <p className="text-label mb-2 flex items-center gap-1.5">
                        <Icon name="arrowRight" size={12} className="text-[var(--fg-muted)]" />
                        After approval
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rule.after_agent_name && (
                          <Badge tone="cyan" size="sm">Assign: {rule.after_agent_name}</Badge>
                        )}
                        {rule.after_team_name && (
                          <Badge tone="teal" size="sm">Move to: {rule.after_team_name}</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Settings footer */}
                <div className="relative grid grid-cols-3 divide-x divide-[var(--border-default)] border-t border-[var(--border-default)] bg-[var(--bg-surface)]/40">
                  <div className="px-4 py-3 text-center">
                    <p className="text-label mb-1">Levels</p>
                    <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums leading-none">
                      {rule.approval_levels || 1}
                    </p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-label mb-1">Auto-approve</p>
                    <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums leading-none">
                      {rule.auto_approve_after_hours ? `${rule.auto_approve_after_hours}h` : "Never"}
                    </p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-label mb-1">Priority</p>
                    <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums leading-none">
                      {rule.priority_order || 0}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingRule ? "Edit Approval Rule" : "Create Approval Rule"}
        subtitle={editingRule ? "Update rule conditions and settings" : "Define when tickets require approval"}
        size="lg"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} icon={<Icon name="check" size={16} />}>
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info */}
          <FormSection
            icon="fileText"
            tint="bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15"
            title="Rule details"
            description="Name this rule and describe when it applies."
          >
            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Rule Name"
                placeholder="e.g., Service Request Approval"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Textarea
                label="Description"
                placeholder="Describe when this rule applies..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </FormSection>

          {/* Conditions */}
          <FormSection
            icon="filter"
            tint="bg-blue-500/10 text-blue-500 border-blue-500/15"
            title="Trigger conditions"
            description="A ticket must match all of these to use this rule."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Ticket Type"
                value={form.applies_to_type_key}
                onChange={(e) => setForm({ ...form, applies_to_type_key: e.target.value })}
              >
                <option value="">Any Type</option>
                {types.map((t) => (
                  <option key={t.id} value={t.key}>{t.label}</option>
                ))}
              </Select>
              <Select
                label="Priority"
                value={form.applies_to_priority_key}
                onChange={(e) => setForm({ ...form, applies_to_priority_key: e.target.value })}
              >
                <option value="">Any Priority</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.key}>{p.label}</option>
                ))}
              </Select>
              <Select
                label="Team"
                value={form.applies_to_team_id}
                onChange={(e) => setForm({ ...form, applies_to_team_id: e.target.value })}
              >
                <option value="">Any Team</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </Select>
              <Select
                label="Requester's Department"
                value={form.applies_to_department_id}
                onChange={(e) => setForm({ ...form, applies_to_department_id: e.target.value })}
              >
                <option value="">Any Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <Input
                  label="Min Estimated Cost ($)"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={form.min_estimated_cost}
                  onChange={(e) => setForm({ ...form, min_estimated_cost: e.target.value })}
                />
              </div>
            </div>
          </FormSection>

          {/* Approval Settings */}
          <FormSection
            icon="layers"
            tint="bg-indigo-500/10 text-indigo-500 border-indigo-500/15"
            title="Approval levels & options"
            description="Control how many approvals are needed and timing."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  label="Approval Levels"
                  type="number"
                  min="1"
                  max="10"
                  value={form.approval_levels}
                  onChange={(e) => setForm({ ...form, approval_levels: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1.5">How many levels must approve</p>
              </div>
              <div>
                <Input
                  label="Auto-approve After (hours)"
                  type="number"
                  min="0"
                  placeholder="Never"
                  value={form.auto_approve_after_hours}
                  onChange={(e) => setForm({ ...form, auto_approve_after_hours: e.target.value })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1.5">Leave empty to disable</p>
              </div>
              <div>
                <Input
                  label="Rule Priority"
                  type="number"
                  min="0"
                  value={form.priority_order}
                  onChange={(e) => setForm({ ...form, priority_order: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1.5">Higher = checked first</p>
              </div>
            </div>
          </FormSection>

          {/* ═══ APPROVERS SECTION ═══ */}
          <FormSection
            icon="users"
            tint="bg-violet-500/10 text-violet-500 border-violet-500/15"
            title="Configure approvers"
            description="Add dynamic types or specific users. When empty, the requester's hierarchy is used."
            badge={<span className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-muted)] px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)]">Optional</span>}
          >
            {/* Add Approver Controls */}
            <div className="rounded-xl border border-[var(--border-default)] p-3 mb-3 bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="plus" size={14} className="text-[var(--fg-muted)]" />
                <span className="text-label">Add approver</span>
              </div>

              {/* Type Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {APPROVER_TYPES.map((at) => (
                  <button
                    key={at.value}
                    type="button"
                    onClick={() => setAddApproverType(at.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left",
                      addApproverType === at.value
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                        : "bg-[var(--bg-base)] text-[var(--fg-secondary)] border border-[var(--border-default)] hover:border-[var(--border-hover)]"
                    )}
                  >
                    <Icon name={at.icon} size={14} className="shrink-0" />
                    <span className="truncate">{at.label}</span>
                  </button>
                ))}
              </div>

              {/* Specific User: search input */}
              {addApproverType === "specific_user" && (
                <div className="relative" ref={approverRef}>
                  <div className="relative">
                    <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
                    <input
                      type="text"
                      value={approverSearch}
                      onChange={(e) => {
                        setApproverSearch(e.target.value);
                        setShowApproverDropdown(true);
                      }}
                      onFocus={() => approverSearch.trim() && setShowApproverDropdown(true)}
                      placeholder="Search by name or email..."
                      className={cn(
                        "w-full pl-9 pr-3 py-2.5 rounded-lg text-sm",
                        "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                        "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                        "placeholder:text-[var(--fg-muted)]",
                        "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                        "transition-all duration-200"
                      )}
                    />
                  </div>

                  {/* Dropdown Results */}
                  {showApproverDropdown && filteredApprovers.length > 0 && (
                    <div className={cn(
                      "absolute z-50 w-full mt-1.5 max-h-48 overflow-y-auto rounded-lg",
                      "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                      "shadow-[var(--shadow-elevated)] animate-slide-down"
                    )}>
                      {filteredApprovers.slice(0, 10).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => addSpecificUser(user)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                            "hover:bg-[var(--bg-surface)] transition-colors"
                          )}
                        >
                          <div className="h-7 w-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)] flex-shrink-0">
                            {(user.full_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--fg-primary)] truncate">{user.full_name}</p>
                            <p className="text-xs text-[var(--fg-muted)] truncate">{user.email}</p>
                          </div>
                          <Icon name="plus" size={14} className="text-[var(--fg-muted)] flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Manager Chain: level selector + add button */}
              {addApproverType === "manager_chain" && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--fg-secondary)]">Manager Level:</span>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={managerLevel}
                      onChange={(e) => setManagerLevel(Math.max(1, parseInt(e.target.value) || 1))}
                      className={cn(
                        "w-16 px-2 py-1.5 rounded-lg text-sm text-center",
                        "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                        "border border-[var(--border-default)]",
                        "focus:outline-none focus:border-[var(--accent)]"
                      )}
                    />
                    <span className="text-xs text-[var(--fg-muted)]">
                      {managerLevel === 1 ? "(direct manager)" : managerLevel === 2 ? "(skip-level)" : `(${managerLevel} levels up)`}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => addDynamicApprover("manager_chain")}
                    icon={<Icon name="plus" size={12} />}
                  >
                    Add
                  </Button>
                </div>
              )}

              {/* Department Head / Team Lead: just an add button */}
              {(addApproverType === "department_head" || addApproverType === "team_lead") && (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-[var(--fg-secondary)] flex-1 min-w-[200px]">
                    {addApproverType === "department_head"
                      ? "Will resolve to the head of the requester's department at ticket creation time."
                      : "Will resolve to the manager of the ticket's assigned team at creation time."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => addDynamicApprover(addApproverType)}
                    icon={<Icon name="plus" size={12} />}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* Selected Approvers List */}
            {form.default_approvers.length > 0 && (
              <div className="space-y-2">
                {form.default_approvers.map((entry, idx) => {
                  const type = entry.type || "specific_user";
                  const isSpecific = type === "specific_user";
                  const tone = APPROVER_TONE[type] || APPROVER_TONE.specific_user;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-xl",
                        "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                        "hover:border-[var(--border-hover)] transition-colors"
                      )}
                    >
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveApprover(idx, -1)}
                          disabled={idx === 0}
                          className={cn(
                            "p-0.5 rounded transition-colors",
                            idx === 0 ? "text-[var(--fg-muted)]/30" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                          )}
                        >
                          <Icon name="chevronUp" size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveApprover(idx, 1)}
                          disabled={idx === form.default_approvers.length - 1}
                          className={cn(
                            "p-0.5 rounded transition-colors",
                            idx === form.default_approvers.length - 1
                              ? "text-[var(--fg-muted)]/30"
                              : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                          )}
                        >
                          <Icon name="chevronDown" size={12} />
                        </button>
                      </div>

                      {/* Type Icon */}
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                        tone.avatar
                      )}>
                        {isSpecific
                          ? (entry.full_name || "?")[0].toUpperCase()
                          : <Icon name={getApproverTypeIcon(type)} size={16} />
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                            {getApproverDisplayName(entry)}
                          </p>
                          {!isSpecific && (
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                              tone.pill
                            )}>
                              Dynamic
                            </span>
                          )}
                        </div>
                        {isSpecific && entry.email && (
                          <p className="text-xs text-[var(--fg-muted)] truncate">{entry.email}</p>
                        )}
                        {!isSpecific && (
                          <p className="text-xs text-[var(--fg-muted)]">
                            {APPROVER_TYPES.find(t => t.value === type)?.description}
                          </p>
                        )}
                      </div>

                      {/* Approval Level */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-[var(--fg-muted)]">Level</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={entry.approval_level || entry.level || 1}
                          onChange={(e) => setEntryLevel(idx, e.target.value)}
                          className={cn(
                            "w-12 px-2 py-1 rounded text-xs text-center",
                            "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                            "border border-[var(--border-default)]",
                            "focus:outline-none focus:border-[var(--accent)]"
                          )}
                        />
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeApproverEntry(idx)}
                        className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  );
                })}

                {/* Require All at Same Level */}
                {form.default_approvers.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-[var(--fg-secondary)] mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.require_all_approvers}
                      onChange={(e) => setForm({ ...form, require_all_approvers: e.target.checked })}
                      className="rounded border-[var(--border-default)] text-[var(--accent)] focus:ring-[var(--accent)] bg-[var(--bg-base)] w-3.5 h-3.5"
                    />
                    All parallel approvers at the same level must approve
                  </label>
                )}
              </div>
            )}

            {form.default_approvers.length === 0 && (
              <p className="text-xs text-[var(--fg-muted)] italic">
                No approvers configured. The requester's management hierarchy will be used.
              </p>
            )}
          </FormSection>

          {/* ═══ AFTER APPROVAL ═══ */}
          <FormSection
            icon="arrowRight"
            tint="bg-cyan-500/10 text-cyan-500 border-cyan-500/15"
            title="After approval"
            description="Configure what happens once the ticket is approved."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={cn(fieldLabelCls, "flex items-center gap-1.5")}>
                  <Icon name="userPlus" size={14} className="text-[var(--fg-muted)]" />
                  Assign to Agent
                </label>
                <Select
                  value={form.after_approval_agent_id}
                  onChange={(e) => setForm({ ...form, after_approval_agent_id: e.target.value })}
                >
                  <option value="">Stay in queue</option>
                  {agents.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.full_name || a.email}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={cn(fieldLabelCls, "flex items-center gap-1.5")}>
                  <Icon name="teams" size={14} className="text-[var(--fg-muted)]" />
                  Move to Team
                </label>
                <Select
                  value={form.after_approval_team_id}
                  onChange={(e) => setForm({ ...form, after_approval_team_id: e.target.value })}
                >
                  <option value="">Keep current team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </FormSection>

          {/* ═══ NOTES TEMPLATE ═══ */}
          <FormSection
            icon="edit"
            tint="bg-amber-500/10 text-amber-500 border-amber-500/15"
            title="Notes for approvers"
            description="Default context or instructions shown to the approvers."
            badge={<span className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-muted)] px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-default)]">Optional</span>}
          >
            <Textarea
              value={form.notes_template}
              onChange={(e) => setForm({ ...form, notes_template: e.target.value })}
              placeholder="Provide default context or instructions for the approvers..."
              rows={3}
            />
          </FormSection>

          {/* Active Toggle */}
          <label className="flex items-center gap-3 cursor-pointer p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--fg-primary)]">Rule is active</p>
              <p className="text-xs text-[var(--fg-muted)]">Only active rules will be evaluated for new tickets</p>
            </div>
          </label>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
