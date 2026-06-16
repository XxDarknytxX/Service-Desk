/**
 * SlaInsights — an interactive, animated SLA-violation explorer.
 *
 * A master → detail drill-down: Teams overview → a single team's detail
 * dashboard → a person's breached tickets. Each step slides in via Framer
 * Motion ("animation as transition"), and every level is built from highly
 * interactive ECharts graphs (severity donuts, drill-down bars) that house the
 * numbers while staying neat. Clicking a chart bar drills exactly like clicking
 * a card.
 *
 * `violations` arrives already role-scoped from the backend (admin → org-wide;
 * otherwise the viewer's own tickets + their teams + departments they head +
 * their direct reports), so each manager/agent sees only what's relevant.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "../ui/Icon";
import Badge from "../ui/Badge";
import EmptyState from "../ui/EmptyState";
import { useTheme } from "../../contexts/theme";
import EChart, { chartTheme, SEV, sevIndex, grad } from "./charts/EChart";

const HOUR = 3.6e6;

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
const sevHex = (hrs) => SEV[sevIndex(hrs)].color;
const STATUS_TONE = { new: "blue", open: "indigo", pending: "amber", on_hold: "slate", solved: "emerald", closed: "slate" };
const initials = (name) => (name || "?").split(" ").map((x) => x[0]).join("").toUpperCase().slice(0, 2);
const ease = [0.22, 1, 0.36, 1];

/* ----------------------------- chart options ----------------------------- */

function donutOption(theme, counts) {
  const t = chartTheme(theme);
  const total = counts.reduce((a, b) => a + b, 0);
  const data = SEV.map((b, i) => ({ value: counts[i], name: b.label, itemStyle: { color: b.color } })).filter((d) => d.value > 0);
  return {
    tooltip: { trigger: "item", backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, borderWidth: 1, textStyle: { color: t.text, fontSize: 12 }, formatter: "{b}<br/><b>{c}</b> ({d}%)" },
    legend: { bottom: 0, left: "center", itemWidth: 8, itemHeight: 8, icon: "circle", textStyle: { color: t.sub, fontSize: 11 } },
    graphic: [
      { type: "text", left: "center", top: "37%", style: { text: String(total), fill: t.text, fontSize: 28, fontWeight: 700, textAlign: "center" } },
      { type: "text", left: "center", top: "53%", style: { text: "violations", fill: t.sub, fontSize: 11, textAlign: "center" } },
    ],
    series: [{
      type: "pie", radius: ["60%", "84%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: t.bg, borderWidth: 3 },
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 7, itemStyle: { shadowBlur: 18, shadowColor: "rgba(0,0,0,0.25)" } },
      data, animationType: "scale", animationEasing: "elasticOut", animationDuration: 900,
    }],
  };
}

function barOption(theme, items) {
  // items: [{ id, name, value, color }]
  const t = chartTheme(theme);
  return {
    grid: { left: 6, right: 40, top: 8, bottom: 6, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, borderWidth: 1, textStyle: { color: t.text, fontSize: 12 } },
    xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: t.split } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.faint, fontSize: 11 } },
    yAxis: {
      type: "category", inverse: true, data: items.map((i) => i.name),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: t.text, fontSize: 12, fontWeight: 500, formatter: (v) => (v.length > 18 ? v.slice(0, 17) + "…" : v) },
    },
    series: [{
      type: "bar", barWidth: items.length > 6 ? "62%" : 20,
      data: items.map((i) => ({ value: i.value, id: i.id, name: i.name, itemStyle: { color: grad(i.color), borderRadius: [0, 7, 7, 0], cursor: "pointer" } })),
      label: { show: true, position: "right", color: t.sub, fontSize: 12, fontWeight: 700 },
      emphasis: { focus: "self", itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,0,0,0.28)" } },
      animationDelay: (idx) => idx * 70, animationDuration: 700, animationEasing: "cubicOut",
    }],
  };
}

