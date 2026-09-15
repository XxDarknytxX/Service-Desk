/**
 * Hierarchy — Corporate Service Desk
 *
 * The corporate reporting structure, ported from the internal desk's org chart
 * but self-contained: only corporate delivery staff appear, and a manager must
 * be corporate staff. The chain is also the escalation ladder for requests — an
 * engineer escalates to their L1 manager, who can pass it to L2, and so on.
 *
 * Reporting lines that still point into the internal desk (e.g. a team manager
 * who reports to an internal executive) end the corporate chain there; they are
 * listed so an admin can re-point them.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import { SearchableSelect } from "../components/ui/Input";
import OrgChart from "../components/OrgChart";

const POSITION_TONE = { queue: "blue", triage: "amber", service_delivery: "violet", executive: "rose" };
// "Delivery Manager · Cloud", but just "Executive" when the team is named for the position.
const positionText = (p, sep = " · ") => (p.label === p.team_name ? p.label : `${p.label}${sep}${p.team_name}`);

function Stat({ icon, label, value, hint, tone = "text-[var(--accent)] bg-[var(--accent)]/10" }) {
  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-label">{label}</p>
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--fg-primary)] tabular-nums">{value}</p>
      {hint && <p className="text-xs text-[var(--fg-muted)] mt-0.5">{hint}</p>}
    </div>
  );
}

export default function CorporateHierarchy() {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [links, setLinks] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [managerId, setManagerId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api("/corporate/hierarchy");
      setPeople(data.users || []);
      setLinks(data.hierarchy || []);
      setCanEdit(!!data.can_edit);
    } catch (err) {
      toast.error(err.message || "Failed to load hierarchy");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Decorate for OrgChart: show position instead of access role, plus level.
  const chartUsers = useMemo(
    () =>
      people.map((p) => ({
        ...p,
        position_label: p.positions?.[0]?.label,
        position_tone: POSITION_TONE[p.positions?.[0]?.corporate_role],
      })),
    [people]
  );

  const maxLevel = people.reduce((m, p) => Math.max(m, p.org_level || 1), 0);
  const tops = people.filter((p) => !p.manager_id);
  const outside = people.filter((p) => p.outside_manager);

  function chainFrom(id, selfId) {
    const out = [];
    const seen = new Set([selfId]);
    let cur = id ? Number(id) : null;
    while (cur && !seen.has(cur) && out.length < 10) {
      seen.add(cur);
      const p = byId.get(cur);
      if (!p) break;
      out.push(p);
      cur = p.manager_id;
    }
    return out;
  }

  // People below someone can't become their manager (it would loop).
  function descendantsOf(id) {
    const out = new Set();
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const l of links) if (frontier.includes(l.manager_id) && !out.has(l.user_id)) { out.add(l.user_id); next.push(l.user_id); }
      frontier = next;
    }
    return out;
  }

  function openEdit(person) {
    if (!canEdit) return;
    setEditing(person);
    setManagerId(person.manager_id ? String(person.manager_id) : "");
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/corporate/people/${editing.id}`, {
        method: "PATCH",
        body: { manager_id: managerId ? Number(managerId) : null },
      });
      toast.success("Reporting line updated");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't update reporting line");
    } finally {
      setSaving(false);
    }
  }

  const blocked = editing ? descendantsOf(editing.id) : new Set();
  const options = editing
    ? [
        { value: "", label: "No one — top of the escalation chain" },
        ...people
          .filter((p) => p.id !== editing.id && !blocked.has(p.id))
          .map((p) => ({
            value: String(p.id),
            label: p.full_name,
            subtitle: (p.positions || []).map((x) => positionText(x)).join(", "),
          })),
      ]
    : [];
  const preview = editing ? chainFrom(managerId, editing.id) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        icon="sitemap"
        title="Hierarchy"
        subtitle="Who corporate staff report to — and so who approves each escalation layer"
        actions={
          <button
            onClick={load}
            title="Refresh"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          >
            <Icon name="refresh" size={16} />
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" rounded="rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon="users" label="Delivery staff" value={people.length} />
          <Stat icon="sitemap" label="Levels" value={maxLevel} hint="Deepest escalation chain" tone="text-blue-500 bg-blue-500/10" />
          <Stat icon="arrowUp" label="Top of chain" value={tops.length} hint="Final approvers" tone="text-violet-500 bg-violet-500/10" />
          <Stat
            icon="alertTriangle"
            label="Reports outside Corporate"
            value={outside.length}
            hint={outside.length ? "Escalation stops at them" : "Self-contained"}
            tone={outside.length ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10"}
          />
        </div>
      )}

      {!loading && outside.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Icon name="alertTriangle" size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--fg-primary)]">
                {outside.length === 1 ? "1 person reports" : `${outside.length} people report`} to someone outside the corporate desk
              </p>
              <p className="text-xs text-[var(--fg-secondary)] mt-0.5">
                The corporate hierarchy is self-contained, so their requests can't escalate past them.
                {canEdit ? " Point them at a corporate manager if they should have one." : ""}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {outside.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openEdit(p)}
                    disabled={!canEdit}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent)] disabled:hover:border-[var(--border-default)]"
                  >
                    <span className="font-medium text-[var(--fg-primary)]">{p.full_name}</span>
                    <Icon name="arrowRight" size={11} className="text-[var(--fg-muted)]" />
                    <span className="text-[var(--fg-muted)]">{p.outside_manager.full_name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        {canEdit && <p className="text-xs text-[var(--fg-muted)]">Hover a card and use the pencil to change who they report to.</p>}
      </div>

      {loading ? (
        <Skeleton className="h-80" rounded="rounded-2xl" />
      ) : people.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <EmptyState icon="sitemap" title="No delivery staff yet" description="Add people under People → Delivery Staff." />
        </div>
      ) : (
        <div className="animate-fade-up">
          <OrgChart users={chartUsers} hierarchy={links} onEditUser={canEdit ? openEdit : undefined} query={query} />
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Change reporting line"
        subtitle={editing ? `${editing.full_name} · ${(editing.positions || []).map((p) => p.label).join(", ")}` : ""}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {editing.outside_manager && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <Icon name="alertTriangle" size={13} className="mt-0.5 shrink-0" />
                Currently reports to {editing.outside_manager.full_name}, outside the corporate desk.
              </p>
            )}
            <SearchableSelect
              label="Reports to"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              options={options}
              placeholder="No one — top of the escalation chain"
              searchPlaceholder="Search delivery staff…"
            />
            <div className="rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] px-3 py-2.5">
              <p className="text-xs font-medium text-[var(--fg-secondary)] mb-1.5">Escalation layers for {editing.full_name.split(" ")[0]}'s requests</p>
              {preview.length === 0 ? (
                <p className="text-xs text-[var(--fg-muted)]">None — they're the final approver for anything escalated to them.</p>
              ) : (
                <div className="flex items-center flex-wrap gap-1.5 text-xs">
                  {preview.map((p, i) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5">
                      {i > 0 && <Icon name="chevronRight" size={12} className="text-[var(--fg-muted)]" />}
                      <Badge tone={i === 0 ? "blue" : "slate"} size="sm">L{i + 1}</Badge>
                      <span className="text-[var(--fg-primary)]">{p.full_name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              People who report to {editing.full_name.split(" ")[0]} keep reporting to them; their chains update automatically.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
