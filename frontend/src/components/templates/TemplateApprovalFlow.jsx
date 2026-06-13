/**
 * TemplateApprovalFlow — Visual approval pipeline builder for ticket templates.
 *
 * Features:
 * - Vertical step pipeline with connecting lines & add-between buttons
 * - 6 approver resolution modes (specific_user, manager_chain, team_lead, department_head, role, dynamic_field)
 * - Conditional steps with multi-condition rule builder
 * - Drag-to-reorder steps
 * - Global flow settings (type, rejection action, escalation, notifications)
 * - Flow simulation/testing with mock data
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { templatesApi, approvalsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Input, { Select, Textarea } from "../ui/Input";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* ─── Constants ─── */
const APPROVER_TYPES = [
  { value: "specific_user", label: "Specific User", icon: "user", desc: "A fixed user approves" },
  { value: "manager_chain", label: "Manager Chain", icon: "users", desc: "Requester's manager at Nth level" },
  { value: "team_lead", label: "Team Manager", icon: "shield", desc: "Manager of the ticket's assigned team" },
  { value: "department_head", label: "Department Head", icon: "hash", desc: "Head of requester's department" },
  { value: "role", label: "Role-Based", icon: "lock", desc: "All users with a specific role" },
  { value: "dynamic_field", label: "Dynamic (Form Field)", icon: "settings", desc: "User selected in a form field" },
];

const FLOW_TYPES = [
  { value: "sequential", label: "Sequential", desc: "Steps execute one after another" },
  { value: "parallel", label: "Parallel", desc: "All steps execute simultaneously" },
  { value: "conditional", label: "Conditional", desc: "Only matching steps execute" },
];

const REJECTION_ACTIONS = [
  { value: "stop", label: "Stop Flow" },
  { value: "restart", label: "Restart from Step 1" },
  { value: "skip_to_end", label: "Skip to Final Approver" },
];

const ESCALATION_TARGETS = [
  { value: "skip", label: "Skip Step" },
  { value: "manager", label: "Escalate to Manager" },
  { value: "specific_user", label: "Escalate to Specific User" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "in", label: "In List" },
  { value: "not_empty", label: "Not Empty" },
  { value: "empty", label: "Is Empty" },
];

const STANDARD_CONDITION_FIELDS = [
  { value: "priority", label: "Priority" },
  { value: "type", label: "Type" },
  { value: "channel", label: "Channel" },
  { value: "team_id", label: "Team" },
  { value: "department_id", label: "Department" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "agent", label: "Agent" },
];

const defaultStep = () => ({
  _uid: crypto.randomUUID(),
  name: "",
  description: "",
  approver_type: "specific_user",
  approver_user_ids: [],
  approver_role: null,
  manager_level: 1,
  dynamic_field_id: null,
  require_all: false,
  can_delegate: true,
  execution_mode: "sequential",
  auto_approve_hours: null,
  conditions: [],
  is_active: true,
});

const defaultFlow = () => ({
  is_enabled: true,
  approval_type: "sequential",
  require_all_approvers: false,
  auto_approve_hours: null,
  rejection_action: "stop",
  notify_requester: true,
  notify_on_each_step: false,
  escalation_hours: null,
  escalation_to: null,
  escalation_user_id: null,
});

