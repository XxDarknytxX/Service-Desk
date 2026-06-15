/**
 * Reports & Analytics Page — Vodafone Service Desk
 *
 * Premium analytics experience:
 *  • Branded PageHeader with date-range segmented control, refresh & export
 *  • Strong KPI summary rail (tinted stat cards, staggered entrance)
 *  • Well-grouped chart panels in elevated rounded-2xl cards with icon-tile headers
 *  • All Recharts re-themed via the shared chart kit (CHART_SERIES / useChartTheme /
 *    ChartTooltip / ChartGradient); Pie/donut use isAnimationActive={false}
 *  • Skeleton loading + EmptyState no-data treatment
 *
 * Tabs: Overview · Agents · SLA · CSAT · Teams · Workload · Trends · Export.
 * Every data fetch, filter, metric, and the Excel export flow are preserved exactly.
 */

import { useState, useEffect, useMemo } from "react";
import { reportsApi, API_URL, api } from "../services/api";
import { useNavigate } from "react-router-dom";
import SlaInsights from "../components/reports/SlaInsights";
import { useToast } from "../contexts/toast";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonKpis, SkeletonCard } from "../components/ui/Skeleton";
import {
  CHART_SERIES, CHART_COLORS, useChartTheme, ChartTooltip, ChartGradient,
} from "../components/ui/chart";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

function cn(...parts) { return parts.filter(Boolean).join(" "); }

const TABS = [
  { key: "overview", label: "Overview", icon: "bar-chart" },
  { key: "agents", label: "Agents", icon: "users" },
  { key: "sla", label: "SLA", icon: "sla" },
  { key: "csat", label: "CSAT", icon: "star" },
  { key: "teams", label: "Teams", icon: "layers" },
  { key: "workload", label: "Workload", icon: "activity" },
  { key: "trends", label: "Trends", icon: "trending-up" },
  { key: "export", label: "Export", icon: "download" },
];

const DATE_RANGES = [
  { v: "7", l: "7D" },
  { v: "30", l: "30D" },
  { v: "90", l: "90D" },
  { v: "365", l: "1Y" },
];

// Static tint class strings (no dynamic Tailwind) for panel icon tiles.
const TILE = {
  accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
  blue: "bg-blue-500/10 text-blue-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-500",
  violet: "bg-violet-500/10 text-violet-500",
  cyan: "bg-cyan-500/10 text-cyan-500",
  rose: "bg-rose-500/10 text-rose-500",
  indigo: "bg-indigo-500/10 text-indigo-500",
  teal: "bg-teal-500/10 text-teal-500",
  slate: "bg-slate-500/10 text-slate-400",
};

/* ── Elevated panel with icon-tile header ───────────────────────── */
function Panel({ icon, tone = "accent", title, subtitle, right, children, bodyClass, delay = 0, className }) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
        <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", TILE[tone] || TILE.accent)}>
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--fg-muted)] mt-0.5 truncate">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      <div className={bodyClass ?? "p-5"}>{children}</div>
    </section>
  );
}

