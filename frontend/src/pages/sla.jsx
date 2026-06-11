/**
 * SLA Management Page
 * Supports both Team SLA (resolution) and Approval SLA (approval stage) policies
 * - Card-based policy type selector (like ticket creation)
 * - Stage-based vs Hierarchy-based approval SLA modes
 * - Org hierarchy level matching with "X and below" option
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { slaApi } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Card, { StatCard } from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import { useAuth } from "../contexts/auth";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";

const policyTints = ["blue", "cyan", "teal", "indigo", "violet", "emerald"];
const trackingTints = ["indigo", "violet", "blue", "cyan", "teal", "emerald"];

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

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function SlaManagement() {
  const { user } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
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
      } else {
        await slaApi.createPolicy(payload);
      }
      setShowPolicyModal(false);
      loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePolicy(id) {
    // confirm removed - proceeding with deletion directly
    try {
      await slaApi.deletePolicy(id);
      loadData();
    } catch (error) {
      toast.error(error.message);
    }
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

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">SLA Management</h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">Service Level Agreement policies and tracking</p>
          </div>
          {isAdmin && view === "policies" && (
            <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
              Create Policy
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Tracked"
            value={stats.total_tickets || 0}
            color="blue"
            icon={<Icon name="ticket" size={18} />}
          />
          <StatCard
            label="Response Met"
            value={`${stats.response_compliance_pct || 0}%`}
            color="emerald"
            icon={<Icon name="clock" size={18} />}
          />
          <StatCard
            label="Resolve Met"
            value={`${stats.resolve_compliance_pct || 0}%`}
            color="teal"
            icon={<Icon name="check" size={18} />}
          />
          <StatCard
            label="Approval SLA"
            value={approvalSlaStats ? `${approvalSlaStats.compliance_pct}%` : "N/A"}
            color="violet"
            icon={<Icon name="shield" size={18} />}
          />
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex items-center justify-between">
        <div className={cn(
          "flex gap-1 p-1 rounded-lg",
          "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
        )}>
          {[
            { key: "policies", label: "Policies", icon: "settings" },
            { key: "tracking", label: "Tracking", icon: "clock" },
            { key: "approval-tracking", label: "Approval SLA", icon: "shield" },
            { key: "analytics", label: "Analytics", icon: "chart" },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setView(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all",
                view === tab.key
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
              )}>
              <Icon name={tab.icon} size={14} />
              {tab.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <Button variant="secondary" size="sm" onClick={handleCheckBreaches} loading={checkingBreaches}>
            Check Breaches
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
            <p className="text-sm text-[var(--fg-secondary)]">Loading SLA data...</p>
          </div>
        </div>
      ) : view === "policies" ? (
        /* ═══ POLICIES VIEW ═══ */
        <div className="space-y-6">
          {/* ── Team Policies Section ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Icon name="users" size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--fg-primary)]">Team / Resolution SLA</h2>
                <p className="text-xs text-[var(--fg-muted)]">How quickly teams must respond to and resolve tickets</p>
              </div>
              <Badge tone="blue" className="ml-auto">{teamPolicies.length}</Badge>
            </div>

            {teamPolicies.length === 0 ? (
              <div className={cn(
                "text-center py-14 rounded-xl",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                "shadow-[var(--shadow-card)]"
              )}>
                <Icon name="sla" size={28} className="text-[var(--fg-muted)] mx-auto mb-3" />
                <p className="text-sm text-[var(--fg-secondary)] mb-3">No team SLA policies yet</p>
                {isAdmin && (
                  <Button size="sm" onClick={openCreateModal} icon={<Icon name="plus" size={14} />}>
                    Create Policy
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {teamPolicies.map((policy, idx) => (
                  <Card key={policy.id} tint={policyTints[idx % policyTints.length]} spotlight hover>
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-[var(--fg-primary)]">{policy.name}</h3>
                          <Badge tone="blue">Team</Badge>
                        </div>
                        {policy.description && (
                          <p className="text-xs text-[var(--fg-secondary)] mt-1.5 leading-relaxed">{policy.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {policy.is_default === 1 && <Badge tone="brand">Default</Badge>}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(policy)}
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-all">
                              <Icon name="pencil" size={14} />
                            </button>
                            <button onClick={() => handleDeletePolicy(policy.id)}
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className={cn("rounded-lg p-4", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Icon name="clock" size={16} className="text-blue-400" />
                          </div>
                          <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Response</p>
                        </div>
                        <p className="text-2xl font-bold text-[var(--fg-primary)]">{formatMinutes(policy.response_minutes)}</p>
                      </div>
                      <div className={cn("rounded-lg p-4", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Icon name="check" size={16} className="text-emerald-400" />
                          </div>
                          <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Resolution</p>
                        </div>
                        <p className="text-2xl font-bold text-[var(--fg-primary)]">{formatMinutes(policy.resolve_minutes)}</p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)] flex flex-wrap gap-2">
                      {policy.priority_label && <Badge tone="amber">{policy.priority_label}</Badge>}
                      {policy.team_name && <Badge tone="violet">{policy.team_name}</Badge>}
                      {policy.use_business_hours === 1 && <Badge tone="blue">Business Hours</Badge>}
                      {policy.business_hours_name && <Badge tone="slate">{policy.business_hours_name}</Badge>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-default)]" />

          {/* ── Approval Policies Section ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Icon name="shield" size={18} className="text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--fg-primary)]">Approval SLA</h2>
                <p className="text-xs text-[var(--fg-muted)]">How quickly approvers must act on approval requests</p>
              </div>
              <Badge tone="violet" className="ml-auto">{approvalPolicies.length}</Badge>
            </div>

            {approvalPolicies.length === 0 ? (
              <div className={cn(
                "text-center py-14 rounded-xl",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                "shadow-[var(--shadow-card)]"
              )}>
                <Icon name="shield" size={28} className="text-[var(--fg-muted)] mx-auto mb-3" />
                <p className="text-sm text-[var(--fg-secondary)] mb-3">No approval SLA policies yet</p>
                {isAdmin && (
                  <Button size="sm" onClick={openCreateModal} icon={<Icon name="plus" size={14} />}>
                    Create Policy
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {approvalPolicies.map((policy, idx) => (
                  <Card key={policy.id} tint={policyTints[(idx + 3) % policyTints.length]} spotlight hover>
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-[var(--fg-primary)]">{policy.name}</h3>
                          <Badge tone="violet">Approval</Badge>
                          <Badge tone={policy.approval_sla_mode === "hierarchy" ? "amber" : "cyan"}>
                            {policy.approval_sla_mode === "hierarchy" ? "Hierarchy" : "Stage-based"}
                          </Badge>
                        </div>
                        {policy.description && (
                          <p className="text-xs text-[var(--fg-secondary)] mt-1.5 leading-relaxed">{policy.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {policy.is_default === 1 && <Badge tone="brand">Default</Badge>}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(policy)}
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-base)] transition-all">
                              <Icon name="pencil" size={14} />
                            </button>
                            <button onClick={() => handleDeletePolicy(policy.id)}
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Approval policy stages */}
                    <div className="space-y-3">
                      {(policy.approval_stages || []).map((stage, si) => (
                        <div key={si} className={cn(
                          "rounded-lg p-3",
                          "bg-[var(--bg-base)] border border-[var(--border-default)]",
                          !stage.is_active && "opacity-50"
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold",
                                "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                              )}>
                                {si + 1}
                              </div>
                              {/* Show different info depending on mode */}
                              {policy.approval_sla_mode === "hierarchy" ? (
                                <span className="text-xs font-medium text-[var(--fg-primary)]">
                                  {stage.applies_to_org_level
                                    ? `${orgLevelShort(stage.applies_to_org_level)}${stage.applies_to_org_level_and_below ? " & below" : ""}`
                                    : "Any Org Level"}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-[var(--fg-primary)]">
                                  {stage.applies_to_approval_level ? `Level ${stage.applies_to_approval_level}` : "Any Level"}
                                </span>
                              )}
                              {stage.applies_to_approver_type && (
                                <Badge tone="slate">{stage.applies_to_approver_type.replace(/_/g, " ")}</Badge>
                              )}
                            </div>
                            <span className="text-lg font-bold text-[var(--fg-primary)]">{formatMinutes(stage.target_minutes)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[var(--fg-muted)]">
                            <span>Warning: {formatMinutes(stage.warning_minutes)}</span>
                            <span className="text-[var(--border-default)]">|</span>
                            <span>On breach: {ESCALATION_ACTIONS.find((a) => a.value === stage.escalation_action)?.label || stage.escalation_action}</span>
                            {stage.approval_rule_name && (
                              <>
                                <span className="text-[var(--border-default)]">|</span>
                                <span>Rule: {stage.approval_rule_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 mt-3 border-t border-[var(--border-default)] flex flex-wrap gap-2">
                      {policy.priority_label && <Badge tone="amber">{policy.priority_label}</Badge>}
                      {policy.team_name && <Badge tone="violet">{policy.team_name}</Badge>}
                      <Badge tone="violet">
                        {(policy.approval_stages || []).length} stage{(policy.approval_stages || []).length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : view === "tracking" ? (
        /* ═══ TEAM SLA TRACKING ═══ */
        <div className="space-y-5">
          <div className={cn(
            "flex gap-1 p-1 rounded-lg w-fit",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
          )}>
            {[
              { key: "all", label: "All Tickets" },
              { key: "active", label: "Active" },
              { key: "at_risk", label: "At Risk" },
              { key: "breached", label: "Breached" },
              { key: "paused", label: "Paused" },
            ].map((f) => (
              <button key={f.key} onClick={() => setSlaFilter(f.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all",
                  slaFilter === f.key
                    ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
                )}>
                {f.label}
              </button>
            ))}
          </div>

          {ticketSlas.length === 0 ? (
            <div className={cn(
              "text-center py-20 rounded-xl",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
              "shadow-[var(--shadow-card)]"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
                "bg-[var(--bg-base)] border border-[var(--border-default)]"
              )}>
                <Icon name="sla" size={32} className="text-[var(--fg-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No SLA tracked tickets</p>
              <p className="text-sm text-[var(--fg-secondary)]">
                {slaFilter === "breached" ? "No breached SLAs - great job!" : "All tickets are meeting their SLA targets"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ticketSlas.map((sla, idx) => {
                const responseTime = getTimeRemaining(sla.response_due_at, !!sla.paused_at);
                const resolveTime = getTimeRemaining(sla.resolve_due_at, !!sla.paused_at);
                return (
                  <Card key={sla.ticket_id} tint={trackingTints[idx % trackingTints.length]} spotlight hover className="cursor-pointer"
                    onClick={() => navigate(`/tickets/${sla.ticket_id}`)}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className={cn("text-xs font-mono font-medium px-2 py-1 rounded", "bg-[var(--bg-base)] text-[var(--fg-muted)]")}>
                            {sla.ticket_number}
                          </span>
                          <Badge tone="slate">{sla.status_label}</Badge>
                          {sla.paused_at && <Badge tone="amber">Paused</Badge>}
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-1">{sla.subject}</h3>
                        {sla.assignee_name && (
                          <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5">
                            <Icon name="user" size={12} />
                            Assigned to {sla.assignee_name}
                          </p>
                        )}
                      </div>
                      <Badge tone="blue">{sla.policy_name}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className={cn("rounded-lg p-4", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon name="clock" size={14} className="text-[var(--fg-muted)]" />
                          <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Response SLA</p>
                        </div>
                        {sla.response_met_at ? (
                          <div className="flex items-center gap-1.5">
                            <Icon name="check" size={14} className="text-emerald-400" />
                            <span className="text-xs text-emerald-400 font-semibold">Met</span>
                          </div>
                        ) : sla.response_breached ? (
                          <Badge tone="rose">Breached</Badge>
                        ) : responseTime ? (
                          <Badge tone={responseTime.tone}>{responseTime.text}</Badge>
                        ) : (
                          <span className="text-xs text-[var(--fg-muted)]">N/A</span>
                        )}
                      </div>
                      <div className={cn("rounded-lg p-4", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon name="check" size={14} className="text-[var(--fg-muted)]" />
                          <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Resolution SLA</p>
                        </div>
                        {sla.resolve_met_at ? (
                          <div className="flex items-center gap-1.5">
                            <Icon name="check" size={14} className="text-emerald-400" />
                            <span className="text-xs text-emerald-400 font-semibold">Met</span>
                          </div>
                        ) : sla.resolve_breached ? (
                          <Badge tone="rose">Breached</Badge>
                        ) : resolveTime ? (
                          <Badge tone={resolveTime.tone}>{resolveTime.text}</Badge>
                        ) : (
                          <span className="text-xs text-[var(--fg-muted)]">N/A</span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : view === "approval-tracking" ? (
        /* ═══ APPROVAL SLA TRACKING ═══ */
        <div className="space-y-5">
          <div className={cn(
            "flex gap-1 p-1 rounded-lg w-fit",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
          )}>
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "at_risk", label: "At Risk" },
              { key: "breached", label: "Breached" },
              { key: "met", label: "Met" },
            ].map((f) => (
              <button key={f.key} onClick={() => setApprovalSlaFilter(f.key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-md transition-all",
                  approvalSlaFilter === f.key
                    ? "bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
                )}>
                {f.label}
              </button>
            ))}
          </div>

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
                <div key={s.label} className={cn(
                  "rounded-lg p-3 text-center",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
                )}>
                  <p className={`text-2xl font-bold text-${s.tone}-400`}>{s.value}</p>
                  <p className="text-[11px] text-[var(--fg-muted)] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {approvalSlaList.length === 0 ? (
            <div className={cn(
              "text-center py-20 rounded-xl",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
                "bg-[var(--bg-base)] border border-[var(--border-default)]"
              )}>
                <Icon name="shield" size={32} className="text-[var(--fg-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No approval SLAs tracked</p>
              <p className="text-sm text-[var(--fg-secondary)]">
                Approval SLAs will appear here when tickets with approval policies are created
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvalSlaList.map((sla, idx) => {
                const timeLeft = getTimeRemaining(sla.due_at, !!sla.paused_at);
                const statusLabel = sla.met ? "Met" : sla.breached ? "Breached" : sla.paused_at ? "Paused" : "Active";
                const statusColor = sla.met ? "emerald" : sla.breached ? "rose" : sla.paused_at ? "slate" : "blue";

                return (
                  <Card key={sla.id} tint={trackingTints[idx % trackingTints.length]} spotlight hover
                    className="cursor-pointer" onClick={() => navigate(`/tickets/${sla.ticket_id}`)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn("text-xs font-mono font-medium px-2 py-1 rounded", "bg-[var(--bg-base)] text-[var(--fg-muted)]")}>
                            {sla.ticket_number}
                          </span>
                          <Badge tone="violet">Level {sla.approval_level}</Badge>
                          <Badge tone={statusColor}>{statusLabel}</Badge>
                          {sla.escalated ? <Badge tone="rose">Escalated</Badge> : null}
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-1">{sla.subject}</h3>
                        <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5">
                          <Icon name="user" size={12} />
                          Approver: {sla.approver_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-[var(--fg-muted)] mb-1">Target</p>
                        <p className="text-lg font-bold text-[var(--fg-primary)]">{formatMinutes(sla.target_minutes)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-[var(--fg-muted)]">
                        {sla.policy_name && <span>{sla.policy_name}</span>}
                        {sla.applies_to_approver_type && (
                          <Badge tone="slate">{sla.applies_to_approver_type.replace(/_/g, " ")}</Badge>
                        )}
                        <span>{sla.approval_status}</span>
                      </div>
                      <div>
                        {sla.met ? (
                          <div className="flex items-center gap-1.5">
                            <Icon name="check" size={14} className="text-emerald-400" />
                            <span className="text-xs text-emerald-400 font-semibold">Completed on time</span>
                          </div>
                        ) : sla.breached ? (
                          <Badge tone="rose">SLA Breached</Badge>
                        ) : timeLeft ? (
                          <Badge tone={timeLeft.tone}>{timeLeft.text} remaining</Badge>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══ ANALYTICS VIEW ═══ */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Response SLA */}
            <Card tint="blue" spotlight hover={false}>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Icon name="clock" size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Response SLA</h3>
                  <p className="text-xs text-[var(--fg-muted)]">First response compliance</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-emerald-400">{stats?.response_met || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Met</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-rose-400">{stats?.response_breached || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Breached</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-amber-400">{stats?.response_pending || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Pending</p>
                </div>
              </div>
              {stats?.avg_response_time_minutes && (
                <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                  <p className="text-xs text-[var(--fg-muted)]">Average Response Time</p>
                  <p className="text-lg font-semibold text-[var(--fg-primary)]">
                    {formatMinutes(Math.round(stats.avg_response_time_minutes))}
                  </p>
                </div>
              )}
            </Card>

            {/* Resolution SLA */}
            <Card tint="emerald" spotlight hover={false}>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Icon name="check" size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Resolution SLA</h3>
                  <p className="text-xs text-[var(--fg-muted)]">Ticket resolution compliance</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-emerald-400">{stats?.resolve_met || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Met</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-rose-400">{stats?.resolve_breached || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Breached</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-amber-400">{stats?.resolve_pending || 0}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Pending</p>
                </div>
              </div>
              {stats?.avg_resolve_time_minutes && (
                <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                  <p className="text-xs text-[var(--fg-muted)]">Average Resolution Time</p>
                  <p className="text-lg font-semibold text-[var(--fg-primary)]">
                    {formatMinutes(Math.round(stats.avg_resolve_time_minutes))}
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Approval SLA Compliance */}
          {approvalSlaStats && approvalSlaStats.total > 0 && (
            <Card tint="violet" spotlight hover={false}>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Icon name="shield" size={20} className="text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Approval SLA Compliance</h3>
                  <p className="text-xs text-[var(--fg-muted)]">How quickly approvers respond</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-emerald-400">{approvalSlaStats.met}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Met</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-rose-400">{approvalSlaStats.breached}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Breached</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                  <p className="text-3xl font-bold text-violet-400">{approvalSlaStats.escalated}</p>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">Escalated</p>
                </div>
              </div>
              {approvalSlaStats.avg_completion_minutes && (
                <div className="pt-4 border-t border-[var(--border-default)]">
                  <p className="text-xs text-[var(--fg-muted)]">Average Approval Time</p>
                  <p className="text-lg font-semibold text-[var(--fg-primary)]">
                    {formatMinutes(approvalSlaStats.avg_completion_minutes)}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Overall Compliance */}
          <Card tint="indigo" spotlight hover={false}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Icon name="chart" size={20} className="text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Overall Compliance</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--fg-secondary)]">Response</span>
                  <span className="text-sm font-semibold text-[var(--fg-primary)]">{stats?.response_compliance_pct || 0}%</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-default)] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                    style={{ width: `${stats?.response_compliance_pct || 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--fg-secondary)]">Resolution</span>
                  <span className="text-sm font-semibold text-[var(--fg-primary)]">{stats?.resolve_compliance_pct || 0}%</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-default)] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${stats?.resolve_compliance_pct || 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--fg-secondary)]">Approval</span>
                  <span className="text-sm font-semibold text-[var(--fg-primary)]">{approvalSlaStats?.compliance_pct || 0}%</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-default)] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                    style={{ width: `${approvalSlaStats?.compliance_pct || 0}%` }} />
                </div>
              </div>
            </div>
          </Card>
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
                <Button variant="ghost" onClick={() => setCreatePolicyType(null)} className="mr-auto">
                  <Icon name="arrow-left" size={14} className="mr-1" />
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
          <div className="space-y-6">
            <p className="text-sm text-[var(--fg-secondary)] text-center">
              What type of SLA policy do you want to create?
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Team Policy Card */}
              <button
                type="button"
                onClick={() => selectCreatePolicyType("team")}
                className={cn(
                  "group relative flex flex-col items-center gap-4 p-6 rounded-xl",
                  "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                  "hover:border-blue-500/50 hover:bg-[var(--bg-surface-hover)]",
                  "transition-all duration-200 text-left"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center",
                  "bg-blue-500/10 text-blue-400",
                  "group-hover:bg-blue-500/20 transition-colors"
                )}>
                  <Icon name="users" size={24} />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Team / Resolution SLA</h3>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Define how quickly a team must respond to and resolve tickets
                  </p>
                </div>
              </button>

              {/* Approval Policy Card */}
              <button
                type="button"
                onClick={() => selectCreatePolicyType("approval")}
                className={cn(
                  "group relative flex flex-col items-center gap-4 p-6 rounded-xl",
                  "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                  "hover:border-violet-500/50 hover:bg-[var(--bg-surface-hover)]",
                  "transition-all duration-200 text-left"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center",
                  "bg-violet-500/10 text-violet-400",
                  "group-hover:bg-violet-500/20 transition-colors"
                )}>
                  <Icon name="shield" size={24} />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Approval SLA</h3>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
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

            {/* Team SLA: Time Targets */}
            {policyForm.policy_type === "team" && (
              <div>
                <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Time Targets</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Response Time (minutes)</label>
                    <Input type="number" min="1" placeholder="60"
                      value={policyForm.response_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, response_minutes: parseInt(e.target.value) || 0 })}
                      required />
                    <p className="text-xs text-[var(--fg-muted)] mt-1">= {formatMinutes(policyForm.response_minutes)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Resolution Time (minutes)</label>
                    <Input type="number" min="1" placeholder="480"
                      value={policyForm.resolve_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, resolve_minutes: parseInt(e.target.value) || 0 })}
                      required />
                    <p className="text-xs text-[var(--fg-muted)] mt-1">= {formatMinutes(policyForm.resolve_minutes)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Approval SLA: Mode Toggle + Stage Builder */}
            {policyForm.policy_type === "approval" && (
              <div className="space-y-5">
                {/* Mode toggle: Stage-Based vs Hierarchy-Based */}
                <div>
                  <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Approval SLA Mode</h4>
                  <div className={cn("flex gap-1 p-1 rounded-lg", "bg-[var(--bg-base)] border border-[var(--border-default)]")}>
                    <button type="button"
                      onClick={() => setPolicyForm({ ...policyForm, approval_sla_mode: "stage" })}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all",
                        policyForm.approval_sla_mode === "stage"
                          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                          : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      <Icon name="settings" size={14} />
                      Stage-Based
                    </button>
                    <button type="button"
                      onClick={() => setPolicyForm({ ...policyForm, approval_sla_mode: "hierarchy" })}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all",
                        policyForm.approval_sla_mode === "hierarchy"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
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
                </div>

                {/* Stage/Rule builder */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-medium text-[var(--fg-primary)]">
                        {policyForm.approval_sla_mode === "hierarchy" ? "Hierarchy Level Rules" : "Approval Stage Targets"}
                      </h4>
                      <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                        {policyForm.approval_sla_mode === "hierarchy"
                          ? "Define SLA targets by organizational hierarchy level. More specific rules take priority."
                          : "Define how quickly each approval stage must be completed. More specific rules take priority."
                        }
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={addStage}
                      icon={<Icon name="plus" size={14} />}>
                      Add Rule
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {(policyForm.approval_stages || []).map((stage, idx) => (
                      <div key={stage._uid} className={cn(
                        "rounded-xl p-4 space-y-4",
                        "bg-[var(--bg-base)] border border-[var(--border-default)]",
                        !stage.is_active && "opacity-50"
                      )}>
                        {/* Stage header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                              policyForm.approval_sla_mode === "hierarchy"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                            )}>
                              {idx + 1}
                            </div>
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
                                className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                                <Icon name="trash" size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Matching criteria — different per mode */}
                        {policyForm.approval_sla_mode === "hierarchy" ? (
                          /* ── Hierarchy mode: Org Level matching ── */
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                                Organization Level
                              </label>
                              <select value={stage.applies_to_org_level} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_org_level", e.target.value ? parseInt(e.target.value) : "")}>
                                <option value="">Any Org Level</option>
                                {ORG_LEVELS.map((l) => (
                                  <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                                Scope
                              </label>
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
                                <p className="text-[10px] text-amber-400 mt-1">
                                  Applies to {orgLevelShort(stage.applies_to_org_level)} and all levels below
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* ── Stage mode: Approval level + type + rule matching ── */
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                                Approval Level
                              </label>
                              <select value={stage.applies_to_approval_level} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_approval_level", e.target.value ? parseInt(e.target.value) : "")}>
                                <option value="">Any Level</option>
                                {[1, 2, 3, 4, 5].map((l) => (
                                  <option key={l} value={l}>Level {l}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                                Approver Type
                              </label>
                              <select value={stage.applies_to_approver_type} className={selectCls}
                                onChange={(e) => updateStage(stage._uid, "applies_to_approver_type", e.target.value)}>
                                {APPROVER_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                                Approval Rule
                              </label>
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
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                              Target Time (min)
                            </label>
                            <div className="flex items-center gap-2">
                              <Input type="number" min="1" value={stage.target_minutes}
                                onChange={(e) => updateStage(stage._uid, "target_minutes", parseInt(e.target.value) || 60)} />
                              <span className="text-xs text-[var(--fg-muted)] whitespace-nowrap">= {formatMinutes(stage.target_minutes)}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                              Warning (min before)
                            </label>
                            <Input type="number" min="0" value={stage.warning_minutes}
                              onChange={(e) => updateStage(stage._uid, "warning_minutes", parseInt(e.target.value) || 0)} />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                              On Breach
                            </label>
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
                            <label className="block text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1.5">
                              Reassign To User
                            </label>
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
            <div>
              <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Applies To</h4>
              <div className="grid grid-cols-2 gap-4">
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
            </div>

            {/* Business Hours (team policies only) */}
            {policyForm.policy_type === "team" && (
              <div>
                <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Business Hours</h4>
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
              </div>
            )}

            {/* Notifications (team policies only) */}
            {policyForm.policy_type === "team" && (
              <div>
                <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">Notifications</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">At-Risk Alert (minutes before breach)</label>
                    <Input type="number" min="0" placeholder="60"
                      value={policyForm.notify_at_risk_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, notify_at_risk_minutes: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Auto-Escalate After (minutes)</label>
                    <Input type="number" min="0" placeholder="Optional"
                      value={policyForm.escalation_minutes}
                      onChange={(e) => setPolicyForm({ ...policyForm, escalation_minutes: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* Default Policy */}
            <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
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
                <p className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-3">Team SLA</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Response Breaches", value: breachResults.team.responseBreaches ?? 0, icon: "clock", color: "text-amber-400", bg: "bg-amber-400/10" },
                    { label: "Resolve Breaches", value: breachResults.team.resolveBreaches ?? 0, icon: "alert-triangle", color: "text-rose-400", bg: "bg-rose-400/10" },
                  ].map((item) => (
                    <div key={item.label} className={cn(
                      "flex items-center gap-3 p-4 rounded-lg",
                      "bg-[var(--bg-base)] border border-[var(--border-default)]"
                    )}>
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", item.bg)}>
                        <Icon name={item.icon} size={20} className={item.color} />
                      </div>
                      <div>
                        <p className={cn("text-2xl font-bold", item.color)}>{item.value}</p>
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
                <p className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-3">Approval SLA</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Breaches", value: breachResults.approval.breaches_marked ?? 0, icon: "x-circle", color: "text-rose-400", bg: "bg-rose-400/10" },
                    { label: "Warnings", value: breachResults.approval.warnings_sent ?? 0, icon: "alert-triangle", color: "text-amber-400", bg: "bg-amber-400/10" },
                    { label: "Escalations", value: breachResults.approval.escalations ?? 0, icon: "arrow-up-right", color: "text-orange-400", bg: "bg-orange-400/10" },
                  ].map((item) => (
                    <div key={item.label} className={cn(
                      "text-center p-4 rounded-lg",
                      "bg-[var(--bg-base)] border border-[var(--border-default)]"
                    )}>
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-2", item.bg)}>
                        <Icon name={item.icon} size={18} className={item.color} />
                      </div>
                      <p className={cn("text-2xl font-bold", item.color)}>{item.value}</p>
                      <p className="text-xs text-[var(--fg-muted)]">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No results message */}
            {!breachResults.team && !breachResults.approval && (
              <div className="text-center py-6">
                <Icon name="check-circle" size={40} className="text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-[var(--fg-secondary)]">No SLA data to report.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
