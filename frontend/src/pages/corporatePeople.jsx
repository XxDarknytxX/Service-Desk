/**
 * People — Corporate Service Desk
 *
 * The corporate side has its own model of people, distinct from the internal
 * desk's admin / agent / requester roles:
 *
 *   Customers       raise requests for their company.
 *   Delivery staff  work requests. Their position comes from their team —
 *                   Delivery Engineer / Manager, Triage Engineer / Manager (NOC),
 *                   Service Delivery Executive / Manager — and their reporting
 *                   line sets the escalation layers (L1 = direct manager, …).
 *
 * New accounts are emailed a link to set their own password by default (the
 * "Email a set-password link" box); an invitation can be resent until it's
 * used, after which a password reset is offered instead. Admins manage
 * everyone; Service Delivery manages customers; other staff can look.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonTable } from "../components/ui/Skeleton";
import Input, { Select, SearchableSelect } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const POSITION_NAMES = {
  queue: ["Delivery Engineer", "Delivery Manager"],
  triage: ["Triage Engineer (NOC)", "Triage Manager (NOC)"],
  service_delivery: ["Service Delivery Executive", "Service Delivery Manager"],
};
const POSITION_TONE = { queue: "blue", triage: "amber", service_delivery: "violet" };

function ago(ts) {
  if (!ts) return "Never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function until(ts) {
  if (!ts) return null;
  const ms = new Date(ts).getTime() - Date.now();
  if (ms <= 0) return "expired";
  // Round UP: a link sent a minute ago has "3d left", not "2d".
  const h = Math.ceil(ms / 3600000);
  return h > 24 ? `${Math.ceil(ms / 86400000)}d left` : `${Math.max(1, h)}h left`;
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  let pw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  if (!/[0-9]/.test(pw)) pw = pw.slice(0, -1) + "7";
  if (!/[A-Za-z]/.test(pw)) pw = "K" + pw.slice(1);
  return pw;
}

function StatusBadge({ person }) {
  if (!person.is_active) return <Badge tone="slate" size="sm">Inactive</Badge>;
  if (person.must_set_password) {
    const left = until(person.invite_expires_at);
    return (
      <Badge tone="amber" size="sm" dot>
        Invited{left ? ` · ${left === "expired" ? "link expired" : left}` : " · no active link"}
      </Badge>
    );
  }
  return <Badge tone="emerald" size="sm" dot>Active</Badge>;
}

/** Email-a-link vs set-a-password, shown when creating any account. */
function AccessSection({ form, setForm }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4 space-y-3">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          checked={form.send_onboarding}
          onChange={(e) => setForm({ ...form, send_onboarding: e.target.checked, password: "" })}
        />
        <span>
          <span className="block text-sm font-medium text-[var(--fg-primary)]">Email a link to set their password</span>
          <span className="block text-xs text-[var(--fg-tertiary)] mt-0.5">
            They receive a welcome email and choose their own password. The link works once and lasts 3 days — you can resend it.
          </span>
        </span>
      </label>
      {!form.send_onboarding && (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Password"
                type="text"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters, a letter and a number"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setForm({ ...form, password: generatePassword() })}>
              Generate
            </Button>
          </div>
          <p className="text-xs text-amber-600 flex items-start gap-1.5">
            <Icon name="alertTriangle" size={13} className="mt-0.5 shrink-0" />
            You'll need to share this password securely. Emailing a set-password link is safer.
          </p>
        </div>
      )}
    </div>
  );
}

