/**
 * SLA Management Page — Vodafone Service Desk
 *
 * Premium policy-and-compliance experience:
 *  • Branded PageHeader with refresh + breach-check + create actions
 *  • Compliance KPI rail (response / resolve / approval / tracked) with share bars
 *  • Underline Tabs for Policies / Team Tracking / Approval SLA / Analytics
 *  • Policy cards in a clean grid with priority-target rows and clear status
 *  • Recharts donut for overall compliance (isAnimationActive={false})
 *  • Skeleton loading, EmptyState everywhere, premium grouped-section modals
 *
 * Supports both Team SLA (resolution) and Approval SLA (approval stage) policies.
 * Stage-based vs Hierarchy-based approval SLA modes. Org hierarchy level matching
 * with "X and below" option. All state, effects, handlers, API calls and features
 * are preserved exactly — this is a visual / layout redesign only.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import { slaApi } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import Tabs from "../components/ui/Tabs";
import EmptyState from "../components/ui/EmptyState";
import Skeleton, { SkeletonKpis } from "../components/ui/Skeleton";
import { ChartTooltip } from "../components/ui/chart";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";

const APPROVER_TYPES = [
  { value: "", label: "Any Type" },
  { value: "specific_user", label: "Specific User" },
  { value: "manager_chain", label: "Manager Chain" },
  { value: "team_lead", label: "Team Manager" },
  { value: "department_head", label: "Department Head" },
  { value: "role", label: "Role-based" },
  { value: "dynamic_field", label: "Dynamic Field" },
];

const ESCALATION_ACTIONS = [
  { value: "notify_only", label: "Notify Only", desc: "Send notification to admins" },
  { value: "auto_approve", label: "Auto-Approve", desc: "Automatically approve the stalled step" },
  { value: "escalate_to_next", label: "Escalate to Next", desc: "Skip to next manager in hierarchy" },
  { value: "reassign", label: "Reassign", desc: "Reassign to a specific user" },
];

const ORG_LEVELS = [
  { value: 1, label: "Level 1 — CEO / Top Executive" },
  { value: 2, label: "Level 2 — ExCo / VP" },
  { value: 3, label: "Level 3 — Director / Senior Manager" },
  { value: 4, label: "Level 4 — Manager" },
  { value: 5, label: "Level 5 — Team Manager / Supervisor" },
  { value: 6, label: "Level 6 — Senior Staff" },
  { value: 7, label: "Level 7 — Staff" },
  { value: 8, label: "Level 8 — Junior / Entry Level" },
];

// Time-remaining tone → static utility classes (no dynamic Tailwind)
const TONE_TEXT = {
  blue: "text-blue-500",
  emerald: "text-emerald-500",
  rose: "text-rose-500",
  amber: "text-amber-500",
  violet: "text-violet-500",
  slate: "text-[var(--fg-muted)]",
};

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function SlaManagement() {
  const { user } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState([]);
  const [ticketSlas, setTicketSlas] = useState([]);
  const [stats, setStats] = useState(null);
  const [approvalSlaStats, setApprovalSlaStats] = useState(null);
  const [approvalSlaList, setApprovalSlaList] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [approvalRules, setApprovalRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("policies");
  const [slaFilter, setSlaFilter] = useState("all");
  const [approvalSlaFilter, setApprovalSlaFilter] = useState("all");

  const teams = meta?.teams || [];
  const priorities = meta?.priorities || [];
  const agents = meta?.agents || [];

  // Modal states
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks selected policy type in creation flow: null = choosing, "team" or "approval" = form
  const [createPolicyType, setCreatePolicyType] = useState(null);

  // Team policy form
  const defaultTeamForm = {
    name: "",
    description: "",
    policy_type: "team",
    response_minutes: 60,
    resolve_minutes: 480,
    applies_to_priority_id: "",
    applies_to_team_id: "",
    is_default: false,
    use_business_hours: false,
    business_hours_id: "",
    escalation_minutes: "",
    notify_at_risk_minutes: 60,
  };

  // Approval policy form
  const defaultApprovalForm = {
    name: "",
    description: "",
    policy_type: "approval",
    approval_sla_mode: "stage",
    response_minutes: 0,
    resolve_minutes: 0,
    applies_to_priority_id: "",
    applies_to_team_id: "",
    is_default: false,
    use_business_hours: false,
    business_hours_id: "",
    escalation_minutes: "",
    notify_at_risk_minutes: 30,
    approval_stages: [makeDefaultStage(0)],
  };

  const [policyForm, setPolicyForm] = useState(defaultTeamForm);
  const [breachResults, setBreachResults] = useState(null);
  const [checkingBreaches, setCheckingBreaches] = useState(false);

  const isAdmin = user?.roles?.includes("admin");

  // Derived: filter policies by type
  const teamPolicies = useMemo(() => policies.filter((p) => p.policy_type !== "approval"), [policies]);
  const approvalPolicies = useMemo(() => policies.filter((p) => p.policy_type === "approval"), [policies]);

  useEffect(() => {
    loadData();
  }, [slaFilter, approvalSlaFilter]);

  useEffect(() => {
    loadBusinessHours();
    loadApprovalRules();
  }, []);

  function makeDefaultStage(index) {
    return {
      _uid: `stage-${Date.now()}-${index}`,
      applies_to_approval_level: "",
      applies_to_approver_type: "",
      applies_to_approval_rule_id: "",
      applies_to_org_level: "",
      applies_to_org_level_and_below: false,
      target_minutes: 60,
      warning_minutes: 30,
      escalation_action: "notify_only",
      escalation_to_user_id: "",
      sort_order: index,
      is_active: true,
    };
  }

  async function loadApprovalRules() {
    try {
      const data = await slaApi.getApprovalRulesForSla();
      setApprovalRules(data || []);
    } catch {
      // non-critical
    }
  }

  async function loadBusinessHours() {
    try {
      const data = await slaApi.getBusinessHours();
      setBusinessHours(data || []);
    } catch {
      // non-critical
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [policiesData, slasData, statsData, aslStats, aslList] = await Promise.all([
        slaApi.getPolicies(),
        slaApi.getTicketSlas(slaFilter !== "all" ? { status: slaFilter } : {}),
        slaApi.getStats().catch(() => null),
        slaApi.getApprovalSlaStats().catch(() => null),
        slaApi.getApprovalSlaList(approvalSlaFilter !== "all" ? { status: approvalSlaFilter } : {}).catch(() => []),
      ]);
      setPolicies(policiesData);
      setTicketSlas(slasData);
      setStats(statsData);
      setApprovalSlaStats(aslStats);
      setApprovalSlaList(aslList);
    } catch (error) {
      console.error("Failed to load SLA data", error);
      toast.error(error.message || "Failed to load SLA data");
    } finally {
      setLoading(false);
    }
  }

  function formatMinutes(minutes) {
    if (!minutes) return "N/A";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function getTimeRemaining(dueDate, isPaused = false) {
    if (!dueDate) return null;
    if (isPaused) return { text: "Paused", tone: "slate" };
    const diff = new Date(dueDate) - new Date();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (diff < 0) return { text: "Overdue", tone: "rose" };
    if (hours < 1) return { text: `${minutes}m`, tone: "rose" };
    if (hours < 4) return { text: `${hours}h ${minutes}m`, tone: "amber" };
    return { text: `${hours}h`, tone: "emerald" };
  }

  function openCreateModal() {
    setEditingPolicy(null);
    setCreatePolicyType(null); // show card-based chooser
    setPolicyForm(defaultTeamForm);
    setShowPolicyModal(true);
  }

  function selectCreatePolicyType(type) {
    setCreatePolicyType(type);
    if (type === "approval") {
      setPolicyForm({ ...defaultApprovalForm, approval_stages: [makeDefaultStage(0)] });
    } else {
      setPolicyForm({ ...defaultTeamForm });
    }
  }

  function openEditModal(policy) {
    setEditingPolicy(policy);
    setCreatePolicyType(policy.policy_type); // skip card chooser on edit
    if (policy.policy_type === "approval") {
      const stages = (policy.approval_stages || []).map((s, i) => ({
        ...s,
        _uid: `stage-${Date.now()}-${i}`,
        applies_to_approval_level: s.applies_to_approval_level ?? "",
        applies_to_approver_type: s.applies_to_approver_type ?? "",
        applies_to_approval_rule_id: s.applies_to_approval_rule_id ? String(s.applies_to_approval_rule_id) : "",
        applies_to_org_level: s.applies_to_org_level ?? "",
        applies_to_org_level_and_below: s.applies_to_org_level_and_below === 1 || s.applies_to_org_level_and_below === true,
        escalation_to_user_id: s.escalation_to_user_id ? String(s.escalation_to_user_id) : "",
        is_active: s.is_active === 1 || s.is_active === true,
      }));
      setPolicyForm({
        name: policy.name || "",
        description: policy.description || "",
        policy_type: "approval",
        approval_sla_mode: policy.approval_sla_mode || "stage",
        response_minutes: policy.response_minutes || 0,
        resolve_minutes: policy.resolve_minutes || 0,
        applies_to_priority_id: policy.applies_to_priority_id ? String(policy.applies_to_priority_id) : "",
        applies_to_team_id: policy.applies_to_team_id ? String(policy.applies_to_team_id) : "",
        is_default: policy.is_default === 1,
        use_business_hours: policy.use_business_hours === 1,
        business_hours_id: policy.business_hours_id ? String(policy.business_hours_id) : "",
        escalation_minutes: policy.escalation_minutes || "",
        notify_at_risk_minutes: policy.notify_at_risk_minutes || 30,
        approval_stages: stages.length > 0 ? stages : [makeDefaultStage(0)],
      });
    } else {
      setPolicyForm({
        name: policy.name || "",
        description: policy.description || "",
        policy_type: "team",
        response_minutes: policy.response_minutes || 60,
        resolve_minutes: policy.resolve_minutes || 480,
        applies_to_priority_id: policy.applies_to_priority_id ? String(policy.applies_to_priority_id) : "",
        applies_to_team_id: policy.applies_to_team_id ? String(policy.applies_to_team_id) : "",
        is_default: policy.is_default === 1,
        use_business_hours: policy.use_business_hours === 1,
        business_hours_id: policy.business_hours_id ? String(policy.business_hours_id) : "",
        escalation_minutes: policy.escalation_minutes || "",
        notify_at_risk_minutes: policy.notify_at_risk_minutes || 60,
      });
    }
    setShowPolicyModal(true);
  }

  async function handlePolicySubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...policyForm,
        applies_to_priority_id: policyForm.applies_to_priority_id || null,
        applies_to_team_id: policyForm.applies_to_team_id || null,
        business_hours_id: policyForm.business_hours_id || null,
        escalation_minutes: policyForm.escalation_minutes || null,
      };

      // Clean approval stages
      if (payload.policy_type === "approval" && payload.approval_stages) {
        payload.approval_stages = payload.approval_stages.map((s, i) => ({
          applies_to_approval_level: s.applies_to_approval_level || null,
          applies_to_approver_type: s.applies_to_approver_type || null,
          applies_to_approval_rule_id: s.applies_to_approval_rule_id || null,
          applies_to_org_level: s.applies_to_org_level || null,
          applies_to_org_level_and_below: s.applies_to_org_level_and_below || false,
          target_minutes: parseInt(s.target_minutes) || 60,
          warning_minutes: parseInt(s.warning_minutes) || 30,
          escalation_action: s.escalation_action || "notify_only",
          escalation_to_user_id: s.escalation_to_user_id || null,
          sort_order: i,
          is_active: s.is_active !== false,
        }));
      }

      if (editingPolicy) {
        await slaApi.updatePolicy(editingPolicy.id, payload);
        toast.success("Policy updated");
      } else {
        await slaApi.createPolicy(payload);
        toast.success("Policy created");
      }
      setShowPolicyModal(false);
      setEditingPolicy(null);
      setCreatePolicyType(null);
      setPolicyForm(defaultTeamForm);
      loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeletePolicy(policy) {
    confirm({
      title: "Delete SLA policy?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{policy.name}</strong>.
          Tickets already tracked under this policy keep their existing timers,
          but no new tickets will use it.
        </>
      ),
      confirmText: "Delete Policy",
      onConfirm: async () => {
        try {
          await slaApi.deletePolicy(policy.id);
          toast.success("Policy deleted");
          loadData();
        } catch (error) {
          toast.error(error.message);
        }
      },
    });
  }

  async function handleCheckBreaches() {
    setCheckingBreaches(true);
    try {
      const [teamResult, approvalResult] = await Promise.all([
        slaApi.checkBreaches(),
        slaApi.checkApprovalSlaBreaches().catch(() => null),
      ]);
      setBreachResults({ team: teamResult || null, approval: approvalResult || null });
      loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCheckingBreaches(false);
    }
  }

  // ─── Stage management helpers ──────────────────────────────────
  function addStage() {
    setPolicyForm((prev) => ({
      ...prev,
      approval_stages: [...(prev.approval_stages || []), makeDefaultStage((prev.approval_stages || []).length)],
    }));
  }

  function removeStage(uid) {
    setPolicyForm((prev) => ({
      ...prev,
      approval_stages: (prev.approval_stages || []).filter((s) => s._uid !== uid),
    }));
  }

  function updateStage(uid, field, value) {
    setPolicyForm((prev) => ({
      ...prev,
      approval_stages: (prev.approval_stages || []).map((s) =>
        s._uid === uid ? { ...s, [field]: value } : s
      ),
    }));
  }

  // ─── Select input styling ─────────────────────────────────────
  const selectCls = cn(
    "w-full px-4 py-2.5 rounded-lg text-sm",
    "bg-[var(--bg-base)] text-[var(--fg-primary)]",
    "border border-[var(--border-default)]",
    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
  );

  // ─── Org level label helper ────────────────────────────────────
  function orgLevelLabel(level) {
    const found = ORG_LEVELS.find((o) => o.value === level);
    return found ? found.label : `Level ${level}`;
  }

  function orgLevelShort(level) {
    const labels = { 1: "CEO", 2: "ExCo/VP", 3: "Director", 4: "Manager", 5: "Team Manager", 6: "Senior Staff", 7: "Staff", 8: "Junior" };
    return labels[level] || `L${level}`;
  }

  // ─── Tabs config (with live counts) ────────────────────────────
  const tabs = [
    { value: "policies", label: "Policies", icon: "settings", count: policies.length },
    { value: "tracking", label: "Team Tracking", icon: "clock", count: ticketSlas.length || undefined },
    { value: "approval-tracking", label: "Approval SLA", icon: "shield", count: approvalSlaList.length || undefined },
    { value: "analytics", label: "Analytics", icon: "chart" },
  ];

  // ─── KPI rail (compliance overview) ────────────────────────────
  const kpis = [
    {
      label: "Tracked Tickets",
      value: stats?.total_tickets || 0,
      icon: "ticket",
      iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15",
      bar: "bg-blue-500",
      pct: 100,
      hint: "Tickets under an SLA policy",
    },
    {
      label: "Response Met",
      value: `${stats?.response_compliance_pct || 0}%`,
      icon: "clock",
      iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
      bar: "bg-emerald-500",
      pct: stats?.response_compliance_pct || 0,
      hint: "First-response compliance",
    },
    {
      label: "Resolve Met",
      value: `${stats?.resolve_compliance_pct || 0}%`,
      icon: "checkCircle",
      iconCls: "bg-teal-500/10 text-teal-500 border-teal-500/15",
      bar: "bg-teal-500",
      pct: stats?.resolve_compliance_pct || 0,
      hint: "Resolution compliance",
    },
    {
      label: "Approval SLA",
      value: approvalSlaStats ? `${approvalSlaStats.compliance_pct}%` : "N/A",
      icon: "shield",
      iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15",
      bar: "bg-violet-500",
      pct: approvalSlaStats?.compliance_pct || 0,
      hint: "Approver turnaround compliance",
    },
  ];

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="sla"
        title="SLA Management"
        subtitle="Service Level Agreement policies, compliance tracking and breach checks"
        actions={
          <>
            <ControlButton title="Refresh" onClick={() => loadData()}>
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </ControlButton>
            {isAdmin && (
              <Button variant="secondary" onClick={handleCheckBreaches} loading={checkingBreaches} icon={<Icon name="alertTriangle" size={16} />}>
                Check Breaches
              </Button>
            )}
            {isAdmin && view === "policies" && (
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Create Policy
              </Button>
            )}
          </>
        }
      />

      {/* KPI rail */}
      {loading ? (
        <SkeletonKpis count={4} />
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <div
              key={kpi.label}
              title={kpi.hint}
              className={cn(
                "group relative overflow-hidden rounded-2xl p-5",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                "animate-kpi-rise"
              )}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-label">{kpi.label}</span>
                <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110", kpi.iconCls)}>
                  <Icon name={kpi.icon} size={16} />
                </span>
              </div>
              <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
                {kpi.value}
              </p>
              <div className="mt-4">
                <div className="h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-700 ease-out", kpi.bar)} style={{ width: `${Math.max(kpi.pct, 0)}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-[var(--fg-muted)]">{kpi.hint}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Main Tabs */}
      <Tabs variant="underline" tabs={tabs} value={view} onChange={setView} />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Skeleton className="h-56" rounded="rounded-2xl" />
            <Skeleton className="h-56" rounded="rounded-2xl" />
          </div>
        </div>
      ) : view === "policies" ? (
        /* ═══ POLICIES VIEW ═══ */
        <div className="space-y-8">
          {/* ── Team Policies Section ── */}
          <section className="space-y-4 animate-fade-up">
            <SectionTitle
              icon="users"
              tint="blue"
              title="Team / Resolution SLA"
              subtitle="How quickly teams must respond to and resolve tickets"
              count={teamPolicies.length}
              countTone="blue"
            />

            {teamPolicies.length === 0 ? (
              <Panel>
                <EmptyState
                  icon="sla"
                  title="No team SLA policies yet"
                  description="Define response and resolution targets so tickets are tracked against a clear standard."
                  action={isAdmin ? (
                    <Button size="sm" onClick={openCreateModal} icon={<Icon name="plus" size={14} />}>Create Policy</Button>
                  ) : undefined}
                />
              </Panel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {teamPolicies.map((policy, idx) => (
                  <article
                    key={policy.id}
                    className={cn(
                      "rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                      "animate-fade-up"
                    )}
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="shrink-0 h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/15 flex items-center justify-center">
                          <Icon name="users" size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight truncate">{policy.name}</h3>
                            <Badge tone="blue" size="sm">Team</Badge>
                            {policy.is_default === 1 && <Badge tone="brand" size="sm">Default</Badge>}
                          </div>
                          {policy.description && (
                            <p className="text-xs text-[var(--fg-secondary)] mt-1 leading-relaxed line-clamp-2">{policy.description}</p>
                          )}
                        </div>
                      </div>
                      {isAdmin && <RowActions onEdit={() => openEditModal(policy)} onDelete={() => handleDeletePolicy(policy)} />}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <TargetTile icon="clock" tint="blue" label="Response" value={formatMinutes(policy.response_minutes)} />
                      <TargetTile icon="checkCircle" tint="emerald" label="Resolution" value={formatMinutes(policy.resolve_minutes)} />
                    </div>

                    <div className="pt-4 border-t border-[var(--border-default)] flex flex-wrap gap-2">
                      {policy.priority_label && <Badge tone="amber" size="sm">{policy.priority_label}</Badge>}
                      {policy.team_name && <Badge tone="violet" size="sm">{policy.team_name}</Badge>}
                      {policy.use_business_hours === 1 && <Badge tone="blue" size="sm" dot>Business Hours</Badge>}
                      {policy.business_hours_name && <Badge tone="slate" size="sm">{policy.business_hours_name}</Badge>}
                      {!policy.priority_label && !policy.team_name && policy.use_business_hours !== 1 && !policy.business_hours_name && (
                        <Badge tone="slate" size="sm">Applies to all tickets</Badge>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ── Approval Policies Section ── */}
          <section className="space-y-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
            <SectionTitle
              icon="shield"
              tint="violet"
              title="Approval SLA"
              subtitle="How quickly approvers must act on approval requests"
              count={approvalPolicies.length}
              countTone="violet"
            />

            {approvalPolicies.length === 0 ? (
              <Panel>
                <EmptyState
                  icon="shield"
                  title="No approval SLA policies yet"
                  description="Set time targets for each approval stage so requests don't stall waiting on sign-off."
                  action={isAdmin ? (
                    <Button size="sm" onClick={openCreateModal} icon={<Icon name="plus" size={14} />}>Create Policy</Button>
                  ) : undefined}
                />
              </Panel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {approvalPolicies.map((policy, idx) => (
                  <article
                    key={policy.id}
                    className={cn(
                      "rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                      "animate-fade-up"
                    )}
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="shrink-0 h-9 w-9 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/15 flex items-center justify-center">
                          <Icon name="shield" size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight truncate">{policy.name}</h3>
                            <Badge tone={policy.approval_sla_mode === "hierarchy" ? "amber" : "cyan"} size="sm">
                              {policy.approval_sla_mode === "hierarchy" ? "Hierarchy" : "Stage-based"}
                            </Badge>
                            {policy.is_default === 1 && <Badge tone="brand" size="sm">Default</Badge>}
                          </div>
                          {policy.description && (
                            <p className="text-xs text-[var(--fg-secondary)] mt-1 leading-relaxed line-clamp-2">{policy.description}</p>
                          )}
                        </div>
                      </div>
                      {isAdmin && <RowActions onEdit={() => openEditModal(policy)} onDelete={() => handleDeletePolicy(policy)} />}
                    </div>

                    {/* Approval policy stages */}
                    <div className="space-y-2.5">
                      {(policy.approval_stages || []).map((stage, si) => (
                        <div
                          key={si}
                          className={cn(
                            "rounded-xl p-3 bg-[var(--bg-base)] border border-[var(--border-default)]",
                            !stage.is_active && "opacity-50"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold bg-violet-500/15 text-violet-500 border border-violet-500/25">
                                {si + 1}
                              </span>
                              {policy.approval_sla_mode === "hierarchy" ? (
                                <span className="text-xs font-medium text-[var(--fg-primary)] truncate">
                                  {stage.applies_to_org_level
                                    ? `${orgLevelShort(stage.applies_to_org_level)}${stage.applies_to_org_level_and_below ? " & below" : ""}`
                                    : "Any Org Level"}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-[var(--fg-primary)] truncate">
                                  {stage.applies_to_approval_level ? `Level ${stage.applies_to_approval_level}` : "Any Level"}
                                </span>
                              )}
                              {stage.applies_to_approver_type && (
                                <Badge tone="slate" size="sm" className="capitalize">{stage.applies_to_approver_type.replace(/_/g, " ")}</Badge>
                              )}
                            </div>
                            <span className="shrink-0 text-base font-semibold text-[var(--fg-primary)] tabular-nums">{formatMinutes(stage.target_minutes)}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--fg-muted)] pl-8">
                            <span>Warning {formatMinutes(stage.warning_minutes)}</span>
                            <span className="text-[var(--border-strong)]">·</span>
                            <span>On breach: {ESCALATION_ACTIONS.find((a) => a.value === stage.escalation_action)?.label || stage.escalation_action}</span>
                            {stage.approval_rule_name && (
                              <>
                                <span className="text-[var(--border-strong)]">·</span>
                                <span>Rule: {stage.approval_rule_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 mt-3 border-t border-[var(--border-default)] flex flex-wrap gap-2">
                      {policy.priority_label && <Badge tone="amber" size="sm">{policy.priority_label}</Badge>}
                      {policy.team_name && <Badge tone="violet" size="sm">{policy.team_name}</Badge>}
                      <Badge tone="violet" size="sm">
                        {(policy.approval_stages || []).length} stage{(policy.approval_stages || []).length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : view === "tracking" ? (
        /* ═══ TEAM SLA TRACKING ═══ */
        <div className="space-y-5">
          <Tabs
            variant="pills"
            value={slaFilter}
            onChange={setSlaFilter}
            tabs={[
              { value: "all", label: "All Tickets" },
              { value: "active", label: "Active" },
              { value: "at_risk", label: "At Risk" },
              { value: "breached", label: "Breached" },
              { value: "paused", label: "Paused" },
            ]}
          />

          {ticketSlas.length === 0 ? (
            <Panel>
              <EmptyState
                icon="sla"
                title="No SLA tracked tickets"
                description={slaFilter === "breached" ? "No breached SLAs — great job keeping things on track." : "All tickets are meeting their SLA targets."}
                tone={slaFilter === "breached" ? "emerald" : "default"}
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {ticketSlas.map((sla, idx) => {
                const responseTime = getTimeRemaining(sla.response_due_at, !!sla.paused_at);
                const resolveTime = getTimeRemaining(sla.resolve_due_at, !!sla.paused_at);
                return (
                  <article
                    key={sla.ticket_id}
                    onClick={() => navigate(`/tickets/${sla.ticket_id}`)}
                    className={cn(
                      "group cursor-pointer rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                      "animate-fade-up"
                    )}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--accent)]">
                            {sla.ticket_number}
                          </span>
                          <Badge tone="slate" size="sm">{sla.status_label}</Badge>
                          {sla.paused_at && <Badge tone="amber" size="sm" dot>Paused</Badge>}
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate group-hover:text-[var(--accent)] transition-colors">{sla.subject}</h3>
                        {sla.assignee_name && (
                          <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5 mt-1">
                            <Icon name="user" size={12} />
                            Assigned to {sla.assignee_name}
                          </p>
                        )}
                      </div>
                      {sla.policy_name && <Badge tone="blue" size="sm">{sla.policy_name}</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <SlaStatusTile
                        label="Response SLA"
                        met={!!sla.response_met_at}
                        breached={!!sla.response_breached}
                        time={responseTime}
                      />
                      <SlaStatusTile
                        label="Resolution SLA"
                        met={!!sla.resolve_met_at}
                        breached={!!sla.resolve_breached}
                        time={resolveTime}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : view === "approval-tracking" ? (
        /* ═══ APPROVAL SLA TRACKING ═══ */
        <div className="space-y-5">
          <Tabs
            variant="pills"
            value={approvalSlaFilter}
            onChange={setApprovalSlaFilter}
            tabs={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "at_risk", label: "At Risk" },
              { value: "breached", label: "Breached" },
              { value: "met", label: "Met" },
            ]}
          />

          {/* Approval SLA stats summary */}
          {approvalSlaStats && approvalSlaStats.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Total", value: approvalSlaStats.total, tone: "blue" },
                { label: "Met", value: approvalSlaStats.met, tone: "emerald" },
                { label: "Breached", value: approvalSlaStats.breached, tone: "rose" },
                { label: "Pending", value: approvalSlaStats.pending, tone: "amber" },
                { label: "Escalated", value: approvalSlaStats.escalated, tone: "violet" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
                  <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", TONE_TEXT[s.tone] || "text-[var(--fg-primary)]")}>{s.value}</p>
                  <p className="text-[11px] text-[var(--fg-muted)] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {approvalSlaList.length === 0 ? (
            <Panel>
              <EmptyState
                icon="shield"
                title="No approval SLAs tracked"
                description="Approval SLAs appear here when tickets with approval policies move through their stages."
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {approvalSlaList.map((sla, idx) => {
                const timeLeft = getTimeRemaining(sla.due_at, !!sla.paused_at);
                const statusLabel = sla.met ? "Met" : sla.breached ? "Breached" : sla.paused_at ? "Paused" : "Active";
                const statusColor = sla.met ? "emerald" : sla.breached ? "rose" : sla.paused_at ? "slate" : "blue";

                return (
                  <article
                    key={sla.id}
                    onClick={() => navigate(`/tickets/${sla.ticket_id}`)}
                    className={cn(
                      "group cursor-pointer rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                      "animate-fade-up"
                    )}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--accent)]">
                            {sla.ticket_number}
                          </span>
                          <Badge tone="violet" size="sm">Level {sla.approval_level}</Badge>
                          <Badge tone={statusColor} size="sm" dot={statusColor !== "slate"}>{statusLabel}</Badge>
                          {sla.escalated ? <Badge tone="rose" size="sm">Escalated</Badge> : null}
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate group-hover:text-[var(--accent)] transition-colors">{sla.subject}</h3>
                        <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5 mt-1">
                          <Icon name="user" size={12} />
                          Approver: {sla.approver_name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-label">Target</p>
                        <p className="text-lg font-semibold text-[var(--fg-primary)] tabular-nums mt-0.5">{formatMinutes(sla.target_minutes)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-default)]">
                      <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--fg-muted)] min-w-0">
                        {sla.policy_name && <span className="truncate">{sla.policy_name}</span>}
                        {sla.applies_to_approver_type && (
                          <Badge tone="slate" size="sm" className="capitalize">{sla.applies_to_approver_type.replace(/_/g, " ")}</Badge>
                        )}
                        <span className="capitalize">{sla.approval_status}</span>
                      </div>
                      <div className="shrink-0">
                        {sla.met ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
                            <Icon name="checkCircle" size={14} /> On time
                          </span>
                        ) : sla.breached ? (
                          <Badge tone="rose" size="sm">SLA Breached</Badge>
                        ) : timeLeft ? (
                          <Badge tone={timeLeft.tone} size="sm">{timeLeft.text} left</Badge>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══ ANALYTICS VIEW ═══ */
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Response SLA */}
            <Panel>
              <PanelHeader icon="clock" tint="blue" title="Response SLA" subtitle="First response compliance" />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <MetricTile value={stats?.response_met || 0} label="Met" tone="emerald" />
                  <MetricTile value={stats?.response_breached || 0} label="Breached" tone="rose" />
                  <MetricTile value={stats?.response_pending || 0} label="Pending" tone="amber" />
                </div>
                {stats?.avg_response_time_minutes && (
                  <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                    <p className="text-sm text-[var(--fg-secondary)]">Average response time</p>
                    <p className="text-base font-semibold text-[var(--fg-primary)] tabular-nums">{formatMinutes(Math.round(stats.avg_response_time_minutes))}</p>
                  </div>
                )}
              </div>
            </Panel>

            {/* Resolution SLA */}
            <Panel>
              <PanelHeader icon="checkCircle" tint="emerald" title="Resolution SLA" subtitle="Ticket resolution compliance" />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <MetricTile value={stats?.resolve_met || 0} label="Met" tone="emerald" />
                  <MetricTile value={stats?.resolve_breached || 0} label="Breached" tone="rose" />
                  <MetricTile value={stats?.resolve_pending || 0} label="Pending" tone="amber" />
                </div>
                {stats?.avg_resolve_time_minutes && (
                  <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                    <p className="text-sm text-[var(--fg-secondary)]">Average resolution time</p>
                    <p className="text-base font-semibold text-[var(--fg-primary)] tabular-nums">{formatMinutes(Math.round(stats.avg_resolve_time_minutes))}</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          {/* Approval SLA Compliance */}
          {approvalSlaStats && approvalSlaStats.total > 0 && (
            <Panel>
              <PanelHeader icon="shield" tint="violet" title="Approval SLA Compliance" subtitle="How quickly approvers respond" />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <MetricTile value={approvalSlaStats.met} label="Met" tone="emerald" />
                  <MetricTile value={approvalSlaStats.breached} label="Breached" tone="rose" />
                  <MetricTile value={approvalSlaStats.escalated} label="Escalated" tone="violet" />
                </div>
                {approvalSlaStats.avg_completion_minutes && (
                  <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                    <p className="text-sm text-[var(--fg-secondary)]">Average approval time</p>
                    <p className="text-base font-semibold text-[var(--fg-primary)] tabular-nums">{formatMinutes(approvalSlaStats.avg_completion_minutes)}</p>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* Overall Compliance */}
          <Panel>
            <PanelHeader icon="chart" tint="indigo" title="Overall Compliance" subtitle="SLA attainment across all surfaces" />
            <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              {/* Donut */}
              <div className="relative h-40 lg:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={complianceDonut(stats, approvalSlaStats)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="64%"
                      outerRadius="92%"
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {complianceDonut(stats, approvalSlaStats).map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <RTooltip content={<ChartTooltip hideLabel valueFormatter={(v) => `${v}%`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
                    {overallComplianceAvg(stats, approvalSlaStats)}%
                  </span>
                  <span className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wide">Overall</span>
                </div>
              </div>

              {/* Bars */}
              <div className="lg:col-span-2 space-y-5">
                <ComplianceBar label="Response" pct={stats?.response_compliance_pct || 0} from="from-blue-500" to="to-blue-400" />
                <ComplianceBar label="Resolution" pct={stats?.resolve_compliance_pct || 0} from="from-emerald-500" to="to-emerald-400" />
                <ComplianceBar label="Approval" pct={approvalSlaStats?.compliance_pct || 0} from="from-violet-500" to="to-violet-400" />
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ═══ CREATE/EDIT POLICY MODAL ═══ */}
      <Modal
        open={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        title={
          !createPolicyType && !editingPolicy
            ? "Create SLA Policy"
            : editingPolicy
              ? `Edit ${policyForm.policy_type === "approval" ? "Approval" : "Team"} SLA Policy`
              : `Create ${createPolicyType === "approval" ? "Approval" : "Team"} SLA Policy`
        }
        subtitle={
          !createPolicyType && !editingPolicy
            ? "Choose the type of SLA policy to create"
            : policyForm.policy_type === "approval"
              ? "Define time targets for each approval stage"
              : "Define response and resolution targets"
        }
        size="lg"
        actions={
          createPolicyType || editingPolicy ? (
            <>
              {!editingPolicy && (
                <Button variant="ghost" onClick={() => setCreatePolicyType(null)} className="mr-auto" icon={<Icon name="arrowLeft" size={14} />}>
                  Back
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button>
              <Button onClick={handlePolicySubmit} loading={submitting}>
                {editingPolicy ? "Save Changes" : "Create Policy"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button>
          )
        }
      >
        {/* ── Card-based policy type selector (create only) ── */}
        {!createPolicyType && !editingPolicy ? (
          <div className="space-y-5">
            <p className="text-sm text-[var(--fg-secondary)] text-center">
              What type of SLA policy do you want to create?
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Team Policy Card */}
              <button
                type="button"
                onClick={() => selectCreatePolicyType("team")}
                className={cn(
                  "group relative flex flex-col items-center gap-4 p-6 rounded-2xl",
                  "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                  "hover:border-blue-500/50 hover:bg-[var(--bg-surface-hover)] hover:-translate-y-0.5",
                  "transition-all duration-200 text-center"
                )}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/15 group-hover:scale-110 transition-transform">
                  <Icon name="users" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Team / Resolution SLA</h3>
                  <p className="mt-1 text-xs text-[var(--fg-muted)] leading-relaxed">
                    Define how quickly a team must respond to and resolve tickets
                  </p>
                </div>
              </button>

              {/* Approval Policy Card */}
              <button
                type="button"
                onClick={() => selectCreatePolicyType("approval")}
                className={cn(
                  "group relative flex flex-col items-center gap-4 p-6 rounded-2xl",
                  "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                  "hover:border-violet-500/50 hover:bg-[var(--bg-surface-hover)] hover:-translate-y-0.5",
                  "transition-all duration-200 text-center"
                )}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-violet-500/10 text-violet-500 border border-violet-500/15 group-hover:scale-110 transition-transform">
                  <Icon name="shield" size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Approval SLA</h3>
                  <p className="mt-1 text-xs text-[var(--fg-muted)] leading-relaxed">
                    Define how quickly each approver must act on approval requests
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* ── Policy form (team or approval) ── */
          <form onSubmit={handlePolicySubmit} className="space-y-6">
            {/* Basic Info */}
            <FormSection title="Basics">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Policy Name"
                  placeholder={policyForm.policy_type === "approval" ? "e.g., IT Approval Turnaround" : "e.g., High Priority SLA"}
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  required
                />
                <Textarea
                  label="Description"
                  placeholder="Describe when this policy applies..."
                  value={policyForm.description}
                  onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })}
                  rows={2}
                />
              </div>
            </FormSection>

            {/* Team SLA: Time Targets */}
            {policyForm.policy_type === "team" && (
              <FormSection title="Time Targets">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input
                      type="number" min="1" placeholder="60" label="Response Time (minutes)"
                      value={policyForm.response_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, response_minutes: parseInt(e.target.value) || 0 })}
                      required
                    />
                    <p className="text-xs text-[var(--fg-muted)] mt-1.5">= {formatMinutes(policyForm.response_minutes)}</p>
                  </div>
                  <div>
                    <Input
                      type="number" min="1" placeholder="480" label="Resolution Time (minutes)"
                      value={policyForm.resolve_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, resolve_minutes: parseInt(e.target.value) || 0 })}
                      required
                    />
                    <p className="text-xs text-[var(--fg-muted)] mt-1.5">= {formatMinutes(policyForm.resolve_minutes)}</p>
                  </div>
                </div>
              </FormSection>
            )}

            {/* Approval SLA: Mode Toggle + Stage Builder */}
            {policyForm.policy_type === "approval" && (
              <div className="space-y-6">
                {/* Mode toggle: Stage-Based vs Hierarchy-Based */}
                <FormSection title="Approval SLA Mode">
                  <div className={cn("flex gap-1 p-1 rounded-xl", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                    <button type="button"
                      onClick={() => setPolicyForm({ ...policyForm, approval_sla_mode: "stage" })}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                        policyForm.approval_sla_mode === "stage"
                          ? "bg-cyan-500/15 text-cyan-500 border border-cyan-500/25"
                          : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      <Icon name="settings" size={14} />
                      Stage-Based
                    </button>
                    <button type="button"
                      onClick={() => setPolicyForm({ ...policyForm, approval_sla_mode: "hierarchy" })}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                        policyForm.approval_sla_mode === "hierarchy"
                          ? "bg-amber-500/15 text-amber-500 border border-amber-500/25"
                          : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      <Icon name="users" size={14} />
                      Hierarchy-Based
                    </button>
                  </div>
                  <p className="text-xs text-[var(--fg-muted)] mt-2">
                    {policyForm.approval_sla_mode === "stage"
                      ? "Match approvers by approval level (1st, 2nd, 3rd...), approver type, and approval rule."
                      : "Match approvers by their position in the organization hierarchy (CEO, ExCo, Manager, etc.)."
                    }
                  </p>
                </FormSection>

                {/* Stage/Rule builder */}
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-label">
                        {policyForm.approval_sla_mode === "hierarchy" ? "Hierarchy Level Rules" : "Approval Stage Targets"}
                      </p>
                      <p className="text-xs text-[var(--fg-muted)] mt-1">
                        {policyForm.approval_sla_mode === "hierarchy"
                          ? "Define SLA targets by organizational hierarchy level. More specific rules take priority."
                          : "Define how quickly each approval stage must be completed. More specific rules take priority."
                        }
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={addStage} icon={<Icon name="plus" size={14} />}>
                      Add Rule
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {(policyForm.approval_stages || []).map((stage, idx) => (
                      <div key={stage._uid} className={cn(
                        "rounded-xl p-4 space-y-4",
                        "bg-[var(--bg-base)] border border-[var(--border-default)]",
                        !stage.is_active && "opacity-60"
                      )}>
                        {/* Stage header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                              policyForm.approval_sla_mode === "hierarchy"
                                ? "bg-amber-500/15 text-amber-500 border border-amber-500/25"
                                : "bg-violet-500/15 text-violet-500 border border-violet-500/25"
                            )}>
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-[var(--fg-primary)]">
                              {policyForm.approval_sla_mode === "hierarchy" ? "Hierarchy Rule" : "Stage Rule"} {idx + 1}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={stage.is_active}
                                onChange={(e) => updateStage(stage._uid, "is_active", e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-violet-500 focus:ring-violet-500" />
                              <span className="text-[11px] text-[var(--fg-muted)]">Active</span>
                            </label>
                            {(policyForm.approval_stages || []).length > 1 && (
                              <button type="button" onClick={() => removeStage(stage._uid)}
                                className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Matching criteria — different per mode */}
                        {policyForm.approval_sla_mode === "hierarchy" ? (
                          /* ── Hierarchy mode: Org Level matching ── */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-label mb-1.5">Organization Level</label>
                              <select value={stage.applies_to_org_level} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_org_level", e.target.value ? parseInt(e.target.value) : "")}>
                                <option value="">Any Org Level</option>
                                {ORG_LEVELS.map((l) => (
                                  <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-label mb-1.5">Scope</label>
                              <div className="flex items-center gap-3 h-[42px]">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox"
                                    checked={stage.applies_to_org_level_and_below}
                                    onChange={(e) => updateStage(stage._uid, "applies_to_org_level_and_below", e.target.checked)}
                                    disabled={!stage.applies_to_org_level}
                                    className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-amber-500 focus:ring-amber-500 disabled:opacity-40" />
                                  <span className={cn("text-sm", stage.applies_to_org_level ? "text-[var(--fg-primary)]" : "text-[var(--fg-muted)]")}>
                                    And below
                                  </span>
                                </label>
                              </div>
                              {stage.applies_to_org_level && stage.applies_to_org_level_and_below && (
                                <p className="text-[10px] text-amber-500 mt-1">
                                  Applies to {orgLevelShort(stage.applies_to_org_level)} and all levels below
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* ── Stage mode: Approval level + type + rule matching ── */
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-label mb-1.5">Approval Level</label>
                              <select value={stage.applies_to_approval_level} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_approval_level", e.target.value ? parseInt(e.target.value) : "")}>
                                <option value="">Any Level</option>
                                {[1, 2, 3, 4, 5].map((l) => (
                                  <option key={l} value={l}>Level {l}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-label mb-1.5">Approver Type</label>
                              <select value={stage.applies_to_approver_type} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_approver_type", e.target.value)}>
                                {APPROVER_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-label mb-1.5">Approval Rule</label>
                              <select value={stage.applies_to_approval_rule_id} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_approval_rule_id", e.target.value)}>
                                <option value="">Any Rule</option>
                                {approvalRules.map((r) => (
                                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Time targets row (same for both modes) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-label mb-1.5">Target Time (min)</label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="1" value={stage.target_minutes}
                                onChange={(e) => updateStage(stage._uid, "target_minutes", parseInt(e.target.value) || 60)} />
                              <span className="text-xs text-[var(--fg-muted)] whitespace-nowrap">= {formatMinutes(stage.target_minutes)}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-label mb-1.5">Warning (min before)</label>
                            <Input type="number" min="0" value={stage.warning_minutes}
                              onChange={(e) => updateStage(stage._uid, "warning_minutes", parseInt(e.target.value) || 0)} />
                          </div>
                          <div>
                            <label className="block text-label mb-1.5">On Breach</label>
                            <select value={stage.escalation_action} className={selectCls}
                              onChange={(e) => updateStage(stage._uid, "escalation_action", e.target.value)}>
                              {ESCALATION_ACTIONS.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Reassign user selector (only when escalation_action = 'reassign') */}
                        {stage.escalation_action === "reassign" && (
                          <div>
                            <label className="block text-label mb-1.5">Reassign To User</label>
                            <select value={stage.escalation_to_user_id} className={selectCls}
                              onChange={(e) => updateStage(stage._uid, "escalation_to_user_id", e.target.value)}>
                              <option value="">Select user...</option>
                              {agents.map((a) => (
                                <option key={a.id} value={String(a.id)}>{a.full_name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Info text about the escalation */}
                        <p className="text-[11px] text-[var(--fg-muted)] italic">
                          {ESCALATION_ACTIONS.find((a) => a.value === stage.escalation_action)?.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Applies To */}
            <FormSection title="Applies To">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Priority</label>
                  <select value={policyForm.applies_to_priority_id} className={selectCls}
                    onChange={(e) => setPolicyForm({ ...policyForm, applies_to_priority_id: e.target.value })}>
                    <option value="">All Priorities</option>
                    {priorities.map((p) => (
                      <option key={p.id} value={String(p.id)}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Team</label>
                  <select value={policyForm.applies_to_team_id} className={selectCls}
                    onChange={(e) => setPolicyForm({ ...policyForm, applies_to_team_id: e.target.value })}>
                    <option value="">All Teams</option>
                    {teams.map((t) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </FormSection>

            {/* Business Hours (team policies only) */}
            {policyForm.policy_type === "team" && (
              <FormSection title="Business Hours">
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={policyForm.use_business_hours}
                      onChange={(e) => setPolicyForm({ ...policyForm, use_business_hours: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--accent)] focus:ring-[var(--accent)]" />
                    <span className="text-sm text-[var(--fg-secondary)]">Calculate SLA using business hours only</span>
                  </label>
                  {policyForm.use_business_hours && (
                    <select value={policyForm.business_hours_id} className={selectCls}
                      onChange={(e) => setPolicyForm({ ...policyForm, business_hours_id: e.target.value })}>
                      <option value="">Default Business Hours</option>
                      {businessHours.map((bh) => (
                        <option key={bh.id} value={String(bh.id)}>{bh.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </FormSection>
            )}

            {/* Notifications (team policies only) */}
            {policyForm.policy_type === "team" && (
              <FormSection title="Notifications">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    type="number" min="0" placeholder="60" label="At-Risk Alert (minutes before breach)"
                    value={policyForm.notify_at_risk_minutes}
                    onChange={(e) => setPolicyForm({ ...policyForm, notify_at_risk_minutes: parseInt(e.target.value) || 0 })}
                  />
                  <Input
                    type="number" min="0" placeholder="Optional" label="Auto-Escalate After (minutes)"
                    value={policyForm.escalation_minutes}
                    onChange={(e) => setPolicyForm({ ...policyForm, escalation_minutes: e.target.value })}
                  />
                </div>
              </FormSection>
            )}

            {/* Default Policy */}
            <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors">
              <input type="checkbox" checked={policyForm.is_default}
                onChange={(e) => setPolicyForm({ ...policyForm, is_default: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] text-[var(--accent)] focus:ring-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">Set as Default Policy</p>
                <p className="text-xs text-[var(--fg-muted)]">
                  {policyForm.policy_type === "approval"
                    ? "This approval SLA will be used when no specific match is found for approval stages"
                    : "This policy will be used when no specific match is found"}
                </p>
              </div>
            </label>
          </form>
        )}
      </Modal>

      {/* Breach Check Results Modal */}
      <Modal
        open={!!breachResults}
        onClose={() => setBreachResults(null)}
        title="SLA Breach Check Complete"
        subtitle="Summary of detected breaches, warnings, and escalations"
        actions={<Button onClick={() => setBreachResults(null)}>Done</Button>}
      >
        {breachResults && (
          <div className="space-y-5">
            {/* Team SLA Results */}
            {breachResults.team && (
              <div>
                <p className="text-label mb-3">Team SLA</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Response Breaches", value: breachResults.team.responseBreaches ?? 0, icon: "clock", color: "text-amber-500", bg: "bg-amber-500/10" },
                    { label: "Resolve Breaches", value: breachResults.team.resolveBreaches ?? 0, icon: "alertTriangle", color: "text-rose-500", bg: "bg-rose-500/10" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)]">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", item.bg)}>
                        <Icon name={item.icon} size={20} className={item.color} />
                      </div>
                      <div>
                        <p className={cn("text-2xl font-semibold tabular-nums", item.color)}>{item.value}</p>
                        <p className="text-xs text-[var(--fg-muted)]">{item.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approval SLA Results */}
            {breachResults.approval && (
              <div>
                <p className="text-label mb-3">Approval SLA</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Breaches", value: breachResults.approval.breaches_marked ?? 0, icon: "xCircle", color: "text-rose-500", bg: "bg-rose-500/10" },
                    { label: "Warnings", value: breachResults.approval.warnings_sent ?? 0, icon: "alertTriangle", color: "text-amber-500", bg: "bg-amber-500/10" },
                    { label: "Escalations", value: breachResults.approval.escalations ?? 0, icon: "arrowUpRight", color: "text-orange-500", bg: "bg-orange-500/10" },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)]">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-2", item.bg)}>
                        <Icon name={item.icon} size={18} className={item.color} />
                      </div>
                      <p className={cn("text-2xl font-semibold tabular-nums", item.color)}>{item.value}</p>
                      <p className="text-xs text-[var(--fg-muted)]">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No results message */}
            {!breachResults.team && !breachResults.approval && (
              <EmptyState
                icon="checkCircle"
                tone="emerald"
                title="All clear"
                description="No SLA data to report."
                compact
              />
            )}
          </div>
        )}
      </Modal>

      {confirmDialog}
    </div>
  );
}

/* ─── Analytics helpers (derive donut from already-fetched stats) ─── */
function complianceDonut(stats, approvalSlaStats) {
  return [
    { name: "Response", key: "response", value: stats?.response_compliance_pct || 0, color: "#3B82F6" },
    { name: "Resolution", key: "resolution", value: stats?.resolve_compliance_pct || 0, color: "#10B981" },
    { name: "Approval", key: "approval", value: approvalSlaStats?.compliance_pct || 0, color: "#8B5CF6" },
  ];
}

function overallComplianceAvg(stats, approvalSlaStats) {
  const vals = [];
  if (stats?.response_compliance_pct != null) vals.push(stats.response_compliance_pct);
  if (stats?.resolve_compliance_pct != null) vals.push(stats.resolve_compliance_pct);
  if (approvalSlaStats?.compliance_pct != null) vals.push(approvalSlaStats.compliance_pct);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + Number(b), 0) / vals.length);
}

/* ─── Local presentational helpers (mirror reference-page primitives) ─── */

// Small bordered icon-button for header controls (matches tickets.jsx ControlButton)
function ControlButton({ title, onClick, active, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
        "bg-[var(--bg-elevated)] border",
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
      )}
    >
      {children}
    </button>
  );
}

// Tinted-icon section heading with a count badge
const SECTION_TINTS = {
  blue: "bg-blue-500/10 text-blue-500 border-blue-500/15",
  violet: "bg-violet-500/10 text-violet-500 border-violet-500/15",
};
function SectionTitle({ icon, tint = "blue", title, subtitle, count, countTone = "slate" }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("h-9 w-9 rounded-lg border flex items-center justify-center shrink-0", SECTION_TINTS[tint] || SECTION_TINTS.blue)}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--fg-muted)] mt-0.5">{subtitle}</p>}
      </div>
      <Badge tone={countTone} size="sm" className="ml-auto tabular-nums">{count}</Badge>
    </div>
  );
}

// Elevated rounded panel wrapper
function Panel({ children, className }) {
  return (
    <div className={cn(
      "rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden",
      className
    )}>
      {children}
    </div>
  );
}

const PANEL_HEADER_TINTS = {
  blue: "bg-blue-500/10 text-blue-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  violet: "bg-violet-500/10 text-violet-500",
  indigo: "bg-indigo-500/10 text-indigo-500",
};
function PanelHeader({ icon, tint = "blue", title, subtitle }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
      <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", PANEL_HEADER_TINTS[tint] || PANEL_HEADER_TINTS.blue)}>
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--fg-muted)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// Grouped form section with a small label heading
function FormSection({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-label">{title}</p>
      {children}
    </div>
  );
}

// Inline edit / delete row actions
function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onEdit} title="Edit"
        className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all">
        <Icon name="pencil" size={14} />
      </button>
      <button onClick={onDelete} title="Delete"
        className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all">
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

// Response/Resolution target tile inside a team policy card
const TARGET_TINTS = {
  blue: "bg-blue-500/10 text-blue-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
};
function TargetTile({ icon, tint, label, value }) {
  return (
    <div className="rounded-xl p-4 bg-[var(--bg-base)] border border-[var(--border-default)]">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center", TARGET_TINTS[tint] || TARGET_TINTS.blue)}>
          <Icon name={icon} size={14} />
        </span>
        <p className="text-label">{label}</p>
      </div>
      <p className="text-xl font-semibold text-[var(--fg-primary)] tabular-nums">{value}</p>
    </div>
  );
}

// Tracking tile that shows Met / Breached / time-remaining for a ticket SLA
function SlaStatusTile({ label, met, breached, time }) {
  return (
    <div className="rounded-xl p-4 bg-[var(--bg-base)] border border-[var(--border-default)]">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="clock" size={14} className="text-[var(--fg-muted)]" />
        <p className="text-label">{label}</p>
      </div>
      {met ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
          <Icon name="checkCircle" size={14} /> Met
        </span>
      ) : breached ? (
        <Badge tone="rose" size="sm">Breached</Badge>
      ) : time ? (
        <Badge tone={time.tone} size="sm">{time.text}</Badge>
      ) : (
        <span className="text-xs text-[var(--fg-muted)]">N/A</span>
      )}
    </div>
  );
}

// Analytics metric tile (Met / Breached / Pending etc.)
const METRIC_TONE = {
  emerald: "text-emerald-500",
  rose: "text-rose-500",
  amber: "text-amber-500",
  violet: "text-violet-500",
};
function MetricTile({ value, label, tone }) {
  return (
    <div className="text-center p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)]">
      <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", METRIC_TONE[tone] || "text-[var(--fg-primary)]")}>{value}</p>
      <p className="text-xs text-[var(--fg-muted)] mt-1">{label}</p>
    </div>
  );
}

// Overall-compliance progress bar
function ComplianceBar({ label, pct, from, to }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[var(--fg-secondary)]">{label}</span>
        <span className="text-sm font-semibold text-[var(--fg-primary)] tabular-nums">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--bg-base)] border border-[var(--border-default)] overflow-hidden">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out", from, to)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