/* ═══════════════════════════════════════════════════ */
/*  Main Component                                    */
/* ═══════════════════════════════════════════════════ */
export default function TemplateApprovalFlow({ templateId, fieldsSchema = [], onDirty }) {
  const toast = useToast();
  const [flow, setFlow] = useState(defaultFlow());
  const [steps, setSteps] = useState([]);
  const [selectedStepUid, setSelectedStepUid] = useState(null);
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [hasExistingFlow, setHasExistingFlow] = useState(false);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const selectedStep = steps.find((s) => s._uid === selectedStepUid) || null;

  /* ─── Load ─── */
  useEffect(() => {
    if (!templateId) {
      setLoading(false);
      return;
    }
    loadFlow();
    loadApprovers();
  }, [templateId]);

  const loadFlow = useCallback(async () => {
    try {
      setLoading(true);
      const res = await templatesApi.getApprovalFlow(templateId);
      if (res.flow) {
        setFlow({
          is_enabled: !!res.flow.is_enabled,
          approval_type: res.flow.approval_type || "sequential",
          require_all_approvers: !!res.flow.require_all_approvers,
          auto_approve_hours: res.flow.auto_approve_hours || null,
          rejection_action: res.flow.rejection_action || "stop",
          notify_requester: res.flow.notify_requester !== 0,
          notify_on_each_step: !!res.flow.notify_on_each_step,
          escalation_hours: res.flow.escalation_hours || null,
          escalation_to: res.flow.escalation_to || null,
          escalation_user_id: res.flow.escalation_user_id || null,
        });
        setSteps(
          (res.steps || []).map((s) => ({
            ...s,
            _uid: crypto.randomUUID(),
            conditions: s.conditions || [],
          }))
        );
        setHasExistingFlow(true);
      } else {
        setFlow(defaultFlow());
        setSteps([]);
        setHasExistingFlow(false);
      }
    } catch (err) {
      console.error("Failed to load approval flow:", err);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  const loadApprovers = useCallback(async () => {
    try {
      const res = await approvalsApi.getApprovers();
      setApprovers(res.approvers || []);
    } catch (err) {
      console.error("Failed to load approvers:", err);
    }
  }, []);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const payload = {
        ...flow,
        steps: steps.map((s, i) => ({
          name: s.name,
          description: s.description || null,
          approver_type: s.approver_type,
          approver_user_ids: s.approver_user_ids || [],
          approver_role: s.approver_role || null,
          manager_level: s.manager_level || 1,
          dynamic_field_id: s.dynamic_field_id || null,
          require_all: !!s.require_all,
          can_delegate: !!s.can_delegate,
          execution_mode: s.execution_mode || "sequential",
          auto_approve_hours: s.auto_approve_hours || null,
          conditions: s.conditions || [],
          is_active: s.is_active !== false,
        })),
      };
      await templatesApi.saveApprovalFlow(templateId, payload);
      setDirty(false);
      setHasExistingFlow(true);
    } catch (err) {
      console.error("Failed to save approval flow:", err);
      toast.error("Failed to save approval flow: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }, [templateId, flow, steps]);

  /* ─── Mutations ─── */
  const markDirty = () => {
    setDirty(true);
    onDirty?.();
  };

  const updateFlow = (key, val) => {
    setFlow((prev) => ({ ...prev, [key]: val }));
    markDirty();
  };

  const addStep = (afterIndex = steps.length - 1) => {
    const s = defaultStep();
    s.name = `Step ${steps.length + 1}`;
    const newSteps = [...steps];
    newSteps.splice(afterIndex + 1, 0, s);
    setSteps(newSteps);
    setSelectedStepUid(s._uid);
    markDirty();
  };

  const removeStep = (uid) => {
    setSteps((prev) => prev.filter((s) => s._uid !== uid));
    if (selectedStepUid === uid) setSelectedStepUid(null);
    markDirty();
  };

  const updateStep = (uid, key, val) => {
    setSteps((prev) => prev.map((s) => (s._uid === uid ? { ...s, [key]: val } : s)));
    markDirty();
  };

  const updateStepCondition = (stepUid, condIdx, key, val) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s._uid !== stepUid) return s;
        const conds = [...(s.conditions || [])];
        conds[condIdx] = { ...conds[condIdx], [key]: val };
        return { ...s, conditions: conds };
      })
    );
    markDirty();
  };

  const addConditionToStep = (stepUid) => {
    setSteps((prev) =>
      prev.map((s) =>
        s._uid === stepUid
          ? { ...s, conditions: [...(s.conditions || []), { field: "", operator: "equals", value: "" }] }
          : s
      )
    );
    markDirty();
  };

  const removeConditionFromStep = (stepUid, condIdx) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s._uid !== stepUid) return s;
        const conds = [...(s.conditions || [])];
        conds.splice(condIdx, 1);
        return { ...s, conditions: conds };
      })
    );
    markDirty();
  };

  /* ─── Drag-and-drop reorder ─── */
  const handleDragStart = (idx) => {
    dragItem.current = idx;
  };

  const handleDragEnter = (idx) => {
    dragOverItem.current = idx;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from === to) return;
    const reordered = [...steps];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setSteps(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
    markDirty();
  };

  /* ─── Dynamic field options (user_lookup fields from template schema) ─── */
  const userLookupFields = (fieldsSchema || []).filter((f) => f.type === "user_lookup");

  /* ─── Condition field options = standard fields + template form fields ─── */
  const conditionFieldOptions = [
    ...STANDARD_CONDITION_FIELDS,
    ...(fieldsSchema || [])
      .filter((f) => !["section_header", "info_text", "divider"].includes(f.type))
      .map((f) => ({ value: f.id, label: f.label || f.id })),
  ];

  /* ─── No template yet ─── */
  if (!templateId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center mx-auto mb-4">
            <Icon name="shield" size={28} className="text-[var(--fg-muted)]" />
          </div>
          <p className="text-[var(--fg-secondary)] text-sm">
            Save the template first, then configure the approval flow.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
      </div>
    );
  }

  /* ═══ RENDER ═══ */
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ─── Top Control Bar ─── */}
      <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-default)] flex-shrink-0">
        {/* Enable toggle */}
        <button
          onClick={() => updateFlow("is_enabled", !flow.is_enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
            flow.is_enabled ? "bg-[var(--accent)]" : "bg-[var(--bg-sunken)]"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
              flow.is_enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
        <span className="text-sm font-medium text-[var(--fg-primary)]">
          {flow.is_enabled ? "Enabled" : "Disabled"}
        </span>

        <div className="h-5 w-px bg-[var(--border-default)] mx-1" />

        {/* Flow type — sets default for ALL steps */}
        <div className="flex items-center gap-1.5">
          {FLOW_TYPES.map((ft) => (
            <button
              key={ft.value}
              onClick={() => {
                updateFlow("approval_type", ft.value);
                // Also apply to all steps as default
                if (ft.value !== "conditional") {
                  const mode = ft.value === "parallel" ? "parallel" : "sequential";
                  setSteps((prev) => prev.map((s) => ({ ...s, execution_mode: mode })));
                }
              }}
              title={ft.desc + " (applies to all steps)"}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 border",
                flow.approval_type === ft.value
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30"
                  : "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] border-[var(--border-default)] hover:text-[var(--fg-primary)]"
              )}
            >
              {ft.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-[var(--fg-muted)] hidden sm:inline">
          Per-step overrides below
        </span>

        <div className="flex-1" />

        {/* Simulate button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowSimulation(true)}
          icon={<Icon name="activity" size={14} />}
          disabled={steps.length === 0}
        >
          Test Flow
        </Button>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors"
          title="Global Settings"
        >
          <Icon name="settings" size={18} />
        </button>

        {/* Save */}
        <Button size="sm" onClick={handleSave} disabled={saving || !dirty} icon={saving ? null : <Icon name="check" size={14} />}>
          {saving ? "Saving..." : "Save Flow"}
        </Button>
      </div>

      {/* ─── Main 2-Panel Layout ─── */}
      <div className="flex gap-4 flex-1 min-h-0 pt-4">
        {/* ──── LEFT: Visual Pipeline ──── */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-none pr-2">
          {steps.length === 0 ? (
            /* Empty state */
            <div
              className={cn(
                "flex flex-col items-center justify-center py-16 rounded-xl border-2 border-dashed",
                "border-[var(--border-default)] bg-[var(--bg-sunken)]/30"
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-4">
                <Icon name="shield" size={24} className="text-[var(--accent)]" />
              </div>
              <p className="text-sm font-medium text-[var(--fg-primary)] mb-1">No Approval Steps</p>
              <p className="text-xs text-[var(--fg-muted)] mb-4">
                Add steps to define who approves tickets created from this template
              </p>
              <Button size="sm" onClick={() => addStep(-1)} icon={<Icon name="plus" size={14} />}>
                Add First Step
              </Button>
            </div>
          ) : (
            /* Step pipeline */
            <div className="space-y-0">
              {steps.map((step, idx) => {
                const approverInfo = APPROVER_TYPES.find((a) => a.value === step.approver_type);
                const isSelected = selectedStepUid === step._uid;
                const condCount = (step.conditions || []).length;

                return (
                  <div key={step._uid}>
                    {/* Step Card */}
                    <div
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => setSelectedStepUid(isSelected ? null : step._uid)}
                      className={cn(
                        "relative group rounded-xl border-2 p-4 cursor-pointer transition-all duration-200",
                        "hover:shadow-lg hover:shadow-black/10",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-md shadow-[var(--accent)]/10"
                          : "border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--fg-muted)]/40",
                        !step.is_active && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Drag handle + step number */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <div className="cursor-grab text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icon name="menu" size={12} />
                          </div>
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                              isSelected
                                ? "bg-[var(--accent)] text-white"
                                : "bg-[var(--bg-sunken)] text-[var(--fg-secondary)] border border-[var(--border-default)]"
                            )}
                          >
                            {idx + 1}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-[var(--fg-primary)] truncate">
                              {step.name || "Unnamed Step"}
                            </span>
                            {!step.is_active && (
                              <Badge tone="slate" size="sm">Disabled</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Approver type badge */}
                            <span className={cn(
                              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md",
                              "bg-[var(--bg-sunken)] text-[var(--fg-secondary)] border border-[var(--border-default)]"
                            )}>
                              <Icon name={approverInfo?.icon || "user"} size={12} />
                              {approverInfo?.label || step.approver_type}
                            </span>

                            {/* Approver detail — individual removable chips for specific_user */}
                            {step.approver_type === "specific_user" && (step.approver_user_ids || []).length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {(step.approver_user_ids || []).map((uid) => {
                                  const userName = (step.approver_names || []).find((a) => a.id === uid)?.full_name
                                    || approvers.find((a) => a.id === uid)?.full_name
                                    || `#${uid}`;
                                  return (
                                    <span
                                      key={uid}
                                      className={cn(
                                        "inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-md",
                                        "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                                      )}
                                    >
                                      <Icon name="user" size={10} />
                                      {userName}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateStep(
                                            step._uid,
                                            "approver_user_ids",
                                            (step.approver_user_ids || []).filter((id) => id !== uid)
                                          );
                                        }}
                                        className="ml-0.5 p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                        title={`Remove ${userName}`}
                                      >
                                        <Icon name="x" size={10} />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {step.approver_type === "manager_chain" && (
                              <span className="text-xs text-[var(--fg-muted)]">
                                Level {step.manager_level || 1} manager
                              </span>
                            )}
                            {step.approver_type === "role" && step.approver_role && (
                              <span className="text-xs text-[var(--fg-muted)] capitalize">
                                {step.approver_role} role
                              </span>
                            )}
                            {step.approver_type === "dynamic_field" && step.dynamic_field_id && (
                              <span className="text-xs text-[var(--fg-muted)]">
                                From field: {fieldsSchema.find((f) => f.id === step.dynamic_field_id)?.label || step.dynamic_field_id}
                              </span>
                            )}

                            {/* Conditions badge */}
                            {condCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                <Icon name="filter" size={10} />
                                {condCount} condition{condCount !== 1 ? "s" : ""}
                              </span>
                            )}

                            {/* Require all to approve — clickable toggle button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStep(step._uid, "require_all", !step.require_all);
                              }}
                              title={step.require_all ? "Click to switch: any one approver is enough" : "Click to switch: all approvers must approve"}
                              className={cn(
                                "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border transition-all duration-200",
                                step.require_all
                                  ? "bg-violet-500/15 text-violet-400 border-violet-500/30 hover:bg-violet-500/25"
                                  : "bg-[var(--bg-sunken)] text-[var(--fg-muted)] border-[var(--border-default)] hover:text-[var(--fg-secondary)] hover:border-[var(--fg-muted)]/40"
                              )}
                            >
                              {step.require_all ? (
                                <><Icon name="checkCircle" size={10} /> All must approve</>
                              ) : (
                                <><Icon name="user" size={10} /> Any can approve</>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); updateStep(step._uid, "is_active", !step.is_active); }}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-sunken)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
                            title={step.is_active ? "Disable step" : "Enable step"}
                          >
                            <Icon name={step.is_active ? "eyeOff" : "eye"} size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeStep(step._uid); }}
                            className="p-1.5 rounded-md hover:bg-red-500/15 text-[var(--fg-muted)] hover:text-red-400 transition-colors"
                            title="Delete step"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Connector: per-step execution mode toggle + add-between */}
                    {idx < steps.length - 1 && (
                      <div className="flex items-center gap-2 py-1 justify-center">
                        {/* Left: add step button */}
                        <button
                          onClick={() => addStep(idx)}
                          className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200",
                            "border border-dashed border-[var(--border-default)] text-[var(--fg-muted)]",
                            "hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10"
                          )}
                          title="Add step here"
                        >
                          <Icon name="plus" size={10} />
                        </button>

                        {/* Center: execution mode toggle between THIS step and the next */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStep(
                              step._uid,
                              "execution_mode",
                              step.execution_mode === "parallel" ? "sequential" : "parallel"
                            );
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 border",
                            step.execution_mode === "parallel"
                              ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/25"
                              : "bg-[var(--bg-sunken)] text-[var(--fg-muted)] border-[var(--border-default)] hover:text-[var(--fg-primary)] hover:border-[var(--fg-muted)]/40"
                          )}
                          title={
                            step.execution_mode === "parallel"
                              ? "Parallel: this step and the next run at the same time"
                              : "Sequential: next step waits for this one to complete"
                          }
                        >
                          {step.execution_mode === "parallel" ? (
                            <>
                              <Icon name="zap" size={10} />
                              PARALLEL
                            </>
                          ) : (
                            <>
                              <Icon name="chevronDown" size={10} />
                              THEN
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add step at end */}
              <div className="flex flex-col items-center pt-2">
                {steps.length > 0 && <div className="w-px h-4 bg-[var(--border-default)]" />}
                <button
                  onClick={() => addStep(steps.length - 1)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200",
                    "border border-dashed border-[var(--border-default)] text-[var(--fg-secondary)]",
                    "hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5"
                  )}
                >
                  <Icon name="plus" size={14} />
                  <span className="text-sm">Add Step</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ──── RIGHT: Step Detail Panel ──── */}
        {selectedStep && (
          <div className="w-80 flex-shrink-0 overflow-y-auto scrollbar-none border-l border-[var(--border-default)] pl-4">
            <StepEditor
              step={selectedStep}
              approvers={approvers}
              fieldsSchema={fieldsSchema}
              userLookupFields={userLookupFields}
              conditionFieldOptions={conditionFieldOptions}
              onUpdate={(key, val) => updateStep(selectedStep._uid, key, val)}
              onUpdateCondition={(ci, key, val) => updateStepCondition(selectedStep._uid, ci, key, val)}
              onAddCondition={() => addConditionToStep(selectedStep._uid)}
              onRemoveCondition={(ci) => removeConditionFromStep(selectedStep._uid, ci)}
              onClose={() => setSelectedStepUid(null)}
              onDelete={() => removeStep(selectedStep._uid)}
            />
          </div>
        )}
      </div>

      {/* ─── Global Settings Modal ─── */}
      {showSettings && (
        <SettingsModal
          flow={flow}
          approvers={approvers}
          onUpdate={updateFlow}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ─── Simulation Modal ─── */}
      {showSimulation && (
        <SimulationModal
          templateId={templateId}
          steps={steps}
          fieldsSchema={fieldsSchema}
          onClose={() => setShowSimulation(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Step Editor (right panel)                         */
/* ═══════════════════════════════════════════════════ */
function StepEditor({
  step,
  approvers,
  fieldsSchema,
  userLookupFields,
  conditionFieldOptions,
  onUpdate,
  onUpdateCondition,
  onAddCondition,
  onRemoveCondition,
  onClose,
  onDelete,
}) {
  const approverType = APPROVER_TYPES.find((a) => a.value === step.approver_type);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Edit Step</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[var(--bg-sunken)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Step Name */}
      <Input
        label="Step Name"
        value={step.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        placeholder="e.g., Manager Approval"
        size="sm"
      />

      {/* Approver Type */}
      <div>
        <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Approver Type</label>
        <div className="space-y-1.5">
          {APPROVER_TYPES.map((at) => (
            <button
              key={at.value}
              onClick={() => onUpdate("approver_type", at.value)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 border",
                step.approver_type === at.value
                  ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]"
                  : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--fg-muted)]/30"
              )}
            >
              <Icon name={at.icon} size={16} />
              <div>
                <p className="text-xs font-medium">{at.label}</p>
                <p className="text-[10px] opacity-70">{at.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic sub-fields based on approver type */}
      <div className="space-y-3">
        {step.approver_type === "specific_user" && (
          <div>
            <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
              Approvers
              {(step.approver_user_ids || []).length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-[var(--fg-muted)]">
                  ({(step.approver_user_ids || []).length} selected)
                </span>
              )}
            </label>

            {/* Selected approver chips */}
            {(step.approver_user_ids || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(step.approver_user_ids || []).map((uid) => {
                  const user = (step.approver_names || []).find((a) => a.id === uid)
                    || approvers.find((a) => a.id === uid);
                  return (
                    <span
                      key={uid}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md",
                        "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20"
                      )}
                    >
                      <Icon name="user" size={10} />
                      {user?.fullName || user?.full_name || user?.email || `User #${uid}`}
                      <button
                        onClick={() => onUpdate(
                          "approver_user_ids",
                          (step.approver_user_ids || []).filter((id) => id !== uid)
                        )}
                        className="ml-0.5 hover:text-red-400 transition-colors"
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Add approver dropdown */}
            <select
              value=""
              onChange={(e) => {
                const userId = Number(e.target.value);
                if (userId && !(step.approver_user_ids || []).includes(userId)) {
                  onUpdate("approver_user_ids", [...(step.approver_user_ids || []), userId]);
                }
              }}
              className={cn(
                "w-full text-xs px-3 py-2 rounded-lg",
                "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            >
              <option value="">+ Add approver...</option>
              {approvers
                .filter((u) => !(step.approver_user_ids || []).includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
            </select>

            <p className="text-[10px] text-[var(--fg-muted)] mt-1.5">
              All selected approvers must approve this step before it's complete.
            </p>
          </div>
        )}

        {step.approver_type === "manager_chain" && (
          <Input
            label="Manager Level"
            type="number"
            min={1}
            max={10}
            value={step.manager_level || 1}
            onChange={(e) => onUpdate("manager_level", Math.max(1, Number(e.target.value)))}
            helperText="1 = direct manager, 2 = skip-level, 3 = 2nd skip-level"
            size="sm"
          />
        )}

        {step.approver_type === "team_lead" && (
          <div className="text-xs text-[var(--fg-muted)] bg-[var(--bg-sunken)] rounded-lg px-3 py-2.5 border border-[var(--border-default)]">
            <Icon name="info" size={12} className="inline mr-1.5" />
            Auto-resolved from the ticket's assigned team. The team manager will be the approver.
          </div>
        )}

        {step.approver_type === "department_head" && (
          <div className="text-xs text-[var(--fg-muted)] bg-[var(--bg-sunken)] rounded-lg px-3 py-2.5 border border-[var(--border-default)]">
            <Icon name="info" size={12} className="inline mr-1.5" />
            Auto-resolved from the requester's department. The department head will be the approver.
          </div>
        )}

        {step.approver_type === "role" && (
          <Select
            label="Role"
            value={step.approver_role || ""}
            onChange={(e) => onUpdate("approver_role", e.target.value || null)}
          >
            <option value="">Choose a role...</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        )}

        {step.approver_type === "dynamic_field" && (
          <Select
            label="User Lookup Field"
            value={step.dynamic_field_id || ""}
            onChange={(e) => onUpdate("dynamic_field_id", e.target.value || null)}
          >
            <option value="">Choose a form field...</option>
            {userLookupFields.length === 0 ? (
              <option disabled>No user_lookup fields in this template</option>
            ) : (
              userLookupFields.map((f) => (
                <option key={f.id} value={f.id}>{f.label || f.id}</option>
              ))
            )}
          </Select>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border-default)]" />

      {/* Toggles */}
      <div className="space-y-3">
        <ToggleRow
          label="Require All to Approve"
          desc="All approvers at this step must approve (vs any one)"
          checked={!!step.require_all}
          onChange={(v) => onUpdate("require_all", v)}
        />
        <ToggleRow
          label="Allow Delegation"
          desc="Approver can delegate to another user"
          checked={!!step.can_delegate}
          onChange={(v) => onUpdate("can_delegate", v)}
        />
      </div>

      {/* Per-step timeout */}
      <Input
        label="Auto-approve Timeout (hours)"
        type="number"
        min={1}
        value={step.auto_approve_hours || ""}
        onChange={(e) => onUpdate("auto_approve_hours", e.target.value ? Number(e.target.value) : null)}
        placeholder="No timeout"
        helperText="Auto-approve if no response within this many hours"
        size="sm"
      />

      {/* Divider */}
      <div className="border-t border-[var(--border-default)]" />

      {/* ─── Conditions ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--fg-primary)]">Conditions</label>
          <button
            onClick={onAddCondition}
            className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            <Icon name="plus" size={12} />
            Add
          </button>
        </div>
        <p className="text-[10px] text-[var(--fg-muted)] mb-3">
          Step only runs if ALL conditions are met. Leave empty to always run.
        </p>

        {(step.conditions || []).length === 0 ? (
          <div className="text-xs text-[var(--fg-muted)] bg-[var(--bg-sunken)] rounded-lg px-3 py-2 border border-[var(--border-default)] text-center">
            No conditions — step always executes
          </div>
        ) : (
          <div className="space-y-2">
            {(step.conditions || []).map((cond, ci) => (
              <div key={ci} className="flex items-start gap-1.5 bg-[var(--bg-sunken)] rounded-lg p-2 border border-[var(--border-default)]">
                <div className="flex-1 space-y-1.5">
                  <select
                    value={cond.field || ""}
                    onChange={(e) => onUpdateCondition(ci, "field", e.target.value)}
                    className="w-full text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-[var(--fg-primary)]"
                  >
                    <option value="">Select field...</option>
                    <optgroup label="Standard Fields">
                      {STANDARD_CONDITION_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </optgroup>
                    {fieldsSchema.filter((f) => !["section_header", "info_text", "divider"].includes(f.type)).length > 0 && (
                      <optgroup label="Template Fields">
                        {fieldsSchema
                          .filter((f) => !["section_header", "info_text", "divider"].includes(f.type))
                          .map((f) => (
                            <option key={f.id} value={f.id}>{f.label || f.id}</option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                  <div className="flex gap-1.5">
                    <select
                      value={cond.operator || "equals"}
                      onChange={(e) => onUpdateCondition(ci, "operator", e.target.value)}
                      className="w-1/2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-[var(--fg-primary)]"
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    {!["empty", "not_empty"].includes(cond.operator) && (
                      <input
                        type="text"
                        value={cond.value || ""}
                        onChange={(e) => onUpdateCondition(ci, "value", e.target.value)}
                        placeholder="Value..."
                        className="w-1/2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]"
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveCondition(ci)}
                  className="p-1 rounded hover:bg-red-500/15 text-[var(--fg-muted)] hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border-default)]" />

      {/* Delete step */}
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
      >
        <Icon name="trash" size={14} />
        Delete Step
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Toggle Row                                        */
/* ═══════════════════════════════════════════════════ */
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-[var(--fg-primary)]">{label}</p>
        {desc && <p className="text-[10px] text-[var(--fg-muted)]">{desc}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 flex-shrink-0",
          checked ? "bg-[var(--accent)]" : "bg-[var(--bg-sunken)]"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Global Settings Modal                             */
/* ═══════════════════════════════════════════════════ */
function SettingsModal({ flow, approvers, onUpdate, onClose }) {
  return (
    <Modal title="Approval Flow Settings" onClose={onClose} size="md">
      <div className="space-y-5 p-1">
        {/* Rejection Action */}
        <Select
          label="On Rejection"
          value={flow.rejection_action}
          onChange={(e) => onUpdate("rejection_action", e.target.value)}
        >
          {REJECTION_ACTIONS.map((ra) => (
            <option key={ra.value} value={ra.value}>{ra.label}</option>
          ))}
        </Select>

        {/* Global auto-approve */}
        <Input
          label="Global Auto-Approve Timeout (hours)"
          type="number"
          min={1}
          value={flow.auto_approve_hours || ""}
          onChange={(e) => onUpdate("auto_approve_hours", e.target.value ? Number(e.target.value) : null)}
          placeholder="No timeout"
          helperText="Auto-approve all pending steps after this many hours (overridden by per-step timeout)"
        />

        {/* Require all */}
        <ToggleRow
          label="Require All Approvers (Default)"
          desc="Default for all steps: all approvers must approve vs any one"
          checked={!!flow.require_all_approvers}
          onChange={(v) => onUpdate("require_all_approvers", v)}
        />

        <div className="border-t border-[var(--border-default)]" />

        {/* Escalation */}
        <h4 className="text-sm font-medium text-[var(--fg-primary)]">Escalation</h4>
        <Input
          label="Escalation Timeout (hours)"
          type="number"
          min={1}
          value={flow.escalation_hours || ""}
          onChange={(e) => onUpdate("escalation_hours", e.target.value ? Number(e.target.value) : null)}
          placeholder="No escalation"
          helperText="Escalate if no response within this many hours"
        />

        {flow.escalation_hours && (
          <>
            <Select
              label="Escalation Action"
              value={flow.escalation_to || ""}
              onChange={(e) => onUpdate("escalation_to", e.target.value || null)}
            >
              <option value="">Select action...</option>
              {ESCALATION_TARGETS.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </Select>

            {flow.escalation_to === "specific_user" && (
              <Select
                label="Escalate To"
                value={flow.escalation_user_id || ""}
                onChange={(e) => onUpdate("escalation_user_id", e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Choose a user...</option>
                {approvers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </Select>
            )}
          </>
        )}

        <div className="border-t border-[var(--border-default)]" />

        {/* Notifications */}
        <h4 className="text-sm font-medium text-[var(--fg-primary)]">Notifications</h4>
        <ToggleRow
          label="Notify Requester"
          desc="Notify the ticket requester of approval status changes"
          checked={!!flow.notify_requester}
          onChange={(v) => onUpdate("notify_requester", v)}
        />
        <ToggleRow
          label="Notify on Each Step"
          desc="Send notifications when each step is completed"
          checked={!!flow.notify_on_each_step}
          onChange={(v) => onUpdate("notify_on_each_step", v)}
        />

        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  Simulation Modal                                  */
/* ═══════════════════════════════════════════════════ */
function SimulationModal({ templateId, steps, fieldsSchema, onClose }) {
  const [mockData, setMockData] = useState({
    priority: "",
    type: "",
    team_id: "",
    requester_id: "",
    form_data: {},
  });
  const [results, setResults] = useState(null);
  const [testing, setTesting] = useState(false);

  const runSimulation = async () => {
    try {
      setTesting(true);
      const payload = {
        ...mockData,
        team_id: mockData.team_id ? Number(mockData.team_id) : undefined,
        requester_id: mockData.requester_id ? Number(mockData.requester_id) : undefined,
      };
      const res = await templatesApi.testApprovalFlow(templateId, payload);
      setResults(res);
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal title="Test Approval Flow" onClose={onClose} size="lg">
      <div className="space-y-4 p-1">
        <p className="text-xs text-[var(--fg-muted)]">
          Enter mock data to simulate which approval steps would trigger and who would be resolved as approvers.
        </p>

        {/* Mock inputs */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Priority"
            size="sm"
            value={mockData.priority}
            onChange={(e) => setMockData((p) => ({ ...p, priority: e.target.value }))}
            placeholder="e.g., urgent"
          />
          <Input
            label="Type"
            size="sm"
            value={mockData.type}
            onChange={(e) => setMockData((p) => ({ ...p, type: e.target.value }))}
            placeholder="e.g., service_request"
          />
          <Input
            label="Team ID"
            size="sm"
            type="number"
            value={mockData.team_id}
            onChange={(e) => setMockData((p) => ({ ...p, team_id: e.target.value }))}
            placeholder="Team ID"
          />
          <Input
            label="Requester User ID"
            size="sm"
            type="number"
            value={mockData.requester_id}
            onChange={(e) => setMockData((p) => ({ ...p, requester_id: e.target.value }))}
            placeholder="Requester ID"
          />
        </div>

        {/* Form field mocks */}
        {fieldsSchema.filter((f) => !["section_header", "info_text", "divider"].includes(f.type)).length > 0 && (
          <div>
            <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Template Form Fields</label>
            <div className="grid grid-cols-2 gap-2">
              {fieldsSchema
                .filter((f) => !["section_header", "info_text", "divider"].includes(f.type))
                .slice(0, 6)
                .map((f) => (
                  <Input
                    key={f.id}
                    label={f.label || f.id}
                    size="sm"
                    value={mockData.form_data[f.id] || ""}
                    onChange={(e) =>
                      setMockData((p) => ({
                        ...p,
                        form_data: { ...p.form_data, [f.id]: e.target.value },
                      }))
                    }
                    placeholder={f.placeholder || "..."}
                  />
                ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={runSimulation} disabled={testing} icon={<Icon name="activity" size={14} />}>
            {testing ? "Simulating..." : "Run Simulation"}
          </Button>
        </div>

        {/* Results */}
        {results && (
          <div className="border-t border-[var(--border-default)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--fg-primary)] mb-3">
              Simulation Results
              <span className="ml-2 text-xs font-normal text-[var(--fg-muted)]">
                Flow type: {results.flow_type}
              </span>
            </h4>

            {results.simulation?.length === 0 ? (
              <p className="text-xs text-[var(--fg-muted)]">No steps to simulate.</p>
            ) : (
              <div className="space-y-2">
                {results.simulation.map((sim, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-3",
                      sim.will_execute
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-[var(--bg-sunken)] border-[var(--border-default)] opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        name={sim.will_execute ? "check" : "x"}
                        size={14}
                        className={sim.will_execute ? "text-emerald-400" : "text-[var(--fg-muted)]"}
                      />
                      <span className="text-sm font-medium text-[var(--fg-primary)]">
                        Step {sim.step_order}: {sim.name}
                      </span>
                      {!sim.will_execute && (
                        <Badge tone="slate" size="sm">Skipped</Badge>
                      )}
                    </div>

                    {/* Condition results */}
                    {sim.conditions_evaluated.length > 0 && (
                      <div className="ml-6 space-y-0.5 mb-1.5">
                        {sim.conditions_evaluated.map((c, ci) => (
                          <div key={ci} className="flex items-center gap-1.5 text-[10px]">
                            <Icon
                              name={c.passed ? "check" : "x"}
                              size={10}
                              className={c.passed ? "text-emerald-400" : "text-red-400"}
                            />
                            <span className="text-[var(--fg-muted)]">
                              {c.field} {c.operator} {c.expected ?? ""} → actual: "{c.actual ?? "null"}"
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resolved approvers */}
                    {sim.will_execute && sim.resolved_approvers && (
                      <div className="ml-6 text-xs text-[var(--fg-secondary)]">
                        {sim.resolved_approvers.error ? (
                          <span className="text-amber-400">⚠ {sim.resolved_approvers.error}</span>
                        ) : sim.resolved_approvers.users ? (
                          <span>
                            Approvers: {sim.resolved_approvers.users.map((u) => u.full_name).join(", ")}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {/* Execution mode indicator */}
                    {sim.execution_mode && (
                      <div className="ml-6 mt-1">
                        <span className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded",
                          sim.execution_mode === "parallel"
                            ? "bg-cyan-500/10 text-cyan-400"
                            : "bg-[var(--bg-sunken)] text-[var(--fg-muted)]"
                        )}>
                          {sim.execution_mode === "parallel" ? "⚡ Runs in parallel with next" : "→ Sequential"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