export default function CorporatePeople() {
  const toast = useToast();
  const { meta } = useMeta();
  const { confirm, confirmDialog } = useConfirm();

  const [tab, setTab] = useState("customers");
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [caps, setCaps] = useState({ can_manage_customers: false, can_manage_staff: false });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [editing, setEditing] = useState(null); // null | { kind, person? }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Corporate teams (the API scopes meta to the app on screen).
  const teams = useMemo(() => (meta?.teams || []).filter((t) => t.workspace === "corporate"), [meta]);

  async function load() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        api("/corporate/people?type=customers"),
        api("/corporate/people?type=staff"),
      ]);
      setCustomers(c.items || []);
      setStaff(s.items || []);
      setCaps({ can_manage_customers: !!c.can_manage_customers, can_manage_staff: !!c.can_manage_staff });
    } catch (err) {
      toast.error(err.message || "Failed to load people");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = tab === "customers" ? customers : staff;
  const filtered = list.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || [p.full_name, p.email, p.company, p.title, ...(p.positions || []).map((x) => `${x.label} ${x.team_name}`)]
      .filter(Boolean).some((v) => v.toLowerCase().includes(q));
    const matchS = statusFilter === "all" ? true : statusFilter === "active" ? !!p.is_active : !p.is_active;
    return matchQ && matchS;
  });
  const canManage = tab === "customers" ? caps.can_manage_customers : caps.can_manage_staff;
  const invitedCount = list.filter((p) => p.is_active && p.must_set_password).length;

  // ── Escalation-chain preview for the staff form ──────────────────────────
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  function chainFrom(managerId, selfId) {
    const out = [];
    const seen = new Set([selfId]);
    let cur = managerId ? Number(managerId) : null;
    while (cur && !seen.has(cur) && out.length < 10) {
      seen.add(cur);
      const p = staffById.get(cur);
      if (!p) break;
      out.push(p);
      cur = p.manager_id;
    }
    return out;
  }

  // ── Open forms ────────────────────────────────────────────────────────────
  function openCustomer(person = null) {
    setEditing({ kind: "customer", person });
    setForm({
      full_name: person?.full_name || "",
      email: person?.email || "",
      title: person?.title || "",
      company: person?.company || "",
      phone: person?.phone || "",
      send_onboarding: true,
      password: "",
    });
  }

  function openStaff(person = null) {
    const primary = person?.positions?.[0];
    const teamId = primary?.team_id || teams.find((t) => t.corporate_role === "queue")?.id || teams[0]?.id || "";
    setEditing({ kind: "staff", person });
    setForm({
      full_name: person?.full_name || "",
      email: person?.email || "",
      title: person?.title || "",
      phone: person?.phone || "",
      team_id: teamId ? String(teamId) : "",
      is_lead: !!primary?.is_lead,
      manager_id: person ? (person.manager_id ? String(person.manager_id) : "") : defaultManagerFor(teamId, false),
      send_onboarding: true,
      password: "",
    });
  }

  /** New engineers report to their team's manager by default. */
  function defaultManagerFor(teamId, isLead) {
    if (isLead || !teamId) return "";
    const lead = staff.find((s) => (s.positions || []).some((p) => p.team_id === Number(teamId) && p.is_lead));
    return lead ? String(lead.id) : "";
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    const { kind, person } = editing;
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.email.trim()) return toast.error("Email is required");
    if (kind === "customer" && !form.company.trim()) return toast.error("Company is required");
    if (kind === "staff" && !form.team_id) return toast.error("Choose a team");
    if (!person && !form.send_onboarding && !form.password) return toast.error("Set a password, or email them a link instead");

    setSaving(true);
    try {
      if (person) {
        const body = { full_name: form.full_name, email: form.email, title: form.title, phone: form.phone };
        if (kind === "customer") body.company = form.company;
        if (kind === "staff") {
          body.team_id = Number(form.team_id);
          body.is_lead = form.is_lead;
          body.manager_id = form.manager_id ? Number(form.manager_id) : null;
        }
        await api(`/corporate/people/${person.id}`, { method: "PATCH", body });
        toast.success("Changes saved");
      } else {
        const body = {
          full_name: form.full_name, email: form.email, title: form.title, phone: form.phone,
          send_onboarding: form.send_onboarding,
          ...(form.send_onboarding ? {} : { password: form.password }),
        };
        if (kind === "customer") body.company = form.company;
        if (kind === "staff") {
          body.team_id = Number(form.team_id);
          body.is_lead = form.is_lead;
          body.manager_id = form.manager_id ? Number(form.manager_id) : null;
        }
        const res = await api(kind === "customer" ? "/corporate/people/customers" : "/corporate/people/staff", { method: "POST", body });
        if (res.onboarding?.requested && res.onboarding.sent) {
          toast.success(`Account created — a set-password email is on its way to ${res.email}`);
        } else if (res.onboarding?.requested) {
          toast.warning(`Account created, but the invitation email failed: ${res.onboarding.error} You can resend it from the list.`, 9000);
        } else {
          toast.success("Account created");
        }
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  // ── Row actions ───────────────────────────────────────────────────────────
  function resendInvite(p) {
    confirm({
      title: "Resend onboarding email?",
      message: <>A new set-password link will be emailed to <strong className="text-[var(--fg-primary)]">{p.email}</strong>. Any earlier invitation link stops working.</>,
      confirmText: "Resend invitation",
      onConfirm: async () => {
        try {
          const r = await api(`/corporate/people/${p.id}/onboarding`, { method: "POST" });
          toast.success(r.message || "Invitation sent");
          load();
        } catch (err) { toast.error(err.message || "Couldn't resend"); }
      },
    });
  }

  function sendReset(p) {
    confirm({
      title: "Send password reset?",
      message: <>A single-use reset link will be emailed to <strong className="text-[var(--fg-primary)]">{p.email}</strong>. Their current password keeps working until they use it.</>,
      confirmText: "Send reset link",
      onConfirm: async () => {
        try {
          const r = await api(`/corporate/people/${p.id}/reset-password`, { method: "POST" });
          toast.success(r.message || "Reset link sent");
        } catch (err) { toast.error(err.message || "Couldn't send reset"); }
      },
    });
  }

  function toggleActive(p) {
    const next = !p.is_active;
    confirm({
      title: next ? "Activate account?" : "Deactivate account?",
      message: next
        ? <><strong className="text-[var(--fg-primary)]">{p.full_name}</strong> will be able to sign in again.</>
        : <><strong className="text-[var(--fg-primary)]">{p.full_name}</strong> is signed out everywhere and can't sign in. Their requests and history are kept.</>,
      confirmText: next ? "Activate" : "Deactivate",
      onConfirm: async () => {
        try {
          await api(`/corporate/people/${p.id}`, { method: "PATCH", body: { is_active: next } });
          toast.success(next ? "Account activated" : "Account deactivated");
          load();
        } catch (err) { toast.error(err.message || "Couldn't update"); }
      },
    });
  }

  const editingTeam = teams.find((t) => String(t.id) === String(form.team_id));
  const positionNames = POSITION_NAMES[editingTeam?.corporate_role] || ["Team Member", "Team Manager"];
  // ── Quick "change reporting line" from the table ─────────────────────────
  const [reportingFor, setReportingFor] = useState(null);
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [savingReporting, setSavingReporting] = useState(false);

  function openReporting(person) {
    setReportingFor(person);
    setReportingManagerId(person.manager_id ? String(person.manager_id) : "");
  }

  async function saveReporting() {
    setSavingReporting(true);
    try {
      await api(`/corporate/people/${reportingFor.id}`, {
        method: "PATCH",
        body: { manager_id: reportingManagerId ? Number(reportingManagerId) : null },
      });
      toast.success(`${reportingFor.full_name.split(" ")[0]} now ${reportingManagerId ? `reports to ${staffById.get(Number(reportingManagerId))?.full_name}` : "sits at the top of the chain"}`);
      setReportingFor(null);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't change reporting line");
    } finally {
      setSavingReporting(false);
    }
  }

  const reportingBlocked = useMemo(() => {
    const out = new Set();
    if (!reportingFor) return out;
    let frontier = [reportingFor.id];
    while (frontier.length) {
      const next = staff.filter((s) => frontier.includes(s.manager_id) && !out.has(s.id)).map((s) => s.id);
      next.forEach((id) => out.add(id));
      frontier = next;
    }
    return out;
  }, [staff, reportingFor]);

  // People below the person being edited can't become their manager (loop).
  const blockedManagers = useMemo(() => {
    const selfId = editing?.person?.id;
    const out = new Set();
    if (!selfId) return out;
    let frontier = [selfId];
    while (frontier.length) {
      const next = staff.filter((s) => frontier.includes(s.manager_id) && !out.has(s.id)).map((s) => s.id);
      next.forEach((id) => out.add(id));
      frontier = next;
    }
    return out;
  }, [staff, editing]);

  const managerOptions = staff
    .filter((s) => s.is_active && s.id !== editing?.person?.id && !blockedManagers.has(s.id))
    .sort((a, b) => (a.org_level || 1) - (b.org_level || 1) || a.full_name.localeCompare(b.full_name))
    .map((s) => ({
      value: String(s.id),
      label: s.full_name,
      subtitle: `Level ${s.org_level || 1} · ${(s.positions || []).map((p) => `${p.label} · ${p.team_name}`).join(", ")}`,
    }));
  const chainPreview = editing?.kind === "staff" ? chainFrom(form.manager_id, editing?.person?.id) : [];

  // Level they'll sit at: one below their manager, or 1 at the top.
  const placementLevel = form.manager_id ? (staffById.get(Number(form.manager_id))?.org_level || 1) + 1 : 1;
  const teamLeadOther = editing?.kind === "staff"
    ? staff.find((s) => s.id !== editing?.person?.id && (s.positions || []).some((p) => String(p.team_id) === String(form.team_id) && p.is_lead))
    : null;
  const directReports = editing?.person ? staff.filter((s) => s.manager_id === editing.person.id) : [];

  /**
   * Place someone by choosing who they report to. Reporting to a team manager
   * makes them an engineer in that manager's team; reporting to someone who
   * doesn't run a team (a head of delivery, say) makes them a team manager —
   * unless their team already has one. Team and position stay editable.
   */
  function placeUnder(managerId) {
    setForm((f) => {
      const next = { ...f, manager_id: managerId };
      if (!managerId) return next;
      const mgr = staffById.get(Number(managerId));
      const ledTeams = (mgr?.positions || []).filter((p) => p.is_lead);
      if (ledTeams.length) {
        const sameTeam = ledTeams.find((p) => String(p.team_id) === String(f.team_id));
        next.team_id = String((sameTeam || ledTeams[0]).team_id);
        next.is_lead = false;
      } else {
        const hasLead = staff.some((s) => s.id !== editing?.person?.id && (s.positions || []).some((p) => String(p.team_id) === String(f.team_id) && p.is_lead));
        next.is_lead = !hasLead;
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon="users"
        title="People"
        subtitle="Corporate customers and the delivery staff who serve them"
        actions={
          tab === "customers"
            ? caps.can_manage_customers && (
                <Button onClick={() => openCustomer()} icon={<Icon name="userPlus" size={16} />}>Add customer</Button>
              )
            : caps.can_manage_staff && (
                <Button onClick={() => openStaff()} icon={<Icon name="userPlus" size={16} />}>Add delivery staff</Button>
              )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
          {[
            { key: "customers", label: "Customers", icon: "building", count: customers.length },
            { key: "staff", label: "Delivery Staff", icon: "teams", count: staff.length },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                tab === t.key ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
              )}
            >
              <Icon name={t.icon} size={15} className={tab === t.key ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
              {t.label}
              <span className="text-[11px] tabular-nums text-[var(--fg-muted)]">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
          {["active", "inactive", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[13px] font-medium capitalize transition-all",
                statusFilter === s ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {invitedCount > 0 && (
          <Badge tone="amber" size="sm" dot>{invitedCount} awaiting activation</Badge>
        )}

        <div className="ml-auto relative w-full sm:w-72">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "customers" ? "Search name, email or company…" : "Search name, email, team or position…"}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="p-4"><SkeletonTable rows={6} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={tab === "customers" ? "building" : "teams"}
            title={search ? "No matches" : tab === "customers" ? "No customers yet" : "No delivery staff yet"}
            description={search ? "Try a different search." : canManage ? "Add the first one to get started." : "Nothing to show."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface)]/40">
                  <th className="px-4 py-3 text-left text-label">{tab === "customers" ? "Customer" : "Person"}</th>
                  {tab === "customers" ? (
                    <>
                      <th className="px-4 py-3 text-left text-label">Company</th>
                      <th className="px-4 py-3 text-left text-label hidden lg:table-cell">Position</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left text-label">Position</th>
                      <th className="px-4 py-3 text-left text-label hidden lg:table-cell">Reports to</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-label">Status</th>
                  <th className="px-4 py-3 text-left text-label hidden md:table-cell">Last sign-in</th>
                  {canManage && <th className="px-4 py-3 text-right text-label">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-surface)]/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn(
                          "h-9 w-9 rounded-full text-xs font-semibold flex items-center justify-center shrink-0",
                          tab === "customers" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-blue-500/10 text-blue-500"
                        )}>
                          {(p.full_name || p.email || "?")[0].toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--fg-primary)] truncate">{p.full_name}</p>
                          <p className="text-xs text-[var(--fg-muted)] truncate">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    {tab === "customers" ? (
                      <>
                        <td className="px-4 py-3 text-[var(--fg-secondary)]">{p.company || "—"}</td>
                        <td className="px-4 py-3 text-[var(--fg-secondary)] hidden lg:table-cell">{p.title || "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {(p.positions || []).map((pos) => (
                              <span key={pos.team_id} className="inline-flex items-center gap-1.5 flex-wrap">
                                <Badge tone={POSITION_TONE[pos.corporate_role] || "slate"} size="sm">{pos.label}</Badge>
                                <span className="text-xs text-[var(--fg-muted)]">{pos.team_name}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {(() => {
                            const label = p.manager_name ? (
                              <span className="text-[var(--fg-secondary)]">{p.manager_name}</span>
                            ) : p.outside_manager ? (
                              <span className="text-xs text-[var(--fg-muted)]" title="This reporting line crosses into the internal desk, so escalation stops here.">
                                Top · reports outside Corporate to {p.outside_manager.full_name}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--fg-muted)]">Top of chain</span>
                            );
                            return (
                              <div className="flex items-center gap-2">
                                <Badge tone="slate" size="sm">Level {p.org_level || 1}</Badge>
                                {caps.can_manage_staff ? (
                                  <button
                                    onClick={() => openReporting(p)}
                                    className="group inline-flex items-center gap-1 text-left hover:text-[var(--accent)]"
                                    title="Change who they report to"
                                  >
                                    {label}
                                    <Icon name="pencil" size={11} className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100" />
                                  </button>
                                ) : label}
                              </div>
                            );
                          })()}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge person={p} /></td>
                    <td className="px-4 py-3 text-[var(--fg-muted)] whitespace-nowrap hidden md:table-cell">{ago(p.last_login_at)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => (tab === "customers" ? openCustomer(p) : openStaff(p))}
                            className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]"
                            title="Edit"
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          {p.is_active && (p.must_set_password ? (
                            <button
                              onClick={() => resendInvite(p)}
                              className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/10"
                              title="Resend onboarding email"
                            >
                              <Icon name="send" size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => sendReset(p)}
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-blue-500 hover:bg-blue-500/10"
                              title="Send password reset email"
                            >
                              <Icon name="key" size={15} />
                            </button>
                          ))}
                          <button
                            onClick={() => toggleActive(p)}
                            className={cn("p-2 rounded-lg text-[var(--fg-muted)]", p.is_active ? "hover:text-amber-500 hover:bg-amber-500/10" : "hover:text-emerald-500 hover:bg-emerald-500/10")}
                            title={p.is_active ? "Deactivate" : "Activate"}
                          >
                            <Icon name={p.is_active ? "lock" : "lockOpen"} size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Customer form ── */}
      <Modal
        open={editing?.kind === "customer"}
        onClose={() => setEditing(null)}
        title={editing?.person ? "Edit customer" : "Add customer"}
        subtitle={editing?.person ? editing.person.email : "Customers raise and track requests for their company."}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {editing?.person ? "Save changes" : form.send_onboarding ? "Create & send invite" : "Create customer"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full name" value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Company" value={form.company || ""} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Fiji Water" />
            <Input label="Position" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. IT Manager" />
            <Input label="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          {!editing?.person && <AccessSection form={form} setForm={setForm} />}
        </div>
      </Modal>

      {/* ── Delivery staff form ── */}
      <Modal
        open={editing?.kind === "staff"}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.person ? "Edit delivery staff" : "Add delivery staff"}
        subtitle={editing?.person ? editing.person.email : "Staff work corporate requests. Their team sets their position; their manager sets the escalation layers."}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {editing?.person ? "Save changes" : form.send_onboarding ? "Create & send invite" : "Create account"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full name" value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Job title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Cloud Engineer" />
            <Input label="Phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-4">
            <div>
              <p className="text-label">Where they sit in the hierarchy</p>
              <p className="text-xs text-[var(--fg-tertiary)] mt-1">
                Pick who they report to — their team, position and level follow from that. Adjust below if needed.
              </p>
            </div>

            <SearchableSelect
              label="Reports to (next level up)"
              value={form.manager_id || ""}
              onChange={(e) => placeUnder(e.target.value)}
              options={[
                { value: "", label: "No one — top of the chain", subtitle: "Level 1 · final approver for escalations" },
                ...managerOptions,
              ]}
              placeholder="No one — top of the chain"
              searchPlaceholder="Search by name, team or position…"
            />

            {/* The resulting placement, in plain words. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] px-3 py-2.5">
              <Badge tone="blue" size="sm">Level {placementLevel}</Badge>
              <span className="text-sm font-medium text-[var(--fg-primary)]">{positionNames[form.is_lead ? 1 : 0]}</span>
              <span className="text-xs text-[var(--fg-muted)]">{editingTeam?.name || "No team"}</span>
              <span className="text-xs text-[var(--fg-secondary)] sm:ml-auto flex items-center gap-1 flex-wrap">
                {chainPreview.length === 0 ? (
                  "Top of the escalation chain"
                ) : (
                  <>
                    Escalates to
                    {chainPreview.map((p, i) => (
                      <span key={p.id} className="inline-flex items-center gap-1">
                        {i > 0 && <Icon name="chevronRight" size={11} className="text-[var(--fg-muted)]" />}
                        <span className="font-medium text-[var(--fg-primary)]">{p.full_name.split(" ")[0]}</span>
                      </span>
                    ))}
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Team"
                value={form.team_id || ""}
                onChange={(e) => {
                  const teamId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    team_id: teamId,
                    // Only suggest a manager while none has been chosen.
                    manager_id: f.manager_id || editing?.person ? f.manager_id : defaultManagerFor(teamId, f.is_lead),
                  }));
                }}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Position</label>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                  {[false, true].map((lead) => (
                    <button
                      key={String(lead)}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, is_lead: lead }))}
                      className={cn(
                        "px-2 py-1.5 rounded-md text-[12px] font-medium transition-all",
                        form.is_lead === lead ? "bg-[var(--accent)] text-white" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      {positionNames[lead ? 1 : 0]}
                    </button>
                  ))}
                </div>
                {form.is_lead && teamLeadOther && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    {editingTeam?.name} already has a manager ({teamLeadOther.full_name}).
                  </p>
                )}
              </div>
            </div>

            {editing?.person && directReports.length > 0 && (
              <p className="text-xs text-[var(--fg-muted)]">
                {directReports.length === 1 ? "1 person reports" : `${directReports.length} people report`} to {editing.person.full_name.split(" ")[0]} (
                {directReports.map((p) => p.full_name).join(", ")}) — they move with them.
              </p>
            )}
          </div>

          {!editing?.person && <AccessSection form={form} setForm={setForm} />}
        </div>
      </Modal>

      {/* ── Quick reporting-line change ── */}
      <Modal
        open={!!reportingFor}
        onClose={() => setReportingFor(null)}
        title="Who do they report to?"
        subtitle={reportingFor ? `${reportingFor.full_name} · ${(reportingFor.positions || []).map((p) => `${p.label}, ${p.team_name}`).join(" · ")}` : ""}
        actions={
          <>
            <Button variant="secondary" onClick={() => setReportingFor(null)}>Cancel</Button>
            <Button onClick={saveReporting} loading={savingReporting}>Save</Button>
          </>
        }
      >
        {reportingFor && (() => {
          const chain = chainFrom(reportingManagerId, reportingFor.id);
          const level = reportingManagerId ? (staffById.get(Number(reportingManagerId))?.org_level || 1) + 1 : 1;
          const below = staff.filter((s) => s.manager_id === reportingFor.id);
          return (
            <div className="space-y-4">
              <SearchableSelect
                label="Reports to (next level up)"
                value={reportingManagerId}
                onChange={(e) => setReportingManagerId(e.target.value)}
                options={[
                  { value: "", label: "No one — top of the chain", subtitle: "Level 1 · final approver for escalations" },
                  ...staff
                    .filter((s) => s.is_active && s.id !== reportingFor.id && !reportingBlocked.has(s.id))
                    .sort((a, b) => (a.org_level || 1) - (b.org_level || 1) || a.full_name.localeCompare(b.full_name))
                    .map((s) => ({
                      value: String(s.id),
                      label: s.full_name,
                      subtitle: `Level ${s.org_level || 1} · ${(s.positions || []).map((p) => `${p.label} · ${p.team_name}`).join(", ")}`,
                    })),
                ]}
                placeholder="No one — top of the chain"
                searchPlaceholder="Search by name, team or position…"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] px-3 py-2.5">
                <Badge tone="blue" size="sm">Level {level}</Badge>
                <span className="text-xs text-[var(--fg-secondary)] flex items-center gap-1 flex-wrap">
                  {chain.length === 0 ? "Top of the escalation chain" : (
                    <>
                      Escalates to
                      {chain.map((p, i) => (
                        <span key={p.id} className="inline-flex items-center gap-1">
                          {i > 0 && <Icon name="chevronRight" size={11} className="text-[var(--fg-muted)]" />}
                          <span className="font-medium text-[var(--fg-primary)]">{p.full_name.split(" ")[0]}</span>
                        </span>
                      ))}
                    </>
                  )}
                </span>
              </div>
              {reportingFor.outside_manager && (
                <p className="text-xs text-amber-600">Currently reports to {reportingFor.outside_manager.full_name}, outside the corporate desk.</p>
              )}
              {below.length > 0 && (
                <p className="text-xs text-[var(--fg-muted)]">
                  {below.map((b) => b.full_name).join(", ")} {below.length === 1 ? "reports" : "report"} to {reportingFor.full_name.split(" ")[0]} and will move with them.
                </p>
              )}
            </div>
          );
        })()}
      </Modal>

      {confirmDialog}
    </div>
  );
}
