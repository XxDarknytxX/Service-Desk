/**
 * Approval Rules Management Page
 * Admin page to configure when approvals are required
 * Supports dynamic approver types: specific_user, manager_chain, department_head, team_lead
 */

import { useState, useEffect, useRef } from "react";
import { approvalsApi } from "../services/api";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const selectCls = cn(
  "w-full px-4 py-2.5 rounded-lg text-sm",
  "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
  "border border-[var(--border-default)]",
  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
);

const ruleTints = ["violet", "blue", "cyan", "teal", "indigo", "emerald"];

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Approval Rules
            </h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">
              Configure when tickets require manager approval
            </p>
          </div>
          <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
            Create Rule
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <div className={cn("rounded-xl p-4", "bg-blue-500/10 border border-blue-500/20")}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Icon name="info" size={16} className="text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--fg-primary)]">How Approval Rules Work</p>
            <p className="text-xs text-[var(--fg-secondary)] mt-1">
              When a ticket matches the conditions of an approval rule, it will be routed through the configured approvers.
              You can use dynamic approver types like "Requester's Manager" (auto-resolved from hierarchy),
              "Department Head", or "Team Manager" alongside specific users. Add department conditions to route
              tickets from specific departments to different approvers.
            </p>
          </div>
        </div>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
            <p className="text-sm text-[var(--fg-secondary)]">Loading rules...</p>
          </div>
        </div>
      ) : rules.length === 0 ? (
        <div className={cn(
          "text-center py-20 rounded-xl",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]"
        )}>
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}>
            <Icon name="checkCircle" size={32} className="text-[var(--fg-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No approval rules</p>
          <p className="text-sm text-[var(--fg-secondary)] mb-4">
            Create rules to define when tickets require manager approval
          </p>
          <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {rules.map((rule, idx) => {
            const ruleApprovers = Array.isArray(rule.default_approvers) ? rule.default_approvers : [];
            return (
              <Card key={rule.id} tint={ruleTints[idx % ruleTints.length]} spotlight hover>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-[var(--fg-primary)]">{rule.name}</h3>
                      {rule.is_active ? (
                        <Badge tone="emerald">Active</Badge>
                      ) : (
                        <Badge tone="slate">Inactive</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{rule.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(rule)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        rule.is_active
                          ? "text-emerald-400 hover:bg-emerald-500/10"
                          : "text-[var(--fg-muted)] hover:bg-[var(--bg-base)]"
                      )}
                      title={rule.is_active ? "Disable rule" : "Enable rule"}
                    >
                      <Icon name={rule.is_active ? "check" : "close"} size={14} />
                    </button>
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-all"
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                {/* Conditions */}
                <div className="space-y-3 mb-4">
                  <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Applies When</p>
                  <div className="flex flex-wrap gap-2">
                    {rule.applies_to_type_key && (
                      <Badge tone="blue">Type: {rule.applies_to_type_key}</Badge>
                    )}
                    {rule.applies_to_priority_key && (
                      <Badge tone="amber">Priority: {rule.applies_to_priority_key}</Badge>
                    )}
                    {rule.team_name && (
                      <Badge tone="violet">Team: {rule.team_name}</Badge>
                    )}
                    {rule.applies_to_department_id && (
                      <Badge tone="cyan">Dept: {getDeptName(rule.applies_to_department_id)}</Badge>
                    )}
                    {rule.min_estimated_cost && (
                      <Badge tone="emerald">Cost &ge; ${rule.min_estimated_cost}</Badge>
                    )}
                    {!rule.applies_to_type_key && !rule.applies_to_priority_key && !rule.team_name && !rule.applies_to_department_id && !rule.min_estimated_cost && (
                      <span className="text-xs text-[var(--fg-muted)]">All tickets (no conditions)</span>
                    )}
                  </div>
                </div>

                {/* Approvers */}
                <div className="mb-4">
                  <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2">Approvers</p>
                  {ruleApprovers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ruleApprovers.map((a, i) => {
                        const type = a.type || "specific_user";
                        const tone = getApproverBadgeTone(type);
                        return (
                          <span
                            key={a.id || a.user_id || `approver-${i}`}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border",
                              tone === "violet" && "bg-violet-500/10 text-violet-400 border-violet-500/20",
                              tone === "amber" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                              tone === "cyan" && "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
                              tone === "teal" && "bg-teal-500/10 text-teal-400 border-teal-500/20"
                            )}
                          >
                            <Icon name={getApproverTypeIcon(type)} size={10} />
                            <span className="font-medium">{getApproverDisplayName(a)}</span>
                            <span className="opacity-60">L{a.approval_level || a.level || 1}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--fg-muted)] italic">Uses requester's manager hierarchy</span>
                  )}
                </div>

                {/* After Approval Actions */}
                {(rule.after_agent_name || rule.after_team_name) && (
                  <div className="mb-4">
                    <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2">After Approval</p>
                    <div className="flex flex-wrap gap-2">
                      {rule.after_agent_name && (
                        <Badge tone="cyan">Assign: {rule.after_agent_name}</Badge>
                      )}
                      {rule.after_team_name && (
                        <Badge tone="teal">Move to: {rule.after_team_name}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Settings */}
                <div className="pt-4 border-t border-[var(--border-default)]">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1">Levels</p>
                      <p className="text-lg font-bold text-[var(--fg-primary)]">{rule.approval_levels || 1}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1">Auto-approve</p>
                      <p className="text-lg font-bold text-[var(--fg-primary)]">
                        {rule.auto_approve_after_hours ? `${rule.auto_approve_after_hours}h` : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1">Priority</p>
                      <p className="text-lg font-bold text-[var(--fg-primary)]">{rule.priority_order || 0}</p>
                    </div>
                  </div>
                </div>
              </Card>
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
            <Button onClick={handleSubmit} loading={submitting}>
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
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

          {/* Conditions */}
          <div>
            <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Conditions (all must match)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Ticket Type</label>
                <select
                  value={form.applies_to_type_key}
                  onChange={(e) => setForm({ ...form, applies_to_type_key: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any Type</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Priority</label>
                <select
                  value={form.applies_to_priority_key}
                  onChange={(e) => setForm({ ...form, applies_to_priority_key: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any Priority</option>
                  {priorities.map((p) => (
                    <option key={p.id} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Team</label>
                <select
                  value={form.applies_to_team_id}
                  onChange={(e) => setForm({ ...form, applies_to_team_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any Team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Requester's Department</label>
                <select
                  value={form.applies_to_department_id}
                  onChange={(e) => setForm({ ...form, applies_to_department_id: e.target.value })}
                  className={selectCls}
                >
                  <option value="">Any Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Min Estimated Cost ($)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={form.min_estimated_cost}
                  onChange={(e) => setForm({ ...form, min_estimated_cost: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Approval Settings */}
          <div>
            <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Approval Settings</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Approval Levels</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={form.approval_levels}
                  onChange={(e) => setForm({ ...form, approval_levels: parseInt(e.target.value) || 1 })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1">How many levels must approve</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Auto-approve After (hours)</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Never"
                  value={form.auto_approve_after_hours}
                  onChange={(e) => setForm({ ...form, auto_approve_after_hours: e.target.value })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1">Leave empty to disable</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Rule Priority</label>
                <Input
                  type="number"
                  min="0"
                  value={form.priority_order}
                  onChange={(e) => setForm({ ...form, priority_order: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-[var(--fg-muted)] mt-1">Higher = checked first</p>
              </div>
            </div>
          </div>

          {/* ═══ APPROVERS SECTION ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-medium text-[var(--fg-primary)]">Configure Approvers</h4>
              <span className="text-xs text-[var(--fg-muted)]">(optional)</span>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mb-4">
              Add approvers using dynamic types or specific users. When left empty, the requester's management hierarchy is used.
            </p>

            {/* Add Approver Controls */}
            <div className="rounded-lg border border-[var(--border-default)] p-3 mb-3 bg-[var(--bg-base)]">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="plus" size={14} className="text-[var(--fg-muted)]" />
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Add Approver</span>
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
                        : "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] border border-[var(--border-default)] hover:border-[var(--border-hover)]"
                    )}
                  >
                    <Icon name={at.icon} size={14} />
                    <span>{at.label}</span>
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
                        "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
                        "border border-[var(--border-default)]",
                        "placeholder:text-[var(--fg-muted)]",
                        "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                      )}
                    />
                  </div>

                  {/* Dropdown Results */}
                  {showApproverDropdown && filteredApprovers.length > 0 && (
                    <div className={cn(
                      "absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg",
                      "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                      "shadow-lg shadow-black/20"
                    )}>
                      {filteredApprovers.slice(0, 10).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => addSpecificUser(user)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                            "hover:bg-[var(--bg-base)] transition-colors"
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
                <div className="flex items-center gap-3">
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
                        "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
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
                <div className="flex items-center gap-3">
                  <p className="text-xs text-[var(--fg-secondary)]">
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
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg",
                        "bg-[var(--bg-base)] border border-[var(--border-default)]",
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
                        type === "specific_user" && "bg-violet-500/10 text-violet-400",
                        type === "manager_chain" && "bg-amber-500/10 text-amber-400",
                        type === "department_head" && "bg-cyan-500/10 text-cyan-400",
                        type === "team_lead" && "bg-teal-500/10 text-teal-400"
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
                              type === "manager_chain" && "bg-amber-500/10 text-amber-400",
                              type === "department_head" && "bg-cyan-500/10 text-cyan-400",
                              type === "team_lead" && "bg-teal-500/10 text-teal-400"
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
                            "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
                            "border border-[var(--border-default)]",
                            "focus:outline-none focus:border-[var(--accent)]"
                          )}
                        />
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeApproverEntry(idx)}
                        className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
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
              <p className="text-xs text-[var(--fg-muted)] mt-2 italic">
                No approvers configured. The requester's management hierarchy will be used.
              </p>
            )}
          </div>

          {/* ═══ AFTER APPROVAL ═══ */}
          <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg-base)] border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2">
                <Icon name="arrowRight" size={14} className="text-[var(--fg-muted)]" />
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">After Approval</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-xs text-[var(--fg-muted)]">Configure what happens after the ticket is approved</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-secondary)] mb-1.5">
                    <Icon name="userPlus" size={12} />
                    Assign to Agent
                  </label>
                  <select
                    value={form.after_approval_agent_id}
                    onChange={(e) => setForm({ ...form, after_approval_agent_id: e.target.value })}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm transition-all",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    )}
                  >
                    <option value="">Stay in queue</option>
                    {agents.map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.full_name || a.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-secondary)] mb-1.5">
                    <Icon name="teams" size={12} />
                    Move to Team
                  </label>
                  <select
                    value={form.after_approval_team_id}
                    onChange={(e) => setForm({ ...form, after_approval_team_id: e.target.value })}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm transition-all",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    )}
                  >
                    <option value="">Keep current team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ NOTES TEMPLATE ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="edit" size={14} className="text-[var(--fg-muted)]" />
              <label className="text-sm font-medium text-[var(--fg-primary)]">Notes for Approvers</label>
              <span className="text-xs text-[var(--fg-muted)]">(optional)</span>
            </div>
            <textarea
              value={form.notes_template}
              onChange={(e) => setForm({ ...form, notes_template: e.target.value })}
              placeholder="Provide default context or instructions for the approvers..."
              rows={3}
              className={cn(
                "w-full px-3 py-2.5 rounded-lg text-sm resize-none transition-all",
                "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                "placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            />
          </div>

          {/* Active Toggle */}
          <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--fg-primary)]">Rule is Active</p>
              <p className="text-xs text-[var(--fg-muted)]">Only active rules will be evaluated for new tickets</p>
            </div>
          </label>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