function ticketBarOption(theme, tickets) {
  const t = chartTheme(theme);
  const items = tickets.map((v) => ({
    id: v.ticket_id, name: v.ticket_number,
    value: +((v._overdue || 0) / HOUR).toFixed(1), color: sevHex((v._overdue || 0) / HOUR),
  }));
  return {
    grid: { left: 6, right: 48, top: 8, bottom: 22, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, borderWidth: 1, textStyle: { color: t.text, fontSize: 12 }, valueFormatter: (v) => `${v}h overdue` },
    xAxis: { type: "value", name: "hours overdue", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.faint, fontSize: 11 }, splitLine: { lineStyle: { color: t.split } }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.faint, fontSize: 11 } },
    yAxis: { type: "category", inverse: true, data: items.map((i) => i.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.text, fontSize: 11, fontFamily: "monospace" } },
    series: [{
      type: "bar", barWidth: items.length > 6 ? "62%" : 18,
      data: items.map((i) => ({ value: i.value, id: i.id, itemStyle: { color: grad(i.color), borderRadius: [0, 7, 7, 0], cursor: "pointer" } })),
      label: { show: true, position: "right", color: t.sub, fontSize: 11, fontWeight: 600, formatter: "{c}h" },
      emphasis: { focus: "self", itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,0,0,0.28)" } },
      animationDelay: (idx) => idx * 60, animationDuration: 650, animationEasing: "cubicOut",
    }],
  };
}

/* ------------------------------- subviews -------------------------------- */

function ChartCard({ icon, title, children }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon name={icon} size={14} className="text-[var(--fg-muted)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 min-w-[88px]">
      <p className="text-lg font-semibold tabular-nums leading-tight" style={tone ? { color: tone } : { color: "var(--fg-primary)" }}>{value}</p>
      <p className="text-[11px] text-[var(--fg-muted)] leading-tight">{label}</p>
    </div>
  );
}

/* -------------------------------- main ----------------------------------- */