/* ── Themed table card (no body padding) ────────────────────────── */
function TablePanel({ icon, tone, title, subtitle, right, columns, children, delay = 0 }) {
  return (
    <Panel icon={icon} tone={tone} title={title} subtitle={subtitle} right={right} bodyClass="" delay={delay}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
              {columns.map((h) => (
                <th key={h} className="px-5 py-3 text-left text-label whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">{children}</tbody>
        </table>
      </div>
    </Panel>
  );
}

// Agent / requester avatar bubble
function Avatar({ name }) {
  return (
    <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)] shrink-0">
      {(name || "?")[0].toUpperCase()}
    </span>
  );
}

// Semi-circular gauge (re-themed) used in Overview + SLA summary tiles.
function Gauge({ pct, color, width = 150, height = 92 }) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <ResponsiveContainer width={width} height={height}>
      <PieChart>
        <Pie
          data={[{ value }, { value: 100 - value }]}
          cx="50%" cy="92%" startAngle={180} endAngle={0}
          innerRadius="78%" outerRadius="118%" dataKey="value" stroke="none"
          isAnimationActive={false}
        >
          <Cell fill={color} />
          <Cell fill="var(--bg-surface)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function Reports() {
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [dateRange, setDateRange] = useState("30");
  const [loading, setLoading] = useState(true);
  const ct = useChartTheme();

  // Data states
  const [metrics, setMetrics] = useState(null);
  const [agentPerformance, setAgentPerformance] = useState([]);
  const [slaCompliance, setSlaCompliance] = useState(null);
  const [satisfaction, setSatisfaction] = useState(null);
  const [trends, setTrends] = useState([]);
  const [teamPerformance, setTeamPerformance] = useState([]);
  const [resolutionDist, setResolutionDist] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [requesterActivity, setRequesterActivity] = useState([]);
  const [agentWorkload, setAgentWorkload] = useState({ agents: [], unassigned: { total: 0, byTeam: [] } });
  const [atRiskTickets, setAtRiskTickets] = useState({ tickets: [], count: 0 });
  const [slaPriorityBreakdown, setSlaPriorityBreakdown] = useState([]);
  const [slaViolations, setSlaViolations] = useState([]);
  const [slaViolationScope, setSlaViolationScope] = useState("all");

  const dateParams = useMemo(() => {
    const toLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const s = new Date();
    s.setDate(s.getDate() - parseInt(dateRange));
    return { start_date: toLocal(s), end_date: toLocal(new Date()) };
  }, [dateRange]);

  useEffect(() => { loadReports(); }, [dateRange]);

  async function loadReports() {
    try {
      setLoading(true);
      const [m, a, s, c, t, tp, rd, hm, ra, aw, ar, spb, viol] = await Promise.all([
        reportsApi.getTicketMetrics(dateParams),
        reportsApi.getAgentPerformance(dateParams),
        reportsApi.getSlaCompliance(dateParams),
        reportsApi.getCustomerSatisfaction(dateParams),
        reportsApi.getTicketTrends({ period: "day", days: dateRange }),
        reportsApi.getTeamPerformance(dateParams),
        reportsApi.getResolutionDistribution(dateParams),
        reportsApi.getHourlyHeatmap({ days: dateRange }),
        reportsApi.getRequesterActivity(dateParams),
        reportsApi.getAgentWorkload(dateParams),
        reportsApi.getAtRiskTickets(),
        reportsApi.getSlaPriorityBreakdown(dateParams),
        api("/sla/my-violations").catch(() => ({ items: [], scope: "all" })),
      ]);
      setMetrics(m);
      setAgentPerformance(a);
      setSlaCompliance(s);
      setSatisfaction(c);
      setTrends(t);
      setTeamPerformance(tp);
      setResolutionDist(rd);
      setHeatmap(hm);
      setRequesterActivity(ra);
      setAgentWorkload(aw || { agents: [], unassigned: { total: 0, byTeam: [] } });
      setAtRiskTickets(ar || { tickets: [], count: 0 });
      setSlaPriorityBreakdown(spb || []);
      setSlaViolations(viol?.items || []);
      setSlaViolationScope(viol?.scope || "all");
    } catch (err) {
      console.error("Failed to load reports", err);
      toast.error(err.message || "Failed to load reports");
    }
    finally { setLoading(false); }
  }

  function downloadExport(type) {
    const token = localStorage.getItem("token");
    const url = `${API_URL}/reports/export?type=${type}&start_date=${dateParams.start_date}&end_date=${dateParams.end_date}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u; a.download = `${type}_report.xlsx`; a.click();
        URL.revokeObjectURL(u);
      })
      .catch(() => toast.error("Export failed"));
  }

  // ── Heatmap data transform ──────────────────────────────────────
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heatmapGrid = useMemo(() => {
    const grid = Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => ({ day: d + 1, hour: h, count: 0 }))
    );
    heatmap.forEach(r => { if (grid[r.day_of_week - 1]) grid[r.day_of_week - 1][r.hour].count = r.count; });
    return grid;
  }, [heatmap]);
  const heatmapMax = useMemo(() => Math.max(1, ...heatmap.map(r => r.count)), [heatmap]);

  // Shared axis props for re-themed charts.
  const axisTick = { fill: ct.axis, fontSize: ct.tickFontSize };
  const gridStroke = ct.grid;
  const cursorFill = { fill: ct.cursor };

  // ── Loading skeleton (content-shaped, not a lone spinner) ───────
  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon="reports"
          title="Reports & Analytics"
          subtitle="Comprehensive performance metrics and insights"
        />
        <SkeletonKpis count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SkeletonCard height="h-80" />
          <SkeletonCard height="h-80" />
        </div>
        <SkeletonCard height="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        icon="reports"
        title="Reports & Analytics"
        subtitle="Comprehensive performance metrics and insights"
        actions={
          <>
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
              {DATE_RANGES.map(d => (
                <button
                  key={d.v}
                  onClick={() => setDateRange(d.v)}
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-200",
                    dateRange === d.v
                      ? "bg-[var(--accent)] text-white shadow-[0_2px_8px_rgba(230,0,0,0.25)]"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                  )}
                >
                  {d.l}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadReports()}
              title="Refresh"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)] transition-all duration-150"
            >
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </button>
            <Button
              variant="secondary"
              onClick={() => setTab("export")}
              icon={<Icon name="download" size={15} />}
            >
              Export
            </Button>
          </>
        }
      />

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Tabs
          variant="pills"
          tabs={TABS.map(t => ({ value: t.key, label: t.label, icon: t.icon }))}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB: OVERVIEW
         ════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Summary KPI rail */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Tickets", value: metrics?.summary?.total_tickets || 0, icon: "ticket", iconCls: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15", hint: "All tickets in range" },
              { label: "Closed", value: metrics?.summary?.closed_tickets || 0, icon: "check-circle", iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", hint: "Resolved & closed" },
              { label: "Open", value: metrics?.summary?.open_tickets || 0, icon: "inbox", iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15", hint: "Still active" },
              { label: "Avg Resolution", value: metrics?.summary?.avg_resolution_hours ? `${Math.round(metrics.summary.avg_resolution_hours)}h` : "N/A", icon: "clock", iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15", hint: "Mean time to resolve" },
            ].map((kpi, i) => (
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
                <p className="mt-3 text-[11px] text-[var(--fg-muted)]">{kpi.hint}</p>
              </div>
            ))}
          </div>

          {/* Gauges: Unassigned + SLA violated */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { label: "Unassigned Requests", value: agentWorkload.unassigned?.total || 0, max: Math.max(1, metrics?.summary?.open_tickets || 1), color: CHART_COLORS.amber, tone: "amber", icon: "inbox" },
              { label: "SLA Violated (Open)", value: slaCompliance?.summary?.response_breached || 0, max: Math.max(1, slaCompliance?.summary?.total_tickets_with_sla || 1), color: CHART_COLORS.accent, tone: "rose", icon: "alert-triangle" },
            ].map((g, i) => {
              const pct = Math.min(100, Math.round((g.value / g.max) * 100));
              return (
                <Panel key={g.label} icon={g.icon} tone={g.tone} title={g.label} delay={i * 60}>
                  <div className="flex items-center gap-6">
                    <div className="relative shrink-0">
                      <Gauge pct={pct} color={g.color} />
                      <div className="absolute inset-x-0 bottom-1 flex items-end justify-center">
                        <span className="text-2xl font-semibold text-[var(--fg-primary)] tabular-nums">{g.value}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold text-[var(--fg-primary)] tabular-nums">{pct}%</p>
                      <p className="text-xs text-[var(--fg-muted)] mt-0.5">of {g.max} total</p>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Ticket Trend Area Chart */}
            <Panel icon="trending-up" tone="blue" title="Ticket Volume" delay={60}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trends}>
                  <defs>
                    <ChartGradient id="gCreated" color={CHART_COLORS.accent} />
                    <ChartGradient id="gClosed" color={CHART_COLORS.emerald} />
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="period" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Area type="monotone" dataKey="created" stroke={CHART_COLORS.accent} fill="url(#gCreated)" strokeWidth={2} name="Created" />
                  <Area type="monotone" dataKey="closed" stroke={CHART_COLORS.emerald} fill="url(#gClosed)" strokeWidth={2} name="Closed" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            {/* Priority Pie */}
            <Panel icon="flag" tone="amber" title="By Priority" delay={120}>
              {(metrics?.byPriority || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={metrics?.byPriority || []} dataKey="count" nameKey="label" cx="50%" cy="50%"
                      innerRadius={58} outerRadius={95} paddingAngle={3} stroke="none" isAnimationActive={false}>
                      {(metrics?.byPriority || []).map((_, i) => (
                        <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip hideLabel />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon="flag" title="No priority data" description="Ticket priority breakdown will appear here." compact />
              )}
            </Panel>
          </div>

          {/* Distribution Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: "By Status", data: metrics?.byStatus, icon: "inbox", tone: "blue", bar: CHART_COLORS.blue },
              { title: "By Channel", data: metrics?.byChannel, icon: "mail", tone: "cyan", bar: CHART_COLORS.cyan },
              { title: "By Type", data: metrics?.byType, icon: "tag", tone: "violet", bar: CHART_COLORS.violet },
              { title: "Resolution Distribution", data: resolutionDist?.buckets, icon: "clock", tone: "emerald", bar: CHART_COLORS.emerald },
            ].map((section, i) => {
              const total = (section.data || []).reduce((s, it) => s + (it.count || 0), 0);
              return (
                <Panel key={section.title} icon={section.icon} tone={section.tone} title={section.title} delay={i * 50}>
                  {(section.data || []).length > 0 ? (
                    <div className="space-y-3">
                      {(section.data || []).map((item) => {
                        const label = item.label || item.bucket;
                        const pct = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
                        return (
                          <div key={label} className="flex items-center gap-3">
                            <span className="text-xs font-medium text-[var(--fg-secondary)] w-28 truncate">{label}</span>
                            <div className="flex-1 h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: section.bar }} />
                            </div>
                            <span className="text-xs font-semibold text-[var(--fg-primary)] w-8 text-right tabular-nums">{item.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState icon={section.icon} title="No data available" compact />
                  )}
                </Panel>
              );
            })}
          </div>

          {/* Heatmap */}
          <Panel
            icon="grid"
            tone="indigo"
            title="Ticket Creation Heatmap"
            right={<span className="text-xs text-[var(--fg-muted)]">Hour of day vs Day of week</span>}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Hour labels */}
                <div className="flex items-center gap-0.5 ml-10 mb-1">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="flex-1 text-center text-[10px] text-[var(--fg-muted)]">
                      {h % 3 === 0 ? `${h}` : ""}
                    </div>
                  ))}
                </div>
                {heatmapGrid.map((row, d) => (
                  <div key={d} className="flex items-center gap-0.5 mb-0.5">
                    <span className="text-[10px] text-[var(--fg-muted)] w-10 text-right pr-2">{dayNames[d]}</span>
                    {row.map(cell => {
                      const intensity = cell.count / heatmapMax;
                      return (
                        <div key={cell.hour} className="flex-1 aspect-square rounded-sm transition-colors"
                          style={{ backgroundColor: intensity > 0 ? `rgba(230, 0, 0, ${0.1 + intensity * 0.8})` : "var(--bg-surface)" }}
                          title={`${dayNames[d]} ${cell.hour}:00 — ${cell.count} tickets`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Requests Inflow by Day of Week */}
          {(() => {
            const dowData = dayNames.map((name, i) => {
              const dayIdx = i + 1; // MySQL DAYOFWEEK: 1=Sun, 2=Mon...
              const dayTickets = heatmap.filter(h => h.day_of_week === dayIdx);
              const created = dayTickets.reduce((sum, h) => sum + h.count, 0);
              return { day: name, created };
            });
            return (
              <Panel icon="bar-chart" tone="teal" title="Requests Inflow by Day">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Bar dataKey="created" fill={CHART_COLORS.accent} radius={[6, 6, 0, 0]} name="Tickets Created" maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: AGENTS
         ════════════════════════════════════════════════════════════ */}
      {tab === "agents" && (
        <div className="space-y-5">
          {agentPerformance.length > 0 ? (
            <>
              {/* Agent bar chart */}
              <Panel icon="bar-chart" tone="indigo" title="Tickets by Agent">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentPerformance} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} allowDecimals={false} />
                    <YAxis type="category" dataKey="full_name" tick={axisTick} tickLine={false} axisLine={false} width={80} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey="closed_tickets" fill={CHART_COLORS.emerald} name="Closed" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="open_tickets" fill={CHART_COLORS.blue} name="Open" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Agent table */}
              <TablePanel
                icon="users" tone="indigo" title="Agent Performance Details"
                columns={["Agent", "Assigned", "Closed", "Open", "Close %", "Avg Res.", "1st Resp.", "CSAT", "SLA ✗"]}
              >
                {agentPerformance.map(a => (
                  <tr key={a.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.full_name} />
                        <div>
                          <p className="text-sm font-medium text-[var(--fg-primary)]">{a.full_name}</p>
                          <p className="text-[11px] text-[var(--fg-muted)]">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)] tabular-nums">{a.assigned_tickets}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-emerald-500 tabular-nums">{a.closed_tickets}</td>
                    <td className="px-5 py-3.5 text-sm text-blue-500 tabular-nums">{a.open_tickets}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={a.close_rate >= 80 ? "emerald" : a.close_rate >= 50 ? "amber" : "rose"} size="sm">{a.close_rate || 0}%</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{a.avg_resolution_hours ? `${Math.round(a.avg_resolution_hours)}h` : "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{a.avg_first_response_min ? `${Math.round(a.avg_first_response_min)}m` : "—"}</td>
                    <td className="px-5 py-3.5">
                      {a.avg_satisfaction_rating > 0 ? (
                        <span className="text-sm font-medium text-[var(--fg-primary)] tabular-nums">{a.avg_satisfaction_rating.toFixed(1)}<span className="text-[var(--fg-muted)]">/5</span></span>
                      ) : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {a.sla_breaches > 0 ? <Badge tone="rose" size="sm">{a.sla_breaches}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                    </td>
                  </tr>
                ))}
              </TablePanel>
            </>
          ) : (
            <Panel icon="users" tone="indigo" title="Agent Performance">
              <EmptyState icon="users" title="No agent data" description="No agent activity recorded for this period." compact />
            </Panel>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: SLA
         ════════════════════════════════════════════════════════════ */}
      {tab === "sla" && slaCompliance && (
        <div className="space-y-5">
          {/* SLA Summary with Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { label: "Response SLA", pct: slaCompliance.summary?.response_compliance_pct || 0, met: slaCompliance.summary?.response_met || 0, breached: slaCompliance.summary?.response_breached || 0, color: CHART_COLORS.blue, tone: "blue", icon: "clock" },
              { label: "Resolution SLA", pct: slaCompliance.summary?.resolve_compliance_pct || 0, met: slaCompliance.summary?.resolve_met || 0, breached: slaCompliance.summary?.resolve_breached || 0, color: CHART_COLORS.emerald, tone: "emerald", icon: "check-circle" },
            ].map((g, i) => (
              <Panel key={g.label} icon={g.icon} tone={g.tone} title={g.label} delay={i * 60}>
                <div className="flex items-center gap-6">
                  <div className="shrink-0">
                    <Gauge pct={Number(g.pct)} color={g.color} />
                  </div>
                  <div>
                    <p className="text-4xl font-semibold text-[var(--fg-primary)] mb-1.5 tabular-nums">{g.pct}%</p>
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="text-emerald-500 font-medium tabular-nums">{g.met} met</span>
                      <span className="text-[var(--fg-subtle)]">|</span>
                      <span className="text-rose-500 font-medium tabular-nums">{g.breached} breached</span>
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          {/* SLA Violations — hierarchical drill-down (team → people → tickets) */}
          <Panel
            icon="alert-triangle"
            tone="rose"
            title="SLA Violations"
            subtitle="Drill from teams down to the people and tickets responsible"
          >
            <SlaInsights
              violations={slaViolations}
              scope={slaViolationScope}
              onOpenTicket={(id) => navigate(`/tickets/${id}`)}
            />
          </Panel>

          {/* SLA Trend Chart */}
          {slaCompliance.slaTrend?.length > 0 && (
            <Panel icon="trending-up" tone="teal" title="SLA Compliance Trend">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={slaCompliance.slaTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
                  <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" width={40} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}%`} />} cursor={cursorFill} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Line type="monotone" dataKey="response_pct" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Response %" />
                  <Line type="monotone" dataKey="resolve_pct" stroke={CHART_COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Resolve %" />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* SLA Violation by Priority */}
          {slaPriorityBreakdown.length > 0 && (
            <Panel icon="flag" tone="rose" title="SLA Violation by Priority">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={slaPriorityBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="priority" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey="response_violations" fill={CHART_COLORS.accent} name="Response Violations" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="resolve_violations" fill={CHART_COLORS.amber} name="Resolve Violations" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {/* By Policy Table */}
          {slaCompliance.byPolicy?.length > 0 && (
            <TablePanel
              icon="sla" tone="teal" title="Compliance by Policy"
              columns={["Policy", "Tickets", "Resp. Met", "Resp. Breached", "Resp. %", "Res. Met", "Res. Breached", "Res. %"]}
            >
              {slaCompliance.byPolicy.map(p => (
                <tr key={p.policy_name} className="hover:bg-[var(--bg-surface)] transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-[var(--fg-primary)]">{p.policy_name}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)] tabular-nums">{p.total_tickets}</td>
                  <td className="px-5 py-3.5 text-sm text-emerald-500 tabular-nums">{p.response_met}</td>
                  <td className="px-5 py-3.5 text-sm text-rose-500 tabular-nums">{p.response_breached}</td>
                  <td className="px-5 py-3.5"><Badge tone={p.response_pct >= 90 ? "emerald" : p.response_pct >= 70 ? "amber" : "rose"} size="sm">{p.response_pct}%</Badge></td>
                  <td className="px-5 py-3.5 text-sm text-emerald-500 tabular-nums">{p.resolve_met}</td>
                  <td className="px-5 py-3.5 text-sm text-rose-500 tabular-nums">{p.resolve_breached}</td>
                  <td className="px-5 py-3.5"><Badge tone={p.resolve_pct >= 90 ? "emerald" : p.resolve_pct >= 70 ? "amber" : "rose"} size="sm">{p.resolve_pct}%</Badge></td>
                </tr>
              ))}
            </TablePanel>
          )}

          {/* Requests Approaching SLA Violation */}
          <Panel
            icon="alert-triangle"
            tone="amber"
            title="Approaching SLA Violation"
            subtitle="Tickets at risk of breaching SLA soon"
            right={atRiskTickets.count > 0 ? <Badge tone="amber" size="sm">{atRiskTickets.count} at risk</Badge> : null}
            bodyClass=""
          >
            {atRiskTickets.tickets?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                      {["Ticket", "Subject", "Priority", "Assignee", "SLA Policy", "Time Left"].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-label whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {atRiskTickets.tickets.map(t => {
                      const minsLeft = Math.min(
                        t.response_mins_left != null && !t.response_met_at ? t.response_mins_left : 99999,
                        t.resolve_mins_left != null && !t.resolve_met_at ? t.resolve_mins_left : 99999
                      );
                      const timeLabel = minsLeft < 60 ? `${minsLeft}m` : `${Math.round(minsLeft / 60)}h ${minsLeft % 60}m`;
                      return (
                        <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-[var(--bg-surface)] transition-colors cursor-pointer">
                          <td className="px-5 py-3.5 text-sm font-mono font-semibold text-[var(--accent)] whitespace-nowrap">{t.ticket_number}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)] max-w-[200px] truncate">{t.subject}</td>
                          <td className="px-5 py-3.5"><Badge tone={t.priority_key === "urgent" || t.priority_key === "high" ? "rose" : "amber"} size="sm">{t.priority_label}</Badge></td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.assignee_name || "Unassigned"}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.policy_name}</td>
                          <td className="px-5 py-3.5">
                            <Badge tone={minsLeft < 30 ? "rose" : "amber"} size="sm">{timeLabel}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="check-circle" tone="emerald" title="All clear" description="No tickets approaching SLA violation." compact />
            )}
          </Panel>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: CSAT
         ════════════════════════════════════════════════════════════ */}
      {tab === "csat" && satisfaction && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Avg Rating", value: satisfaction.summary?.avg_rating ? satisfaction.summary.avg_rating.toFixed(1) : "0", icon: "star", iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15", hint: "Mean CSAT score" },
              { label: "Total Ratings", value: satisfaction.summary?.total_ratings || 0, icon: "message-circle", iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15", hint: "Responses received" },
              { label: "Positive (4-5)", value: satisfaction.summary?.positive_ratings || 0, icon: "thumbsUp", iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", hint: "Happy customers" },
              { label: "Negative (1-2)", value: satisfaction.summary?.negative_ratings || 0, icon: "thumbsDown", iconCls: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15", hint: "Needs attention" },
            ].map((kpi, i) => (
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
                <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">{kpi.value}</p>
                <p className="mt-3 text-[11px] text-[var(--fg-muted)]">{kpi.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Rating Distribution Bar */}
            <Panel icon="bar-chart" tone="violet" title="Rating Distribution">
              {(satisfaction.distribution || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={satisfaction.distribution || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="rating" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} tickFormatter={v => `${v} ★`} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Bar dataKey="count" fill={CHART_COLORS.violet} radius={[6, 6, 0, 0]} name="Responses" maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon="star" title="No ratings yet" compact />
              )}
            </Panel>

            {/* CSAT Trend */}
            {satisfaction.trend?.length > 0 && (
              <Panel icon="trending-up" tone="amber" title="CSAT Trend Over Time">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={satisfaction.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} tickFormatter={v => v.slice(5)} />
                    <YAxis domain={[1, 5]} tick={axisTick} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Line type="monotone" dataKey="avg_rating" stroke={CHART_COLORS.amber} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Avg Rating" />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: TEAMS
         ════════════════════════════════════════════════════════════ */}
      {tab === "teams" && (
        <div className="space-y-5">
          {teamPerformance.length > 0 ? (
            <>
              {/* Team bar chart */}
              <Panel icon="bar-chart" tone="cyan" title="Team Ticket Load">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teamPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="team_name" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey="closed_tickets" stackId="a" fill={CHART_COLORS.emerald} name="Closed" />
                    <Bar dataKey="open_tickets" stackId="a" fill={CHART_COLORS.blue} name="Open" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Team table */}
              <TablePanel
                icon="layers" tone="cyan" title="Team Performance Details"
                columns={["Team", "Total", "Closed", "Open", "Close %", "Avg Res.", "SLA ✗"]}
              >
                {teamPerformance.map(t => (
                  <tr key={t.team_id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-[var(--fg-primary)]">{t.team_name}</td>
                    <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)] tabular-nums">{t.total_tickets}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-emerald-500 tabular-nums">{t.closed_tickets}</td>
                    <td className="px-5 py-3.5 text-sm text-blue-500 tabular-nums">{t.open_tickets}</td>
                    <td className="px-5 py-3.5"><Badge tone={t.close_rate >= 80 ? "emerald" : t.close_rate >= 50 ? "amber" : "rose"} size="sm">{t.close_rate || 0}%</Badge></td>
                    <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.avg_resolution_hours ? `${Math.round(t.avg_resolution_hours)}h` : "—"}</td>
                    <td className="px-5 py-3.5">
                      {t.sla_breaches > 0 ? <Badge tone="rose" size="sm">{t.sla_breaches}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                    </td>
                  </tr>
                ))}
              </TablePanel>

              {/* Top Requesters */}
              {requesterActivity.length > 0 && (
                <TablePanel
                  icon="user" tone="violet" title="Top Requesters"
                  columns={["Requester", "Total", "Closed", "Open", "Avg Res."]}
                >
                  {requesterActivity.slice(0, 10).map(r => (
                    <tr key={r.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-[var(--fg-primary)]">{r.full_name}</p>
                        <p className="text-[11px] text-[var(--fg-muted)]">{r.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)] tabular-nums">{r.total_tickets}</td>
                      <td className="px-5 py-3.5 text-sm text-emerald-500 tabular-nums">{r.closed}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-500 tabular-nums">{r.open}</td>
                      <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{r.avg_resolution_hours ? `${Math.round(r.avg_resolution_hours)}h` : "—"}</td>
                    </tr>
                  ))}
                </TablePanel>
              )}
            </>
          ) : (
            <Panel icon="layers" tone="cyan" title="Team Performance">
              <EmptyState icon="teams" title="No team data" description="No team activity recorded for this period." compact />
            </Panel>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: WORKLOAD
         ════════════════════════════════════════════════════════════ */}
      {tab === "workload" && (
        <div className="space-y-5">
          {/* Requests by Technician — Stacked Bar */}
          {agentWorkload.agents?.length > 0 ? (
            <>
              <Panel icon="users" tone="indigo" title="Requests by Technician">
                <ResponsiveContainer width="100%" height={Math.max(250, agentWorkload.agents.length * 40)}>
                  <BarChart data={agentWorkload.agents} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} allowDecimals={false} />
                    <YAxis type="category" dataKey="full_name" tick={axisTick} tickLine={false} axisLine={false} width={100} />
                    <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey="on_hold" stackId="a" fill={CHART_COLORS.amber} name="On Hold" />
                    <Bar dataKey="open_tickets" stackId="a" fill={CHART_COLORS.blue} name="Open" />
                    <Bar dataKey="overdue" stackId="a" fill={CHART_COLORS.accent} name="Overdue" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Agent Workload Table */}
              <TablePanel
                icon="activity" tone="indigo" title="Technician Workload Details"
                columns={["Technician", "On Hold", "Open", "Overdue", "Total"]}
              >
                {agentWorkload.agents.map(a => (
                  <tr key={a.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.full_name} />
                        <div>
                          <p className="text-sm font-medium text-[var(--fg-primary)]">{a.full_name}</p>
                          <p className="text-[11px] text-[var(--fg-muted)]">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-amber-500 font-medium tabular-nums">{a.on_hold}</td>
                    <td className="px-5 py-3.5 text-sm text-blue-500 font-medium tabular-nums">{a.open_tickets}</td>
                    <td className="px-5 py-3.5">
                      {a.overdue > 0 ? <Badge tone="rose" size="sm">{a.overdue}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-[var(--fg-primary)] tabular-nums">{a.total}</td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="bg-[var(--bg-surface)]/40 font-semibold">
                  <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)]">Total</td>
                  <td className="px-5 py-3.5 text-sm text-amber-500 tabular-nums">{agentWorkload.agents.reduce((s, a) => s + a.on_hold, 0)}</td>
                  <td className="px-5 py-3.5 text-sm text-blue-500 tabular-nums">{agentWorkload.agents.reduce((s, a) => s + a.open_tickets, 0)}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--accent)] tabular-nums">{agentWorkload.agents.reduce((s, a) => s + a.overdue, 0)}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)] tabular-nums">{agentWorkload.agents.reduce((s, a) => s + a.total, 0)}</td>
                </tr>
              </TablePanel>
            </>
          ) : (
            <Panel icon="users" tone="indigo" title="Technician Workload">
              <EmptyState icon="users" title="No workload data" description="No technician workload data available." compact />
            </Panel>
          )}

          {/* Unassigned Tickets Summary */}
          <Panel
            icon="alert-triangle"
            tone="amber"
            title="Unassigned & Open Requests"
            right={<span className="text-2xl font-semibold text-[var(--fg-primary)] tabular-nums">{agentWorkload.unassigned?.total || 0}</span>}
          >
            {agentWorkload.unassigned?.byTeam?.length > 0 ? (
              <div className="space-y-3">
                {agentWorkload.unassigned.byTeam.map(t => {
                  const pct = agentWorkload.unassigned.total > 0
                    ? Math.round((t.count / agentWorkload.unassigned.total) * 100) : 0;
                  return (
                    <div key={t.team_name || "none"} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[var(--fg-secondary)] w-32 truncate">{t.team_name || "No Team"}</span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500 transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-[var(--fg-primary)] w-8 text-right tabular-nums">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon="check-circle" tone="emerald" title="Everything assigned" description="All open tickets are assigned." compact />
            )}
          </Panel>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: TRENDS
         ════════════════════════════════════════════════════════════ */}
      {tab === "trends" && (
        <div className="space-y-5">
          <Panel icon="trending-up" tone="blue" title="Created vs Closed">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trends}>
                <defs>
                  <ChartGradient id="gC2" color={CHART_COLORS.accent} />
                  <ChartGradient id="gR2" color={CHART_COLORS.emerald} />
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="period" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<ChartTooltip />} cursor={cursorFill} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Area type="monotone" dataKey="created" stroke={CHART_COLORS.accent} fill="url(#gC2)" strokeWidth={2} name="Created" />
                <Area type="monotone" dataKey="closed" stroke={CHART_COLORS.emerald} fill="url(#gR2)" strokeWidth={2} name="Closed" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Resolution by Priority */}
          {resolutionDist?.byPriority?.length > 0 && (
            <Panel icon="clock" tone="amber" title="Avg Resolution Time by Priority">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resolutionDist.byPriority}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="priority" tick={axisTick} tickLine={false} axisLine={{ stroke: ct.axisLine }} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} unit="h" width={36} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${Math.round(v)}h`} />} cursor={cursorFill} />
                  <Bar dataKey="avg_hours" fill={CHART_COLORS.amber} radius={[6, 6, 0, 0]} name="Avg Hours" maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: EXPORT
         ════════════════════════════════════════════════════════════ */}
      {tab === "export" && (
        <div className="space-y-5">
          <Panel
            icon="download"
            tone="emerald"
            title="Export Reports to Excel"
            subtitle="Download detailed data for the selected date range"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { type: "tickets", title: "All Tickets", desc: "Every ticket with status, priority, assignee, SLA, CSAT", icon: "ticket", cls: "bg-[var(--accent)]/10 text-[var(--accent)]" },
                { type: "agents", title: "Agent Performance", desc: "Agent metrics: tickets, close rate, resolution time, CSAT", icon: "users", cls: "bg-indigo-500/10 text-indigo-500" },
                { type: "sla", title: "SLA Compliance", desc: "SLA data per ticket: policy, due dates, breach status", icon: "sla", cls: "bg-teal-500/10 text-teal-500" },
              ].map(exp => (
                <button key={exp.type} onClick={() => downloadExport(exp.type)}
                  className={cn(
                    "group flex flex-col items-start p-5 rounded-xl text-left",
                    "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                    "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]"
                  )}>
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110", exp.cls)}>
                    <Icon name={exp.icon} size={20} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">{exp.title}</p>
                  <p className="text-xs text-[var(--fg-muted)] mb-3 leading-relaxed">{exp.desc}</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
                    <Icon name="download" size={12} />
                    Download .xlsx
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <div className="flex items-start gap-3 p-4 rounded-2xl text-xs text-[var(--fg-muted)] bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <span className="h-8 w-8 rounded-lg bg-slate-500/10 text-slate-400 flex items-center justify-center shrink-0">
              <Icon name="calendar" size={16} />
            </span>
            <div className="leading-relaxed pt-0.5">
              <p className="text-[var(--fg-secondary)]"><strong className="text-[var(--fg-primary)]">Date range:</strong> {dateParams.start_date} → {dateParams.end_date}</p>
              <p className="mt-1">Change the date range using the filter in the top-right corner. All exports reflect the selected period.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
