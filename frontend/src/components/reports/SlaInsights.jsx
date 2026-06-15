/**
 * SlaInsights — interactive, top-down SLA-violation drill-down.
 *
 * Level 0: Teams (volume + severity)  →  Level 1: the people responsible  →
 * Level 2: their breached tickets (click to open). A breadcrumb walks back up,
 * each level animates in, and a Three.js "severity constellation" (SlaOrbs)
 * mirrors the teams — click an orb to jump straight into a team. Time factors
 * (total + worst overdue) surface at every level.
 *
 * `violations` is already role-scoped by the backend (admin → org-wide;
 * otherwise the viewer's own + their teams + departments they head + reports),
 * so each manager/agent naturally sees only what's relevant to them.
 */
import { useMemo, useState } from "react";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";
import EmptyState from "../ui/EmptyState";
import SlaOrbs from "./SlaOrbs";

function cn(...p) {
  return p.filter(Boolean).join(" ");
}
const fmtDur = (ms) => {
  const v = Math.abs(Number(ms) || 0);
  const m = Math.round(v / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};
const sevHex = (hrs) => (hrs >= 12 ? "#dc2626" : hrs >= 4 ? "#f43f5e" : hrs >= 1 ? "#fb923c" : "#fbbf24");
const STATUS_TONE = { new: "blue", open: "indigo", pending: "amber", on_hold: "slate", solved: "emerald", closed: "slate" };
const initials = (name) => (name || "?").split(" ").map((x) => x[0]).join("").toUpperCase().slice(0, 2);

export default function SlaInsights({ violations = [], scope = "all", onOpenTicket }) {
  const [teamId, setTeamId] = useState(null);
  const [personId, setPersonId] = useState(null);

  const { teams, totalOverdue } = useMemo(() => {
    const now = Date.now();
    const overdueOf = (v) => {
      const r = v.response_breached && v.response_due_at ? now - new Date(v.response_due_at).getTime() : 0;
      const x = v.resolve_breached && v.resolve_due_at ? now - new Date(v.resolve_due_at).getTime() : 0;
      return Math.max(r, x);
    };
    const map = new Map();
    let total = 0;
    for (const v of violations) {
      const id = v.team_id ?? "none";
      if (!map.has(id)) map.set(id, { id, name: v.team_name || "No team", count: 0, overdue: 0, worst: 0, people: new Map() });
      const T = map.get(id);
      const od = overdueOf(v);
      total += od;
      T.count++; T.overdue += od; T.worst = Math.max(T.worst, od);
      const pid = v.assignee_id ?? "unassigned";
      if (!T.people.has(pid)) T.people.set(pid, { id: pid, name: v.assignee_name || "Unassigned", count: 0, overdue: 0, worst: 0, tickets: [] });
      const P = T.people.get(pid);
      P.count++; P.overdue += od; P.worst = Math.max(P.worst, od);
      P.tickets.push({ ...v, _overdue: od });
    }
    const teamsArr = [...map.values()]
      .map((T) => ({
        ...T,
        people: [...T.people.values()]
          .map((P) => ({ ...P, tickets: P.tickets.sort((a, b) => b._overdue - a._overdue) }))
          .sort((a, b) => b.count - a.count || b.overdue - a.overdue),
      }))
      .sort((a, b) => b.count - a.count || b.overdue - a.overdue);
    return { teams: teamsArr, totalOverdue: total };
  }, [violations]);

  const selTeam = teams.find((t) => String(t.id) === String(teamId)) || null;
  const selPerson = selTeam?.people.find((p) => String(p.id) === String(personId)) || null;
  const level = selPerson ? 2 : selTeam ? 1 : 0;
  const maxTeam = Math.max(1, ...teams.map((t) => t.count));

  if (!violations.length) {
    return (
      <EmptyState
        icon="check-circle"
        tone="emerald"
        title="No SLA violations"
        description={scope === "scoped" ? "None of your teams are in breach right now." : "Nothing is in breach right now."}
        compact
      />
    );
  }

  const Crumb = ({ children, onClick, active }) => (
    <button
      onClick={onClick}
      disabled={active}
      className={cn(
        "px-2 py-1 rounded-md transition-colors",
        active ? "text-[var(--fg-primary)] font-medium" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone={scope === "scoped" ? "blue" : "violet"} size="sm">
          <Icon name={scope === "scoped" ? "users" : "globe"} size={11} />
          {scope === "scoped" ? "Your teams" : "Organization-wide"}
        </Badge>
        <span className="text-sm text-[var(--fg-secondary)]">
          <b className="text-[var(--fg-primary)] tabular-nums">{violations.length}</b> open violation{violations.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[var(--fg-subtle)]">·</span>
        <span className="text-sm text-[var(--fg-secondary)]">
          <b className="text-[var(--fg-primary)] tabular-nums">{teams.length}</b> team{teams.length !== 1 ? "s" : ""} affected
        </span>
        <span className="text-[var(--fg-subtle)]">·</span>
        <span className="text-sm font-medium text-rose-500">Σ {fmtDur(totalOverdue)} overdue</span>
      </div>

      {/* 3D severity constellation */}
      <div className="relative h-52 rounded-xl overflow-hidden border border-[var(--border-default)] bg-[radial-gradient(120%_120%_at_50%_-10%,rgba(230,0,0,0.08),transparent_60%)]">
        <SlaOrbs teams={teams} activeId={teamId} onSelect={(id) => { setTeamId(id); setPersonId(null); }} />
        <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-[var(--fg-muted)]">
          Each orb = a team · size = volume · colour = severity · click to drill in
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 text-sm flex-wrap">
        <Crumb onClick={() => { setTeamId(null); setPersonId(null); }} active={level === 0}>All teams</Crumb>
        {selTeam && (
          <>
            <Icon name="chevron-right" size={13} className="text-[var(--fg-subtle)]" />
            <Crumb onClick={() => setPersonId(null)} active={level === 1}>{selTeam.name}</Crumb>
          </>
        )}
        {selPerson && (
          <>
            <Icon name="chevron-right" size={13} className="text-[var(--fg-subtle)]" />
            <Crumb active>{selPerson.name}</Crumb>
          </>
        )}
      </div>

      {/* Level content (re-animates each drill) */}
      <div key={`${level}:${teamId}:${personId}`} className="space-y-2.5">
        {level === 0 &&
          teams.map((t, i) => {
            const col = sevHex(t.worst / 3.6e6);
            return (
              <button
                key={t.id}
                onClick={() => { setTeamId(t.id); setPersonId(null); }}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className="animate-fade-up group w-full flex items-center gap-4 rounded-xl p-4 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150"
              >
                <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${col}1a`, color: col, boxShadow: `0 0 0 1px ${col}33` }}>
                  <Icon name="teams" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--fg-primary)] truncate">{t.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">
                    {t.people.length} {t.people.length === 1 ? "person" : "people"} responsible · worst {fmtDur(t.worst)} over
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden max-w-md">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((t.count / maxTeam) * 100)}%`, background: col }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-semibold tabular-nums" style={{ color: col }}>{t.count}</p>
                  <p className="text-[11px] text-[var(--fg-muted)]">Σ {fmtDur(t.overdue)}</p>
                </div>
                <Icon name="chevron-right" size={16} className="text-[var(--fg-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            );
          })}

        {level === 1 &&
          selTeam.people.map((p, i) => {
            const col = sevHex(p.worst / 3.6e6);
            return (
              <button
                key={p.id}
                onClick={() => setPersonId(p.id)}
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                className="animate-fade-up group w-full flex items-center gap-4 rounded-xl p-4 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150"
              >
                <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/15">
                  {initials(p.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--fg-primary)] truncate">{p.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">worst {fmtDur(p.worst)} over · Σ {fmtDur(p.overdue)} overdue</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-semibold tabular-nums" style={{ color: col }}>{p.count}</p>
                  <p className="text-[11px] text-[var(--fg-muted)]">violation{p.count !== 1 ? "s" : ""}</p>
                </div>
                <Icon name="chevron-right" size={16} className="text-[var(--fg-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            );
          })}

        {level === 2 &&
          selPerson.tickets.map((v, i) => (
            <button
              key={v.ticket_id}
              onClick={() => onOpenTicket?.(v.ticket_id)}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              className="animate-fade-up group w-full flex items-center gap-3 rounded-xl p-3.5 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150"
            >
              <span className="text-[11px] font-mono font-semibold text-[var(--accent)] whitespace-nowrap">{v.ticket_number}</span>
              <span className="text-sm text-[var(--fg-primary)] truncate flex-1">{v.subject}</span>
              <div className="flex items-center gap-1 shrink-0">
                {!!v.response_breached && <Badge tone="rose" size="sm">Response</Badge>}
                {!!v.resolve_breached && <Badge tone="amber" size="sm">Resolve</Badge>}
              </div>
              <Badge tone="rose" size="sm" className="shrink-0 whitespace-nowrap">{fmtDur(v._overdue)} over</Badge>
              <Badge tone={STATUS_TONE[v.status_key] || "slate"} size="sm" className="shrink-0 hidden sm:inline-flex">{v.status_label}</Badge>
              <Icon name="chevron-right" size={14} className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-all shrink-0" />
            </button>
          ))}
      </div>
    </div>
  );
}
