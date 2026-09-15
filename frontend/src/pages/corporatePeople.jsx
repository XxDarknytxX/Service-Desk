/**
 * People — Corporate Service Desk
 *
 * The corporate side has its own model of people, distinct from the internal
 * desk's admin / agent / requester roles:
 *
 *   Customers       raise requests for their company.
 *   Delivery staff  work requests. Their position comes from their team —
 *                   Delivery Engineer / Manager, Triage Engineer / Manager (NOC),
 *                   Service Delivery Executive / Manager, and the Heads (no tag)
 *                   and Executive layers — and their reporting line sets the
 *                   escalation layers (L1 = direct manager, …). The staff form
 *                   lives in components/corporate/staffProfile.jsx, shared with
 *                   the Hierarchy page.
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
import Input, { SearchableSelect } from "../components/ui/Input";
import {
  POSITION_TONE, describePerson, ago, StatusBadge, AccessSection, useAccountActions, StaffProfileModal,
} from "../components/corporate/staffProfile";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function CorporatePeople() {
  const toast = useToast();
  const { meta } = useMeta();

  const [tab, setTab] = useState("customers");
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [caps, setCaps] = useState({ can_manage_customers: false, can_manage_staff: false });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [editing, setEditing] = useState(null); // customer form: null | { person? }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  // Staff profile: null | { id } (edit) | { id: null } (add). The record is looked
  // up from the live list so account actions refresh what the modal shows.
  const [staffEditor, setStaffEditor] = useState(null);

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
    const matchQ = !q || [p.full_name, p.email, p.company, p.title, ...(p.positions || []).flatMap((x) => [x.label, x.team_name])]
      .filter(Boolean).some((v) => v.toLowerCase().includes(q));
    const matchS = statusFilter === "all" ? true : statusFilter === "active" ? !!p.is_active : !p.is_active;
    return matchQ && matchS;
  });
  const canManage = tab === "customers" ? caps.can_manage_customers : caps.can_manage_staff;
  const invitedCount = list.filter((p) => p.is_active && p.must_set_password).length;

  // ── Escalation-chain preview for the quick reporting-line change ─────────
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
    setEditing({ person });
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

  // ── Save (customers) ──────────────────────────────────────────────────────
  async function save() {
    const { person } = editing;
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.email.trim()) return toast.error("Email is required");
    if (!form.company.trim()) return toast.error("Company is required");
    if (!person && !form.send_onboarding && !form.password) return toast.error("Set a password, or email them a link instead");

    setSaving(true);
    try {
      const body = { full_name: form.full_name, email: form.email, title: form.title, phone: form.phone, company: form.company };
      if (person) {
        await api(`/corporate/people/${person.id}`, { method: "PATCH", body });
        toast.success("Changes saved");
      } else {
        const res = await api("/corporate/people/customers", {
          method: "POST",
          body: { ...body, send_onboarding: form.send_onboarding, ...(form.send_onboarding ? {} : { password: form.password }) },
        });
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
  const { resendInvite, sendReset, toggleActive, confirmDialog } = useAccountActions(load);
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
                <Button onClick={() => setStaffEditor({ id: null })} icon={<Icon name="userPlus" size={16} />}>Add delivery staff</Button>
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
                            {(p.positions || []).some((pos) => pos.label) ? (
                              (p.positions || []).filter((pos) => pos.label).map((pos) => (
                                <span key={pos.team_id} className="inline-flex items-center gap-1.5 flex-wrap">
                                  <Badge tone={POSITION_TONE[pos.corporate_role] || "slate"} size="sm">{pos.label}</Badge>
                                  <span className="text-xs text-[var(--fg-muted)]">{pos.team_name !== pos.label ? pos.team_name : ""}</span>
                                </span>
                              ))
                            ) : (
                              // Business teams carry no tag — show job title and team.
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                <span className="text-[var(--fg-secondary)]">{p.title || "—"}</span>
                                <span className="text-xs text-[var(--fg-muted)]">{(p.positions || []).map((pos) => pos.team_name).join(", ")}</span>
                              </span>
                            )}
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
                            onClick={() => (tab === "customers" ? openCustomer(p) : setStaffEditor({ id: p.id }))}
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
        open={!!editing}
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

      {/* ── Delivery staff profile (shared with Hierarchy) ── */}
      <StaffProfileModal
        open={!!staffEditor}
        person={staffEditor?.id ? staffById.get(staffEditor.id) || null : null}
        staff={staff}
        teams={teams}
        onClose={() => setStaffEditor(null)}
        onSaved={load}
      />

      {/* ── Quick reporting-line change ── */}
      <Modal
        open={!!reportingFor}
        onClose={() => setReportingFor(null)}
        title="Who do they report to?"
        subtitle={reportingFor ? [reportingFor.full_name, describePerson(reportingFor, ", ")].filter(Boolean).join(" · ") : ""}
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
                      subtitle: [`Level ${s.org_level || 1}`, describePerson(s)].filter(Boolean).join(" · "),
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
