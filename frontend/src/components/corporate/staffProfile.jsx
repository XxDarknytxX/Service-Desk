/**
 * Corporate delivery-staff profile — shared by People and Hierarchy.
 *
 * A corporate person's position comes from their team (its corporate_role) and
 * whether they manage it; their reporting line sets their level and escalation
 * layers. Two kinds of team are HIERARCHY teams rather than work queues:
 *
 *   business   commercial teams under the CCO (Corporate ICT Team, Corporate
 *              Sales Central) — a head and members, no position tags; their
 *              cards show their job title
 *   executive  CTO / CCO / CEO — the "Executive" tag, no head position
 *
 * Their people never take tickets and keep the internal desk.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import Input, { Select, SearchableSelect } from "../ui/Input";
import useConfirm from "../ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export const LAYER_ROLES = ["business", "executive"];
export const isLayerRole = (role) => LAYER_ROLES.includes(role);

// [member, manager / head] choice in the staff form for each team role. The tag
// on cards and lists comes from the API (`label`) — business teams have none.
export const POSITION_NAMES = {
  queue: ["Delivery Engineer", "Delivery Manager"],
  triage: ["Triage Engineer (NOC)", "Triage Manager (NOC)"],
  service_delivery: ["Service Delivery Executive", "Service Delivery Manager"],
  business: ["Team member", "Head"],
  executive: ["Executive", "Executive"],
};
export const POSITION_TONE = { queue: "blue", triage: "amber", service_delivery: "violet", executive: "rose" };

/** "Delivery Manager · Cloud", or just "Executive" when the team is named for the position. */
export const positionText = (p, sep = " · ") => (p.label === p.team_name ? p.label : `${p.label}${sep}${p.team_name}`);

/** One-line description of where someone sits: their tagged positions, else job title and team. */
export function describePerson(person, sep = " · ") {
  const positions = person.positions || [];
  const tagged = positions.filter((p) => p.label).map((p) => positionText(p, sep));
  if (tagged.length) return tagged.join(", ");
  return [person.title, ...positions.map((p) => p.team_name)].filter(Boolean).join(sep);
}

