/**
 * Reports & Analytics Page — Advanced
 * Tabs: Overview · Agents · SLA · CSAT · Teams · Trends · Export
 * Charts via Recharts, Excel export, full date filtering
 */

import { useState, useEffect, useMemo } from "react";
import { reportsApi, API_URL } from "../services/api";
import { useToast } from "../contexts/toast";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Card, { StatCard } from "../components/ui/Card";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

function cn(...parts) { return parts.filter(Boolean).join(" "); }

// ── Vodafone-aligned chart palette ──────────────────────────────
const COLORS = ["#E60000", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EC4899", "#6366F1"];
const PIE_COLORS = ["#E60000", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4"];

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

// Shared chart tooltip style
const tooltipStyle = {
  contentStyle: { background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "var(--fg-primary)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--fg-secondary)" },
};

export default function Reports() {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [dateRange, setDateRange] = useState("30");
  const [loading, setLoading] = useState(true);

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
      const [m, a, s, c, t, tp, rd, hm, ra, aw, ar, spb] = await Promise.all([
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
    } catch (err) { console.error("Failed to load reports", err); }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-4" />
          <p className="text-sm text-[var(--fg-secondary)]">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Reports & Analytics
            </h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">Comprehensive performance metrics and insights</p>
          </div>
          <div className={cn(
            "flex gap-1 p-1 rounded-lg",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}>
            {[{ v: "7", l: "7D" }, { v: "30", l: "30D" }, { v: "90", l: "90D" }, { v: "365", l: "1Y" }].map(d => (
              <button key={d.v} onClick={() => setDateRange(d.v)}
                className={cn(
                  "px-4 py-2 text-xs font-medium rounded-md transition-all",
                  dateRange === d.v
                    ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
                )}>
                {d.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div className={cn(
        "flex gap-1 p-1 rounded-lg overflow-x-auto",
        "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
      )}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
              tab === t.key
                ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
            )}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          TAB: OVERVIEW
         ════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Tickets" value={metrics?.summary?.total_tickets || 0} color="accent" icon={<Icon name="ticket" size={18} />} />
            <StatCard label="Closed" value={metrics?.summary?.closed_tickets || 0} color="emerald" icon={<Icon name="check" size={18} />} />
            <StatCard label="Open" value={metrics?.summary?.open_tickets || 0} color="blue" icon={<Icon name="inbox" size={18} />} />
            <StatCard label="Avg Resolution" value={metrics?.summary?.avg_resolution_hours ? `${Math.round(metrics.summary.avg_resolution_hours)}h` : "N/A"} color="amber" icon={<Icon name="clock" size={18} />} />
          </div>

          {/* Unassigned & Open Gauge Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { label: "Unassigned Requests", value: agentWorkload.unassigned?.total || 0, max: Math.max(1, metrics?.summary?.open_tickets || 1), color: "#F59E0B", tint: "amber" },
              { label: "SLA Violated (Open)", value: slaCompliance?.summary?.response_breached || 0, max: Math.max(1, slaCompliance?.summary?.total_tickets_with_sla || 1), color: "#E60000", tint: "rose" },
            ].map(g => {
              const pct = Math.min(100, Math.round((g.value / g.max) * 100));
              return (
                <Card key={g.label} tint={g.tint} hover={false}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <h3 className="text-sm font-semibold text-[var(--fg-primary)]">{g.label}</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <ResponsiveContainer width={160} height={100}>
                        <PieChart>
                          <Pie data={[{ value: pct }, { value: 100 - pct }]}
                            cx={80} cy={90} startAngle={180} endAngle={0}
                            innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                            <Cell fill={g.color} />
                            <Cell fill="var(--border-default)" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-end justify-center pb-2">
                        <span className="text-2xl font-bold text-[var(--fg-primary)]">{g.value}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-[var(--fg-primary)]">{pct}%</p>
                      <p className="text-xs text-[var(--fg-muted)]">of {g.max} total</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Ticket Trend Area Chart */}
            <Card tint="blue" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Icon name="trending-up" size={16} className="text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Ticket Volume</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trends}>
                  <defs>
                    <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E60000" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E60000" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gClosed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="period" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="created" stroke="#E60000" fill="url(#gCreated)" strokeWidth={2} name="Created" />
                  <Area type="monotone" dataKey="closed" stroke="#10B981" fill="url(#gClosed)" strokeWidth={2} name="Closed" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Priority Pie */}
            <Card tint="amber" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Icon name="flag" size={16} className="text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">By Priority</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={metrics?.byPriority || []} dataKey="count" nameKey="label" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={95} paddingAngle={3} strokeWidth={0}>
                    {(metrics?.byPriority || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Distribution Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: "By Status", data: metrics?.byStatus, icon: "inbox", tint: "blue" },
              { title: "By Channel", data: metrics?.byChannel, icon: "mail", tint: "cyan" },
              { title: "By Type", data: metrics?.byType, icon: "tag", tint: "violet" },
              { title: "Resolution Distribution", data: resolutionDist?.buckets, icon: "clock", tint: "emerald" },
            ].map(section => (
              <Card key={section.title} tint={section.tint} spotlight hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center">
                    <Icon name={section.icon} size={16} className="text-[var(--fg-secondary)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">{section.title}</h3>
                </div>
                <div className="space-y-2">
                  {(section.data || []).map((item) => {
                    const label = item.label || item.bucket;
                    const total = (section.data || []).reduce((s, i) => s + (i.count || 0), 0);
                    const pct = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-[var(--fg-secondary)] w-28 truncate">{label}</span>
                        <div className="flex-1 h-2 rounded-full bg-[var(--bg-base)] overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-[var(--fg-primary)] w-8 text-right">{item.count}</span>
                      </div>
                    );
                  })}
                  {(!section.data || section.data.length === 0) && (
                    <p className="text-sm text-[var(--fg-muted)] text-center py-4">No data available</p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Heatmap */}
          <Card tint="indigo" hover={false}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Icon name="grid" size={16} className="text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Ticket Creation Heatmap</h3>
              <span className="text-xs text-[var(--fg-muted)] ml-auto">Hour of day vs Day of week</span>
            </div>
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
                          style={{ backgroundColor: intensity > 0 ? `rgba(230, 0, 0, ${0.1 + intensity * 0.8})` : "var(--bg-base)" }}
                          title={`${dayNames[d]} ${cell.hour}:00 — ${cell.count} tickets`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Requests Inflow by Day of Week */}
          {(() => {
            const dowData = dayNames.map((name, i) => {
              const dayIdx = i + 1; // MySQL DAYOFWEEK: 1=Sun, 2=Mon...
              const dayTickets = heatmap.filter(h => h.day_of_week === dayIdx);
              const created = dayTickets.reduce((sum, h) => sum + h.count, 0);
              return { day: name, created };
            });
            return (
              <Card tint="teal" hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                    <Icon name="bar-chart" size={16} className="text-teal-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Requests Inflow by Day</h3>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis dataKey="day" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="created" fill="#E60000" radius={[4, 4, 0, 0]} name="Tickets Created" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: AGENTS
         ════════════════════════════════════════════════════════════ */}
      {tab === "agents" && (
        <div className="space-y-6">
          {agentPerformance.length > 0 ? (
            <>
              {/* Agent bar chart */}
              <Card tint="indigo" hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Icon name="bar-chart" size={16} className="text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Tickets by Agent</h3>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentPerformance} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis type="number" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                    <YAxis type="category" dataKey="full_name" tick={{ fill: "var(--fg-secondary)", fontSize: 11 }} width={80} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="closed_tickets" fill="#10B981" name="Closed" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="open_tickets" fill="#3B82F6" name="Open" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Agent table */}
              <Card tint="indigo" padding={false} hover={false}>
                <div className="px-6 py-4 border-b border-[var(--border-default)]">
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Agent Performance Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                        {["Agent", "Assigned", "Closed", "Open", "Close %", "Avg Res.", "1st Resp.", "CSAT", "SLA ✗"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {agentPerformance.map(a => (
                        <tr key={a.id} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                                {(a.full_name || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[var(--fg-primary)]">{a.full_name}</p>
                                <p className="text-[11px] text-[var(--fg-muted)]">{a.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)]">{a.assigned_tickets}</td>
                          <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{a.closed_tickets}</td>
                          <td className="px-5 py-3.5 text-sm text-blue-400">{a.open_tickets}</td>
                          <td className="px-5 py-3.5">
                            <Badge tone={a.close_rate >= 80 ? "green" : a.close_rate >= 50 ? "amber" : "brand"}>{a.close_rate || 0}%</Badge>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{a.avg_resolution_hours ? `${Math.round(a.avg_resolution_hours)}h` : "—"}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{a.avg_first_response_min ? `${Math.round(a.avg_first_response_min)}m` : "—"}</td>
                          <td className="px-5 py-3.5">
                            {a.avg_satisfaction_rating > 0 ? (
                              <span className="text-sm font-medium text-[var(--fg-primary)]">{a.avg_satisfaction_rating.toFixed(1)}<span className="text-[var(--fg-muted)]">/5</span></span>
                            ) : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {a.sla_breaches > 0 ? <Badge tone="brand">{a.sla_breaches}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card hover={false}>
              <p className="text-sm text-[var(--fg-muted)] text-center py-12">No agent data available for this period</p>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: SLA
         ════════════════════════════════════════════════════════════ */}
      {tab === "sla" && slaCompliance && (
        <div className="space-y-6">
          {/* SLA Summary with Gauges */}
          <div className="grid grid-cols-2 gap-5">
            {[
              { label: "Response SLA", pct: slaCompliance.summary?.response_compliance_pct || 0, met: slaCompliance.summary?.response_met || 0, breached: slaCompliance.summary?.response_breached || 0, color: "#3B82F6", tint: "blue", icon: "clock" },
              { label: "Resolution SLA", pct: slaCompliance.summary?.resolve_compliance_pct || 0, met: slaCompliance.summary?.resolve_met || 0, breached: slaCompliance.summary?.resolve_breached || 0, color: "#10B981", tint: "emerald", icon: "check" },
            ].map(g => (
              <div key={g.label} className={cn("rounded-xl p-6", `bg-${g.tint}-500/10 border border-${g.tint}-500/20`)}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name={g.icon} size={18} className={`text-${g.tint}-400`} />
                  <p className={`text-[11px] font-medium text-${g.tint}-400 uppercase tracking-wider`}>{g.label}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <ResponsiveContainer width={140} height={85}>
                      <PieChart>
                        <Pie data={[{ value: Number(g.pct) }, { value: 100 - Number(g.pct) }]}
                          cx={70} cy={78} startAngle={180} endAngle={0}
                          innerRadius={45} outerRadius={65} dataKey="value" stroke="none">
                          <Cell fill={g.color} />
                          <Cell fill="var(--border-default)" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className="text-4xl font-bold text-[var(--fg-primary)] mb-1">{g.pct}%</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-400 font-medium">{g.met} met</span>
                      <span className="text-[var(--fg-muted)]">|</span>
                      <span className="text-rose-400 font-medium">{g.breached} breached</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* SLA Trend Chart */}
          {slaCompliance.slaTrend?.length > 0 && (
            <Card tint="teal" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                  <Icon name="trending-up" size={16} className="text-teal-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">SLA Compliance Trend</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={slaCompliance.slaTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="week" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} unit="%" />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="response_pct" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Response %" />
                  <Line type="monotone" dataKey="resolve_pct" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Resolve %" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* SLA Violation by Priority */}
          {slaPriorityBreakdown.length > 0 && (
            <Card tint="rose" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <Icon name="flag" size={16} className="text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">SLA Violation by Priority</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={slaPriorityBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="priority" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="response_violations" fill="#E60000" name="Response Violations" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolve_violations" fill="#F59E0B" name="Resolve Violations" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* By Policy Table */}
          {slaCompliance.byPolicy?.length > 0 && (
            <Card tint="teal" padding={false} hover={false}>
              <div className="px-6 py-4 border-b border-[var(--border-default)]">
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Compliance by Policy</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                      {["Policy", "Tickets", "Resp. Met", "Resp. Breached", "Resp. %", "Res. Met", "Res. Breached", "Res. %"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {slaCompliance.byPolicy.map(p => (
                      <tr key={p.policy_name} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-medium text-[var(--fg-primary)]">{p.policy_name}</td>
                        <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{p.total_tickets}</td>
                        <td className="px-5 py-3.5 text-sm text-emerald-400">{p.response_met}</td>
                        <td className="px-5 py-3.5 text-sm text-rose-400">{p.response_breached}</td>
                        <td className="px-5 py-3.5"><Badge tone={p.response_pct >= 90 ? "green" : p.response_pct >= 70 ? "amber" : "brand"}>{p.response_pct}%</Badge></td>
                        <td className="px-5 py-3.5 text-sm text-emerald-400">{p.resolve_met}</td>
                        <td className="px-5 py-3.5 text-sm text-rose-400">{p.resolve_breached}</td>
                        <td className="px-5 py-3.5"><Badge tone={p.resolve_pct >= 90 ? "green" : p.resolve_pct >= 70 ? "amber" : "brand"}>{p.resolve_pct}%</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Requests Approaching SLA Violation */}
          <Card tint="amber" padding={false} hover={false}>
            <div className="px-6 py-4 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Icon name="alert-triangle" size={16} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Approaching SLA Violation</h3>
                  <p className="text-xs text-[var(--fg-muted)]">Tickets at risk of breaching SLA soon</p>
                </div>
                {atRiskTickets.count > 0 && (
                  <Badge tone="amber" className="ml-auto">{atRiskTickets.count} at risk</Badge>
                )}
              </div>
            </div>
            {atRiskTickets.tickets?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                      {["Ticket", "Subject", "Priority", "Assignee", "SLA Policy", "Time Left"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
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
                        <tr key={t.id} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-medium text-[var(--accent)]">{t.ticket_number}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)] max-w-[200px] truncate">{t.subject}</td>
                          <td className="px-5 py-3.5"><Badge tone={t.priority_key === "urgent" || t.priority_key === "high" ? "brand" : "amber"}>{t.priority_label}</Badge></td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.assignee_name || "Unassigned"}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.policy_name}</td>
                          <td className="px-5 py-3.5">
                            <Badge tone={minsLeft < 30 ? "brand" : "amber"}>{timeLabel}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <Icon name="check" size={24} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-[var(--fg-muted)]">No tickets approaching SLA violation</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: CSAT
         ════════════════════════════════════════════════════════════ */}
      {tab === "csat" && satisfaction && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Avg Rating" value={satisfaction.summary?.avg_rating ? satisfaction.summary.avg_rating.toFixed(1) : "0"} color="amber" icon={<Icon name="star" size={18} />} />
            <StatCard label="Total Ratings" value={satisfaction.summary?.total_ratings || 0} color="blue" icon={<Icon name="message-circle" size={18} />} />
            <StatCard label="Positive (4-5)" value={satisfaction.summary?.positive_ratings || 0} color="emerald" icon={<Icon name="thumbsUp" size={18} />} />
            <StatCard label="Negative (1-2)" value={satisfaction.summary?.negative_ratings || 0} color="accent" icon={<Icon name="thumbsDown" size={18} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Rating Distribution Bar */}
            <Card tint="purple" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Icon name="bar-chart" size={16} className="text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Rating Distribution</h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={satisfaction.distribution || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="rating" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickFormatter={v => `${v} ★`} />
                  <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#E60000" radius={[4, 4, 0, 0]} name="Responses" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* CSAT Trend */}
            {satisfaction.trend?.length > 0 && (
              <Card tint="amber" hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Icon name="trending-up" size={16} className="text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">CSAT Trend Over Time</h3>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={satisfaction.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                    <YAxis domain={[1, 5]} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} />
                    <Line type="monotone" dataKey="avg_rating" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} name="Avg Rating" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: TEAMS
         ════════════════════════════════════════════════════════════ */}
      {tab === "teams" && (
        <div className="space-y-6">
          {teamPerformance.length > 0 ? (
            <>
              {/* Team bar chart */}
              <Card tint="cyan" hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Icon name="bar-chart" size={16} className="text-cyan-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Team Ticket Load</h3>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teamPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis dataKey="team_name" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="closed_tickets" stackId="a" fill="#10B981" name="Closed" />
                    <Bar dataKey="open_tickets" stackId="a" fill="#3B82F6" name="Open" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Team table */}
              <Card tint="cyan" padding={false} hover={false}>
                <div className="px-6 py-4 border-b border-[var(--border-default)]">
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Team Performance Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                        {["Team", "Total", "Closed", "Open", "Close %", "Avg Res.", "SLA ✗"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {teamPerformance.map(t => (
                        <tr key={t.team_id} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                          <td className="px-5 py-3.5 text-sm font-medium text-[var(--fg-primary)]">{t.team_name}</td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.total_tickets}</td>
                          <td className="px-5 py-3.5 text-sm font-medium text-emerald-400">{t.closed_tickets}</td>
                          <td className="px-5 py-3.5 text-sm text-blue-400">{t.open_tickets}</td>
                          <td className="px-5 py-3.5"><Badge tone={t.close_rate >= 80 ? "green" : t.close_rate >= 50 ? "amber" : "brand"}>{t.close_rate || 0}%</Badge></td>
                          <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{t.avg_resolution_hours ? `${Math.round(t.avg_resolution_hours)}h` : "—"}</td>
                          <td className="px-5 py-3.5">
                            {t.sla_breaches > 0 ? <Badge tone="brand">{t.sla_breaches}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Top Requesters */}
              {requesterActivity.length > 0 && (
                <Card tint="violet" padding={false} hover={false}>
                  <div className="px-6 py-4 border-b border-[var(--border-default)]">
                    <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Top Requesters</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                          {["Requester", "Total", "Closed", "Open", "Avg Res."].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-default)]">
                        {requesterActivity.slice(0, 10).map(r => (
                          <tr key={r.id} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <p className="text-sm font-medium text-[var(--fg-primary)]">{r.full_name}</p>
                              <p className="text-[11px] text-[var(--fg-muted)]">{r.email}</p>
                            </td>
                            <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)]">{r.total_tickets}</td>
                            <td className="px-5 py-3.5 text-sm text-emerald-400">{r.closed}</td>
                            <td className="px-5 py-3.5 text-sm text-blue-400">{r.open}</td>
                            <td className="px-5 py-3.5 text-sm text-[var(--fg-secondary)]">{r.avg_resolution_hours ? `${Math.round(r.avg_resolution_hours)}h` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card hover={false}>
              <p className="text-sm text-[var(--fg-muted)] text-center py-12">No team data available</p>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: WORKLOAD
         ════════════════════════════════════════════════════════════ */}
      {tab === "workload" && (
        <div className="space-y-6">
          {/* Requests by Technician — Stacked Bar */}
          {agentWorkload.agents?.length > 0 ? (
            <>
              <Card tint="indigo" hover={false}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Icon name="users" size={16} className="text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Requests by Technician</h3>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(250, agentWorkload.agents.length * 40)}>
                  <BarChart data={agentWorkload.agents} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis type="number" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="full_name" tick={{ fill: "var(--fg-secondary)", fontSize: 11 }} width={100} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="on_hold" stackId="a" fill="#F59E0B" name="On Hold" />
                    <Bar dataKey="open_tickets" stackId="a" fill="#3B82F6" name="Open" />
                    <Bar dataKey="overdue" stackId="a" fill="#E60000" name="Overdue" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Agent Workload Table */}
              <Card tint="indigo" padding={false} hover={false}>
                <div className="px-6 py-4 border-b border-[var(--border-default)]">
                  <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Technician Workload Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--bg-base)]/50 border-b border-[var(--border-default)]">
                        {["Technician", "On Hold", "Open", "Overdue", "Total"].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {agentWorkload.agents.map(a => (
                        <tr key={a.id} className="hover:bg-[var(--bg-base)]/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                                {(a.full_name || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[var(--fg-primary)]">{a.full_name}</p>
                                <p className="text-[11px] text-[var(--fg-muted)]">{a.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-amber-400 font-medium">{a.on_hold}</td>
                          <td className="px-5 py-3.5 text-sm text-blue-400 font-medium">{a.open_tickets}</td>
                          <td className="px-5 py-3.5">
                            {a.overdue > 0 ? <Badge tone="brand">{a.overdue}</Badge> : <span className="text-sm text-[var(--fg-muted)]">0</span>}
                          </td>
                          <td className="px-5 py-3.5 text-sm font-semibold text-[var(--fg-primary)]">{a.total}</td>
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className="bg-[var(--bg-base)]/30 font-semibold">
                        <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)]">Total</td>
                        <td className="px-5 py-3.5 text-sm text-amber-400">{agentWorkload.agents.reduce((s, a) => s + a.on_hold, 0)}</td>
                        <td className="px-5 py-3.5 text-sm text-blue-400">{agentWorkload.agents.reduce((s, a) => s + a.open_tickets, 0)}</td>
                        <td className="px-5 py-3.5 text-sm text-[var(--accent)]">{agentWorkload.agents.reduce((s, a) => s + a.overdue, 0)}</td>
                        <td className="px-5 py-3.5 text-sm text-[var(--fg-primary)]">{agentWorkload.agents.reduce((s, a) => s + a.total, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <Card hover={false}>
              <p className="text-sm text-[var(--fg-muted)] text-center py-12">No technician workload data available</p>
            </Card>
          )}

          {/* Unassigned Tickets Summary */}
          <Card tint="amber" hover={false}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Icon name="alert-triangle" size={16} className="text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Unassigned & Open Requests</h3>
              <span className="ml-auto text-2xl font-bold text-[var(--fg-primary)]">{agentWorkload.unassigned?.total || 0}</span>
            </div>
            {agentWorkload.unassigned?.byTeam?.length > 0 ? (
              <div className="space-y-2">
                {agentWorkload.unassigned.byTeam.map(t => {
                  const pct = agentWorkload.unassigned.total > 0
                    ? Math.round((t.count / agentWorkload.unassigned.total) * 100) : 0;
                  return (
                    <div key={t.team_name || "none"} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[var(--fg-secondary)] w-32 truncate">{t.team_name || "No Team"}</span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--bg-base)] overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-[var(--fg-primary)] w-8 text-right">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-emerald-400 text-center py-4">All open tickets are assigned</p>
            )}
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: TRENDS
         ════════════════════════════════════════════════════════════ */}
      {tab === "trends" && (
        <div className="space-y-6">
          <Card tint="blue" hover={false}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Icon name="trending-up" size={16} className="text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Created vs Closed</h3>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="gC2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E60000" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E60000" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gR2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis dataKey="period" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="created" stroke="#E60000" fill="url(#gC2)" strokeWidth={2} name="Created" />
                <Area type="monotone" dataKey="closed" stroke="#10B981" fill="url(#gR2)" strokeWidth={2} name="Closed" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Resolution by Priority */}
          {resolutionDist?.byPriority?.length > 0 && (
            <Card tint="amber" hover={false}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Icon name="clock" size={16} className="text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Avg Resolution Time by Priority</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resolutionDist.byPriority}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="priority" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--fg-muted)", fontSize: 11 }} unit="h" />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${Math.round(v)}h`, ""]} />
                  <Bar dataKey="avg_hours" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Avg Hours" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          TAB: EXPORT
         ════════════════════════════════════════════════════════════ */}
      {tab === "export" && (
        <div className="space-y-6">
          <Card tint="emerald" hover={false}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Icon name="download" size={16} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Export Reports to Excel</h3>
                <p className="text-xs text-[var(--fg-muted)]">Download detailed data for the selected date range</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { type: "tickets", title: "All Tickets", desc: "Every ticket with status, priority, assignee, SLA, CSAT", icon: "ticket", color: "text-[var(--accent)]", bg: "bg-[var(--accent)]/10" },
                { type: "agents", title: "Agent Performance", desc: "Agent metrics: tickets, close rate, resolution time, CSAT", icon: "users", color: "text-indigo-400", bg: "bg-indigo-500/10" },
                { type: "sla", title: "SLA Compliance", desc: "SLA data per ticket: policy, due dates, breach status", icon: "sla", color: "text-teal-400", bg: "bg-teal-500/10" },
              ].map(exp => (
                <button key={exp.type} onClick={() => downloadExport(exp.type)}
                  className={cn(
                    "flex flex-col items-start p-5 rounded-xl text-left transition-all",
                    "bg-[var(--bg-base)] border border-[var(--border-default)]",
                    "hover:border-[var(--border-hover)] hover:shadow-lg"
                  )}>
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-3", exp.bg)}>
                    <Icon name={exp.icon} size={20} className={exp.color} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">{exp.title}</p>
                  <p className="text-xs text-[var(--fg-muted)] mb-3">{exp.desc}</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
                    <Icon name="download" size={12} />
                    Download .xlsx
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div className={cn(
            "p-4 rounded-lg text-xs text-[var(--fg-muted)]",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}>
            <p><strong>Date range:</strong> {dateParams.start_date} → {dateParams.end_date}</p>
            <p className="mt-1">Change the date range using the filter in the top-right corner. All exports reflect the selected period.</p>
          </div>
        </div>
      )}
    </div>
  );
}