export default function SlaInsights({ violations = [], scope = "all", onOpenTicket }) {
  const { theme } = useTheme();
  const [teamId, setTeamId] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [dir, setDir] = useState(1); // +1 drilling down, -1 going up (slide direction)

  const { teams, totals } = useMemo(() => {
    const now = Date.now();
    const overdueOf = (v) => {
      const r = v.response_breached && v.response_due_at ? now - new Date(v.response_due_at).getTime() : 0;
      const x = v.resolve_breached && v.resolve_due_at ? now - new Date(v.resolve_due_at).getTime() : 0;
      return Math.max(r, x);
    };
    const blank = () => ({ count: 0, overdue: 0, worst: 0, response: 0, resolve: 0, sev: [0, 0, 0, 0] });
    const tot = { ...blank(), people: new Set() };
    const map = new Map();
    for (const v of violations) {
      const od = overdueOf(v);
      const si = sevIndex(od / HOUR);
      const tid = v.team_id ?? "none";
      if (!map.has(tid)) map.set(tid, { id: tid, name: v.team_name || "No team", ...blank(), people: new Map() });
      const T = map.get(tid);
      const pid = v.assignee_id ?? "unassigned";
      if (!T.people.has(pid)) T.people.set(pid, { id: pid, name: v.assignee_name || "Unassigned", ...blank(), tickets: [] });
      const P = T.people.get(pid);
      for (const node of [tot, T, P]) {
        node.count++; node.overdue += od; node.worst = Math.max(node.worst, od); node.sev[si]++;
        if (v.response_breached) node.response++;
        if (v.resolve_breached) node.resolve++;
      }
      tot.people.add(pid);
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
    return { teams: teamsArr, totals: { ...tot, teams: teamsArr.length, peopleCount: tot.people.size } };
  }, [violations]);

  const selTeam = teams.find((t) => String(t.id) === String(teamId)) || null;
  const selPerson = selTeam?.people.find((p) => String(p.id) === String(personId)) || null;
  const level = selPerson ? 2 : selTeam ? 1 : 0;

  // Navigation helpers (set slide direction, then change selection).
  const drillTeam = (id) => { setDir(1); setTeamId(id); setPersonId(null); };
  const drillPerson = (id) => { setDir(1); setPersonId(id); };
  const upTo = (lvl) => { setDir(-1); if (lvl === 0) { setTeamId(null); setPersonId(null); } else if (lvl === 1) setPersonId(null); };

  // Chart options (rebuild on theme + selection).
  const overviewDonut = useMemo(() => donutOption(theme, totals.sev || [0, 0, 0, 0]), [theme, totals]);
  const overviewBar = useMemo(() => barOption(theme, teams.map((t) => ({ id: t.id, name: t.name, value: t.count, color: sevHex(t.worst / HOUR) }))), [theme, teams]);
  const teamDonut = useMemo(() => (selTeam ? donutOption(theme, selTeam.sev) : null), [theme, selTeam]);
  const peopleBar = useMemo(() => (selTeam ? barOption(theme, selTeam.people.map((p) => ({ id: p.id, name: p.name, value: p.count, color: sevHex(p.worst / HOUR) }))) : null), [theme, selTeam]);
  const ticketBar = useMemo(() => (selPerson ? ticketBarOption(theme, selPerson.tickets) : null), [theme, selPerson]);

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
      className={cn("px-2 py-1 rounded-md transition-colors", active ? "text-[var(--fg-primary)] font-medium" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]")}
    >
      {children}
    </button>
  );

  const screenKey = `${level}:${teamId ?? ""}:${personId ?? ""}`;
  const slide = {
    initial: { opacity: 0, x: dir * 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -dir * 30, position: "absolute" },
  };

  return (
    <div className="space-y-4">
      {/* Summary band */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone={scope === "scoped" ? "blue" : "violet"} size="sm">
          <Icon name={scope === "scoped" ? "users" : "globe"} size={11} />
          {scope === "scoped" ? "Your teams" : "Organization-wide"}
        </Badge>
        <span className="text-sm text-[var(--fg-secondary)]"><b className="text-[var(--fg-primary)] tabular-nums">{totals.count}</b> open violation{totals.count !== 1 ? "s" : ""}</span>
        <span className="text-[var(--fg-subtle)]">·</span>
        <span className="text-sm text-[var(--fg-secondary)]"><b className="text-[var(--fg-primary)] tabular-nums">{totals.teams}</b> team{totals.teams !== 1 ? "s" : ""}</span>
        <span className="text-[var(--fg-subtle)]">·</span>
        <span className="text-sm text-[var(--fg-secondary)]"><b className="text-[var(--fg-primary)] tabular-nums">{totals.peopleCount}</b> {totals.peopleCount === 1 ? "person" : "people"}</span>
        <span className="text-[var(--fg-subtle)]">·</span>
        <span className="text-sm font-medium text-rose-500">Σ {fmtDur(totals.overdue)} overdue</span>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 text-sm flex-wrap">
        {level > 0 && (
          <button onClick={() => upTo(level - 1)} className="mr-1 h-7 w-7 inline-flex items-center justify-center rounded-lg border border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-colors" title="Back">
            <Icon name="arrow-left" size={14} />
          </button>
        )}
        <Crumb onClick={() => upTo(0)} active={level === 0}>All teams</Crumb>
        {selTeam && (<><Icon name="chevron-right" size={13} className="text-[var(--fg-subtle)]" /><Crumb onClick={() => upTo(1)} active={level === 1}>{selTeam.name}</Crumb></>)}
        {selPerson && (<><Icon name="chevron-right" size={13} className="text-[var(--fg-subtle)]" /><Crumb active>{selPerson.name}</Crumb></>)}
      </div>

      {/* Animated master → detail stage */}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={screenKey} {...slide} transition={{ duration: 0.3, ease }} className="space-y-4 w-full">

            {/* LEVEL 0 — Teams overview */}
            {level === 0 && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <ChartCard icon="chart" title="Severity mix">
                    <EChart option={overviewDonut} height={240} />
                  </ChartCard>
                  <ChartCard icon="bar-chart" title="Violations by team">
                    <EChart option={overviewBar} height={240} onClick={(p) => p?.data?.id != null && drillTeam(p.data.id)} />
                  </ChartCard>
                </div>
                <div className="grid gap-2.5">
                  {teams.map((t, i) => {
                    const col = sevHex(t.worst / HOUR);
                    return (
                      <button key={t.id} onClick={() => drillTeam(t.id)} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
                        className="animate-fade-up group w-full flex items-center gap-4 rounded-xl p-4 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150">
                        <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${col}1a`, color: col, boxShadow: `0 0 0 1px ${col}33` }}>
                          <Icon name="teams" size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--fg-primary)] truncate">{t.name}</p>
                          <p className="text-xs text-[var(--fg-muted)]">{t.people.length} {t.people.length === 1 ? "person" : "people"} · worst {fmtDur(t.worst)} over</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-semibold tabular-nums" style={{ color: col }}>{t.count}</p>
                          <p className="text-[11px] text-[var(--fg-muted)]">Σ {fmtDur(t.overdue)}</p>
                        </div>
                        <Icon name="chevron-right" size={16} className="text-[var(--fg-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* LEVEL 1 — Team detail */}
            {level === 1 && selTeam && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${sevHex(selTeam.worst / HOUR)}1a`, color: sevHex(selTeam.worst / HOUR), boxShadow: `0 0 0 1px ${sevHex(selTeam.worst / HOUR)}33` }}>
                    <Icon name="teams" size={18} />
                  </span>
                  <div className="mr-auto">
                    <p className="font-semibold text-[var(--fg-primary)] leading-tight">{selTeam.name}</p>
                    <p className="text-xs text-[var(--fg-muted)]">{selTeam.people.length} {selTeam.people.length === 1 ? "person" : "people"} responsible</p>
                  </div>
                  <Kpi label="violations" value={selTeam.count} tone={sevHex(selTeam.worst / HOUR)} />
                  <Kpi label="worst over" value={fmtDur(selTeam.worst)} />
                  <Kpi label="Σ overdue" value={fmtDur(selTeam.overdue)} />
                  <Kpi label="resp / resolve" value={`${selTeam.response} / ${selTeam.resolve}`} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ChartCard icon="chart" title="Severity mix">
                    <EChart option={teamDonut} height={230} />
                  </ChartCard>
                  <ChartCard icon="users" title="People responsible — click to drill">
                    <EChart option={peopleBar} height={230} onClick={(p) => p?.data?.id != null && drillPerson(p.data.id)} />
                  </ChartCard>
                </div>
                <div className="grid gap-2.5">
                  {selTeam.people.map((p, i) => {
                    const col = sevHex(p.worst / HOUR);
                    return (
                      <button key={p.id} onClick={() => drillPerson(p.id)} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
                        className="animate-fade-up group w-full flex items-center gap-4 rounded-xl p-4 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150">
                        <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/15">{initials(p.name)}</span>
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
                </div>
              </>
            )}

            {/* LEVEL 2 — Person detail */}
            {level === 2 && selPerson && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/15">{initials(selPerson.name)}</span>
                  <div className="mr-auto">
                    <p className="font-semibold text-[var(--fg-primary)] leading-tight">{selPerson.name}</p>
                    <p className="text-xs text-[var(--fg-muted)]">in {selTeam.name}</p>
                  </div>
                  <Kpi label="violations" value={selPerson.count} tone={sevHex(selPerson.worst / HOUR)} />
                  <Kpi label="worst over" value={fmtDur(selPerson.worst)} />
                  <Kpi label="Σ overdue" value={fmtDur(selPerson.overdue)} />
                </div>
                <ChartCard icon="clock" title="Overdue by ticket">
                  <EChart option={ticketBar} height={Math.max(150, selPerson.tickets.length * 40 + 60)} onClick={(p) => p?.data?.id != null && onOpenTicket?.(p.data.id)} />
                </ChartCard>
                <div className="grid gap-2.5">
                  {selPerson.tickets.map((v, i) => (
                    <button key={v.ticket_id} onClick={() => onOpenTicket?.(v.ticket_id)} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
                      className="animate-fade-up group w-full flex items-center gap-3 rounded-xl p-3.5 text-left bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150">
                      <span className="text-[11px] font-mono font-semibold text-[var(--accent)] whitespace-nowrap">{v.ticket_number}</span>
                      <span className="text-sm text-[var(--fg-primary)] truncate flex-1">{v.subject}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {!!v.response_breached && <Badge tone="rose" size="sm">Response</Badge>}
                        {!!v.resolve_breached && <Badge tone="amber" size="sm">Resolve</Badge>}
                      </div>
                      <Badge tone="rose" size="sm" className="shrink-0 whitespace-nowrap">{fmtDur(v._overdue)} over</Badge>
                      <Badge tone={STATUS_TONE[v.status_key] || "slate"} size="sm" className="shrink-0 hidden sm:inline-flex">{v.status_label}</Badge>
                      <Icon name="external-link" size={14} className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