export function ago(ts) {
  if (!ts) return "Never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function until(ts) {
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

export function StatusBadge({ person }) {
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
export function AccessSection({ form, setForm }) {
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

/**
 * Account actions for an existing person: resend onboarding / send reset,
 * activate / deactivate. `onChanged` reloads the caller's list.
 */
export function useAccountActions(onChanged) {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  function resendInvite(p) {
    confirm({
      title: "Resend onboarding email?",
      message: <>A new set-password link will be emailed to <strong className="text-[var(--fg-primary)]">{p.email}</strong>. Any earlier invitation link stops working.</>,
      confirmText: "Resend invitation",
      onConfirm: async () => {
        try {
          const r = await api(`/corporate/people/${p.id}/onboarding`, { method: "POST" });
          toast.success(r.message || "Invitation sent");
          onChanged?.();
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
          onChanged?.();
        } catch (err) { toast.error(err.message || "Couldn't update"); }
      },
    });
  }

  return { resendInvite, sendReset, toggleActive, confirmDialog };
}

/**
 * Add / edit a delivery staff member: details, where they sit in the hierarchy
 * (reports to → team, position, level), and — when editing — their account.
 *
 *   open      boolean
 *   person    the staff record being edited (from /corporate/people?type=staff), or null to add
 *   staff     every staff record, for manager choices and the chain preview
 *   teams     corporate teams (meta.teams)
 *   onClose   () => void
 *   onSaved   () => void   — reload; called after a save and after account actions
 */
export function StaffProfileModal({ open, person, staff, teams, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const account = useAccountActions(onSaved);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  /** New engineers report to their team's manager by default. */
  function defaultManagerFor(teamId, isLead) {
    if (isLead || !teamId) return "";
    const lead = staff.find((s) => (s.positions || []).some((p) => p.team_id === Number(teamId) && p.is_lead));
    return lead ? String(lead.id) : "";
  }

  // Fresh form each time the modal opens (or switches person). Keyed on the id
  // so a list reload while it's open doesn't wipe unsaved edits.
  useEffect(() => {
    if (!open) return;
    const primary = person?.positions?.[0];
    const teamId = primary?.team_id || teams.find((t) => t.corporate_role === "queue")?.id || teams[0]?.id || "";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.id]);

  const editingTeam = teams.find((t) => String(t.id) === String(form.team_id));
  // The Executive team has no head / manager position.
  const noLead = editingTeam?.corporate_role === "executive";
  const positionNames = POSITION_NAMES[editingTeam?.corporate_role] || ["Team Member", "Team Manager"];

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

  // People below the person being edited can't become their manager (loop).
  const blockedManagers = useMemo(() => {
    const out = new Set();
    if (!person?.id) return out;
    let frontier = [person.id];
    while (frontier.length) {
      const next = staff.filter((s) => frontier.includes(s.manager_id) && !out.has(s.id)).map((s) => s.id);
      next.forEach((id) => out.add(id));
      frontier = next;
    }
    return out;
  }, [staff, person?.id]);

  const managerOptions = staff
    .filter((s) => s.is_active && s.id !== person?.id && !blockedManagers.has(s.id))
    .sort((a, b) => (a.org_level || 1) - (b.org_level || 1) || a.full_name.localeCompare(b.full_name))
    .map((s) => ({
      value: String(s.id),
      label: s.full_name,
      subtitle: [`Level ${s.org_level || 1}`, describePerson(s)].filter(Boolean).join(" · "),
    }));

  const chainPreview = open ? chainFrom(form.manager_id, person?.id) : [];
  const placementLevel = form.manager_id ? (staffById.get(Number(form.manager_id))?.org_level || 1) + 1 : 1;
  const teamLeadOther = staff.find(
    (s) => s.id !== person?.id && (s.positions || []).some((p) => String(p.team_id) === String(form.team_id) && p.is_lead)
  );
  const directReports = person ? staff.filter((s) => s.manager_id === person.id) : [];
  const positionLabel = positionNames[form.is_lead && !noLead ? 1 : 0];

  /**
   * Place someone by choosing who they report to. Reporting to a team manager
   * makes them an engineer in that manager's team; reporting to someone who
   * doesn't run a team (a head of department, say) makes them a team manager —
   * unless their team already has one. Team and position stay editable.
   */
  function placeUnder(managerId) {
    setForm((f) => {
      const next = { ...f, manager_id: managerId };
      if (!managerId) return next;
      const mgr = staffById.get(Number(managerId));
      const ledTeams = (mgr?.positions || []).filter((p) => p.is_lead && !isLayerRole(p.corporate_role));
      if (ledTeams.length) {
        const sameTeam = ledTeams.find((p) => String(p.team_id) === String(f.team_id));
        next.team_id = String((sameTeam || ledTeams[0]).team_id);
        next.is_lead = false;
      } else {
        const hasLead = staff.some((s) => s.id !== person?.id && (s.positions || []).some((p) => String(p.team_id) === String(f.team_id) && p.is_lead));
        next.is_lead = !hasLead;
      }
      return next;
    });
  }

  async function save() {
    if (!form.full_name?.trim()) return toast.error("Full name is required");
    if (!form.email?.trim()) return toast.error("Email is required");
    if (!form.team_id) return toast.error("Choose a team");
    if (!person && !form.send_onboarding && !form.password) return toast.error("Set a password, or email them a link instead");

    const placement = {
      team_id: Number(form.team_id),
      is_lead: noLead ? false : form.is_lead,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
    };
    setSaving(true);
    try {
      if (person) {
        await api(`/corporate/people/${person.id}`, {
          method: "PATCH",
          body: { full_name: form.full_name, email: form.email, title: form.title, phone: form.phone, ...placement },
        });
        toast.success("Changes saved");
      } else {
        const res = await api("/corporate/people/staff", {
          method: "POST",
          body: {
            full_name: form.full_name, email: form.email, title: form.title, phone: form.phone,
            send_onboarding: form.send_onboarding,
            ...(form.send_onboarding ? {} : { password: form.password }),
            ...placement,
          },
        });
        if (res.onboarding?.requested && res.onboarding.sent) {
          toast.success(`Account created — a set-password email is on its way to ${res.email}`);
        } else if (res.onboarding?.requested) {
          toast.warning(`Account created, but the invitation email failed: ${res.onboarding.error} You can resend it from the list.`, 9000);
        } else {
          toast.success("Account created");
        }
      }
      onClose();
      onSaved?.();
    } catch (err) {
      toast.error(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={person ? person.full_name : "Add delivery staff"}
        subtitle={person ? [describePerson(person), person.email].filter(Boolean).join(" · ") : "Staff work corporate requests. Their team sets their position; their manager sets the escalation layers."}
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>
              {person ? "Save changes" : form.send_onboarding ? "Create & send invite" : "Create account"}
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
              <span className="text-sm font-medium text-[var(--fg-primary)]">{positionLabel}</span>
              {editingTeam?.name !== positionLabel && (
                <span className="text-xs text-[var(--fg-muted)]">{editingTeam?.name || "No team"}</span>
              )}
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
                    manager_id: f.manager_id || person ? f.manager_id : defaultManagerFor(teamId, f.is_lead),
                  }));
                }}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Position</label>
                {noLead ? (
                  // Executives have no member / manager split; their level
                  // comes purely from who they report to.
                  <div className="px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[13px] text-[var(--fg-primary)]">
                    Executive <span className="text-[var(--fg-muted)]">· also has the internal desk</span>
                  </div>
                ) : (
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
                )}
                {!noLead && form.is_lead && teamLeadOther && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    {editingTeam?.name} already has a {positionNames[1].toLowerCase()} ({teamLeadOther.full_name}).
                  </p>
                )}
              </div>
            </div>

            {person && directReports.length > 0 && (
              <p className="text-xs text-[var(--fg-muted)]">
                {directReports.length === 1 ? "1 person reports" : `${directReports.length} people report`} to {person.full_name.split(" ")[0]} (
                {directReports.map((p) => p.full_name).join(", ")}) — they move with them.
              </p>
            )}
          </div>

          {person ? (
            <div className="rounded-xl border border-[var(--border-default)] p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-label">Account</p>
                <StatusBadge person={person} />
                <span className="text-xs text-[var(--fg-muted)]">Last sign-in {ago(person.last_login_at).toLowerCase()}</span>
                <div className="sm:ml-auto flex flex-wrap items-center gap-2">
                  {person.is_active && (person.must_set_password ? (
                    <Button size="sm" variant="secondary" onClick={() => account.resendInvite(person)} icon={<Icon name="send" size={14} />}>
                      Resend invite
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => account.sendReset(person)} icon={<Icon name="key" size={14} />}>
                      Send password reset
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => account.toggleActive(person)}
                    icon={<Icon name={person.is_active ? "lock" : "lockOpen"} size={14} />}
                  >
                    {person.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <AccessSection form={form} setForm={setForm} />
          )}
        </div>
      </Modal>
      {account.confirmDialog}
    </>
  );
}
