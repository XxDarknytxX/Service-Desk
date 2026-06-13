/**
 * Dashboard Page — Vodafone Service Desk
 *
 * Premium overview experience:
 *  • Branded hero with a live, data-driven summary line
 *  • Tinted KPI cards with share-of-total micro-bars and staggered entrance
 *  • Real status-distribution donut (Recharts) driven by statusBuckets
 *  • Recent tickets + live activity timeline + quick actions
 *
 * Fully token-driven (dark & light), responsive, with shimmer loading.
 * All data flows, navigation, and the create-ticket modal are preserved.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import { api } from "../services/api";
import { useAuth } from "../contexts/auth";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Skeleton, { SkeletonKpis } from "../components/ui/Skeleton";
import { ChartTooltip } from "../components/ui/chart";
import TicketCreateModal from "../components/tickets/TicketCreateModal";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const STATUS_META = {
  new: { tone: "blue", hex: "#3B82F6", text: "text-blue-500" },
  open: { tone: "indigo", hex: "#6366F1", text: "text-indigo-500" },
  pending: { tone: "amber", hex: "#F59E0B", text: "text-amber-500" },
  on_hold: { tone: "slate", hex: "#94A3B8", text: "text-slate-400" },
  solved: { tone: "emerald", hex: "#10B981", text: "text-emerald-500" },
  closed: { tone: "slate", hex: "#64748B", text: "text-slate-400" },
};

const ACTIVITY_META = {
  "ticket.created": { icon: "plus", cls: "bg-emerald-500/10 text-emerald-500" },
  "ticket.updated": { icon: "pencil", cls: "bg-blue-500/10 text-blue-500" },
  "ticket.commented": { icon: "message", cls: "bg-sky-500/10 text-sky-500" },
  "ticket.tag_added": { icon: "tag", cls: "bg-violet-500/10 text-violet-500" },
  "ticket.assigned": { icon: "userPlus", cls: "bg-indigo-500/10 text-indigo-500" },
  "ticket.reassigned": { icon: "users", cls: "bg-amber-500/10 text-amber-500" },
  "ticket.escalated": { icon: "arrowUp", cls: "bg-orange-500/10 text-orange-500" },
  "ticket.sent_for_approval": { icon: "shield", cls: "bg-violet-500/10 text-violet-500" },
  "approval.approved": { icon: "checkCircle", cls: "bg-emerald-500/10 text-emerald-500" },
  "approval.rejected": { icon: "close", cls: "bg-rose-500/10 text-rose-500" },
  "approval.delegated": { icon: "share", cls: "bg-cyan-500/10 text-cyan-500" },
  "sla.paused": { icon: "pause", cls: "bg-amber-500/10 text-amber-500" },
  "sla.resumed": { icon: "play", cls: "bg-emerald-500/10 text-emerald-500" },
  "sla.breached": { icon: "alertTriangle", cls: "bg-rose-500/10 text-rose-500" },
  "form.sent": { icon: "send", cls: "bg-cyan-500/10 text-cyan-500" },
  "form.completed": { icon: "checkCircle", cls: "bg-emerald-500/10 text-emerald-500" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isAgent = user?.roles?.includes("admin") || user?.roles?.includes("agent");

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api("/dashboard");
      setDashboardData(data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error(error.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const bucketCount = (key) =>
    dashboardData?.statusBuckets?.find((b) => b.status_key === key)?.total || 0;

  const timeAgo = (timestamp) => {
    const diffSecs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (diffSecs < 60) return "just now";
    const m = Math.floor(diffSecs / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
  };

  const getStatusTone = (statusLabel) => {
    const key = statusLabel?.toLowerCase().replace(/\s+/g, "_");
    return STATUS_META[key]?.tone || "slate";
  };

  const getActivityDescription = (activity) => {
    const actor = activity.actor_name || "System";
    switch (activity.event_type) {
      case "ticket.created": return `${actor} created`;
      case "ticket.updated": return `${actor} updated`;
      case "ticket.commented": return `${actor} commented on`;
      case "ticket.tag_added": return `${actor} tagged`;
      case "ticket.assigned": return `${actor} was assigned`;
      case "ticket.reassigned": return `${actor} reassigned`;
      case "ticket.escalated": return `${actor} escalated`;
      case "ticket.sent_for_approval": return `${actor} sent for approval`;
      case "approval.approved": return `${actor} approved`;
      case "approval.rejected": return `${actor} rejected`;
      case "approval.level_advanced": return "Approval advanced on";
      case "approval.post_actions_applied": return "Post-approval actions on";
      case "approval.delegated": return `${actor} delegated approval on`;
      case "sla.paused": return "SLA paused on";
      case "sla.resumed": return "SLA resumed on";
      case "sla.breached": return "SLA breached on";
      case "form.sent": return `${actor} sent a customer form on`;
      case "form.completed": return "Customer form completed on";
      default: return `${actor} updated`;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const firstName = (user?.fullName || user?.full_name || "User").split(" ")[0];

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  // ── Derived metrics ────────────────────────────────────────────
  const buckets = dashboardData?.statusBuckets || [];
  const totalTickets = buckets.reduce((sum, b) => sum + Number(b.total), 0);
  const openCount = dashboardData?.quickStats?.openTickets || 0;
  const urgentCount = dashboardData?.quickStats?.urgentTickets || 0;
  const pendingCount = bucketCount("pending");
  const solvedCount = bucketCount("solved");

  const share = (v) => (totalTickets > 0 ? Math.round((v / totalTickets) * 100) : 0);

  // ── KPI configuration (static classes — no dynamic Tailwind) ────
  const kpis = [
    {
      label: "Open",
      value: openCount,
      icon: "inbox",
      iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15",
      bar: "bg-blue-500",
      pct: share(openCount),
      hint: "New & open tickets",
    },
    {
      label: "Urgent",
      value: urgentCount,
      icon: "alertTriangle",
      iconCls: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15",
      bar: "bg-[var(--accent)]",
      pct: share(urgentCount),
      hint: "High & urgent, unresolved",
    },
    {
      label: "Pending",
      value: pendingCount,
      icon: "clock",
      iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15",
      bar: "bg-amber-500",
      pct: share(pendingCount),
      hint: "Waiting on someone",
    },
    {
      label: "Solved",
      value: solvedCount,
      icon: "checkCircle",
      iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
      bar: "bg-emerald-500",
      pct: share(solvedCount),
      hint: "Ready to close",
    },
  ];

  // ── Donut data ─────────────────────────────────────────────────
  const donutData = buckets.map((b) => ({
    name: b.status_label,
    key: b.status_key,
    value: Number(b.total),
    color: STATUS_META[b.status_key]?.hex || "#94A3B8",
  }));

  // ── Summary line ───────────────────────────────────────────────
  const summaryLine = (() => {
    if (totalTickets === 0) return "No tickets in the queue yet — you're all caught up.";
    const parts = [];
    parts.push(`${openCount} open ticket${openCount !== 1 ? "s" : ""}`);
    if (urgentCount > 0) parts.push(`${urgentCount} needing urgent attention`);
    else if (pendingCount > 0) parts.push(`${pendingCount} pending`);
    return `You have ${parts.join(" · ")}.`;
  })();

  // ── Quick actions ──────────────────────────────────────────────
  const quickActions = [
    { label: "New ticket", desc: "Log a request", icon: "plus", cls: "bg-[var(--accent)]/10 text-[var(--accent)]", onClick: () => setShowCreateModal(true) },
    { label: "All tickets", desc: "Browse the queue", icon: "tickets", cls: "bg-blue-500/10 text-blue-500", onClick: () => navigate("/tickets") },
    { label: "Approvals", desc: "Review requests", icon: "checkCircle", cls: "bg-violet-500/10 text-violet-500", onClick: () => navigate("/approvals") },
    ...(isAgent
      ? [{ label: "Reports", desc: "View analytics", icon: "reports", cls: "bg-emerald-500/10 text-emerald-500", onClick: () => navigate("/reports") }]
      : [{ label: "Knowledge base", desc: "Find answers", icon: "knowledgeBase", cls: "bg-amber-500/10 text-amber-500", onClick: () => navigate("/knowledge-base") }]),
  ];

  // ── Skeleton loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton rounded-2xl h-28" />
        <SkeletonKpis count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96" rounded="rounded-2xl" />
          <Skeleton className="h-96" rounded="rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] animate-fade-up"
      >
        {/* decorative brand glow */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--accent)] opacity-[0.10] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-40" />

        <div className="relative flex flex-col gap-5 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[var(--fg-muted)] text-xs font-medium mb-2">
              <Icon name="calendar" size={13} />
              {currentDate}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--fg-primary)]">
              {getGreeting()}, <span className="text-gradient-accent">{firstName}</span>
            </h1>
            <p className="text-[var(--fg-secondary)] mt-2 text-sm max-w-xl leading-relaxed">
              {summaryLine}
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isAgent && (
              <Button
                variant="secondary"
                onClick={() => navigate("/reports")}
                icon={<Icon name="reports" size={15} />}
              >
                Reports
              </Button>
            )}
            <Button
              onClick={() => setShowCreateModal(true)}
              icon={<Icon name="plus" size={16} />}
            >
              New Ticket
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <button
            key={kpi.label}
            onClick={() => navigate("/tickets")}
            title={kpi.hint}
            className={cn(
              "group relative text-left overflow-hidden rounded-2xl p-5",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
              "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
              "animate-kpi-rise"
            )}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-label">{kpi.label}</span>
              <span
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110",
                  kpi.iconCls
                )}
              >
                <Icon name={kpi.icon} size={16} />
              </span>
            </div>
            <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
              {kpi.value}
            </p>
            <div className="mt-4">
              <div className="h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700 ease-out", kpi.bar)}
                  style={{ width: `${Math.max(kpi.pct, totalTickets > 0 && kpi.value > 0 ? 6 : 0)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-[var(--fg-muted)]">
                {totalTickets > 0 ? `${kpi.pct}% of all tickets` : kpi.hint}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent tickets */}
        <section
          className="lg:col-span-2 flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                <Icon name="tickets" size={16} />
              </span>
              <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                Recent tickets
              </h2>
              {dashboardData?.recentTickets?.length > 0 && (
                <Badge tone="slate" size="sm">{dashboardData.recentTickets.length}</Badge>
              )}
            </div>
            <button
              onClick={() => navigate("/tickets")}
              className="flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:gap-1.5 transition-all"
            >
              View all <Icon name="arrowRight" size={13} />
            </button>
          </div>

          {dashboardData?.recentTickets?.length > 0 ? (
            <div className="divide-y divide-[var(--border-default)] flex-1">
              {dashboardData.recentTickets.slice(0, 9).map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-surface)] cursor-pointer transition-colors duration-150 group"
                >
                  <span className="text-[11px] font-mono font-medium whitespace-nowrap px-1.5 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--fg-secondary)] group-hover:text-[var(--accent)] transition-colors">
                    {ticket.ticket_number}
                  </span>
                  <p className="text-sm text-[var(--fg-primary)] truncate flex-1 font-medium">
                    {ticket.subject}
                  </p>
                  <Badge tone={getStatusTone(ticket.status_label)} size="sm" dot>
                    {ticket.status_label}
                  </Badge>
                  <span className="text-xs text-[var(--fg-muted)] whitespace-nowrap w-12 text-right hidden sm:block">
                    {formatDate(ticket.created_at)}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={14}
                    className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all hidden sm:block"
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="inbox"
              title="No tickets yet"
              description="Create your first ticket to get things moving."
              action={
                <Button size="sm" onClick={() => setShowCreateModal(true)} icon={<Icon name="plus" size={14} />}>
                  New Ticket
                </Button>
              }
            />
          )}
        </section>

        {/* Status distribution donut */}
        <section
          className="flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
            <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
              <Icon name="chart" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
              Status distribution
            </h2>
          </div>

          {totalTickets > 0 ? (
            <div className="flex-1 p-5">
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="64%"
                      outerRadius="92%"
                      paddingAngle={donutData.length > 1 ? 3 : 0}
                      cornerRadius={6}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Pie>
                    <RTooltip
                      content={<ChartTooltip hideLabel valueFormatter={(v) => `${v} (${share(v)}%)`} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
                    {totalTickets}
                  </span>
                  <span className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wide">
                    Total
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {donutData.map((entry) => (
                  <div key={entry.key} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-[var(--fg-secondary)] flex-1 truncate">{entry.name}</span>
                    <span className="text-[var(--fg-muted)] text-xs tabular-nums">{share(entry.value)}%</span>
                    <span className="font-semibold text-[var(--fg-primary)] tabular-nums w-6 text-right">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="chart" title="No data yet" description="Ticket status will be charted here." compact />
          )}
        </section>
      </div>

      {/* ── Secondary grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity timeline */}
        <section
          className="lg:col-span-2 flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up"
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
            <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Icon name="activity" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
              Activity
            </h2>
            <span className="relative flex h-1.5 w-1.5 ml-0.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </div>

          {dashboardData?.activityFeed?.length > 0 ? (
            <div className="flex-1 overflow-y-auto max-h-[420px] scrollbar-none">
              <div className="px-5 py-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {dashboardData.activityFeed.slice(0, 12).map((activity) => {
                  const metaInfo = ACTIVITY_META[activity.event_type] || {
                    icon: "lightning",
                    cls: "bg-slate-500/10 text-slate-400",
                  };
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", metaInfo.cls)}>
                        <Icon name={metaInfo.icon} size={14} />
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-[13px] text-[var(--fg-secondary)] leading-snug">
                          {getActivityDescription(activity)}{" "}
                          <button
                            onClick={() => navigate(`/tickets/${activity.ticket_id}`)}
                            className="font-mono text-[12px] font-medium text-[var(--accent)] hover:underline"
                          >
                            {activity.ticket_number}
                          </button>
                        </p>
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          {timeAgo(activity.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon="activity"
              title="No activity yet"
              description="Ticket events will appear here as they happen."
              compact
            />
          )}
        </section>

        {/* Quick actions */}
        <section
          className="flex flex-col rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
            <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
              <Icon name="zap" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
              Quick actions
            </h2>
          </div>
          <div className="flex-1 p-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="group w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--bg-surface)] transition-colors duration-150"
              >
                <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110", action.cls)}>
                  <Icon name={action.icon} size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--fg-primary)]">{action.label}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{action.desc}</p>
                </div>
                <Icon
                  name="chevronRight"
                  size={15}
                  className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Create Ticket Modal */}
      <TicketCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        meta={meta}
        user={user}
        onCreated={(_id, opts) => {
          if (!opts?.keepOpen) setShowCreateModal(false);
          fetchDashboardData();
        }}
      />
    </div>
  );
}
