/**
 * Dashboard Page
 * Linear/Modern Design System
 *
 * Layout: greeting header → KPI rail (one segmented card) → status
 * distribution bar → recent tickets + activity timeline. Skeleton loading,
 * staggered entrances, fully token-driven (works in dark & light).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../contexts/auth";
import { useMeta } from "../contexts/meta";
import { useToast } from "../contexts/toast";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Button from "../components/ui/Button";
import TicketCreateModal from "../components/tickets/TicketCreateModal";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const STATUS_META = {
  new: { tone: "blue", bar: "bg-blue-500", text: "text-blue-400" },
  open: { tone: "indigo", bar: "bg-indigo-500", text: "text-indigo-400" },
  pending: { tone: "amber", bar: "bg-amber-500", text: "text-amber-400" },
  on_hold: { tone: "slate", bar: "bg-slate-500", text: "text-slate-400" },
  solved: { tone: "emerald", bar: "bg-emerald-500", text: "text-emerald-400" },
  closed: { tone: "slate", bar: "bg-slate-400", text: "text-slate-400" },
};

const ACTIVITY_META = {
  "ticket.created": { icon: "plus", cls: "bg-emerald-500/10 text-emerald-400" },
  "ticket.updated": { icon: "pencil", cls: "bg-blue-500/10 text-blue-400" },
  "ticket.commented": { icon: "message", cls: "bg-sky-500/10 text-sky-400" },
  "ticket.tag_added": { icon: "tag", cls: "bg-violet-500/10 text-violet-400" },
  "ticket.assigned": { icon: "userPlus", cls: "bg-indigo-500/10 text-indigo-400" },
  "ticket.reassigned": { icon: "users", cls: "bg-amber-500/10 text-amber-400" },
  "ticket.escalated": { icon: "arrowUp", cls: "bg-orange-500/10 text-orange-400" },
  "ticket.sent_for_approval": { icon: "shield", cls: "bg-violet-500/10 text-violet-400" },
  "approval.approved": { icon: "checkCircle", cls: "bg-emerald-500/10 text-emerald-400" },
  "approval.rejected": { icon: "close", cls: "bg-rose-500/10 text-rose-400" },
  "approval.delegated": { icon: "share", cls: "bg-cyan-500/10 text-cyan-400" },
  "sla.paused": { icon: "pause", cls: "bg-amber-500/10 text-amber-400" },
  "sla.resumed": { icon: "play", cls: "bg-emerald-500/10 text-emerald-400" },
  "sla.breached": { icon: "alertTriangle", cls: "bg-rose-500/10 text-rose-400" },
  "form.sent": { icon: "send", cls: "bg-cyan-500/10 text-cyan-400" },
  "form.completed": { icon: "checkCircle", cls: "bg-emerald-500/10 text-emerald-400" },
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

  // ── KPI configuration ──────────────────────────────────────────
  const kpis = [
    {
      label: "Open",
      value: dashboardData?.quickStats?.openTickets || 0,
      icon: "inbox",
      chip: "bg-blue-500/10 text-blue-400",
      hint: "New + open tickets",
    },
    {
      label: "Urgent",
      value: dashboardData?.quickStats?.urgentTickets || 0,
      icon: "alertTriangle",
      chip: "bg-[var(--accent)]/10 text-[var(--accent)]",
      hint: "High & urgent, unresolved",
    },
    {
      label: "Pending",
      value: bucketCount("pending"),
      icon: "clock",
      chip: "bg-amber-500/10 text-amber-400",
      hint: "Waiting on someone",
    },
    {
      label: "Solved",
      value: bucketCount("solved"),
      icon: "checkCircle",
      chip: "bg-emerald-500/10 text-emerald-400",
      hint: "Ready to close",
    },
  ];

  // ── Status distribution (stacked bar) ──────────────────────────
  const buckets = dashboardData?.statusBuckets || [];
  const totalTickets = buckets.reduce((sum, b) => sum + Number(b.total), 0);

  // ── Skeleton loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <div className="h-8 w-72 rounded-lg bg-[var(--bg-surface)] animate-pulse" />
            <div className="h-4 w-44 rounded-md bg-[var(--bg-surface)] animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-[var(--bg-surface)] animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)]">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 space-y-3 border-r border-[var(--border-default)] last:border-r-0">
              <div className="h-3 w-16 rounded bg-[var(--bg-surface)] animate-pulse" />
              <div className="h-8 w-12 rounded bg-[var(--bg-surface)] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 h-80 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] animate-pulse" />
          <div className="lg:col-span-2 h-80 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
            {getGreeting()}, <span className="text-[var(--accent)]">{firstName}</span>
          </h1>
          <p className="text-[var(--fg-secondary)] mt-1.5 text-sm flex items-center gap-2">
            <Icon name="calendar" size={13} className="text-[var(--fg-muted)]" />
            {currentDate}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
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

      {/* ── KPI rail: one card, four segments ── */}
      <div
        className={cn(
          "grid grid-cols-2 lg:grid-cols-4",
          "rounded-xl overflow-hidden",
          "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]",
          "animate-fade-up"
        )}
        style={{ animationDelay: "60ms" }}
      >
        {kpis.map((kpi, i) => (
          <button
            key={kpi.label}
            onClick={() => navigate("/tickets")}
            title={kpi.hint}
            className={cn(
              "group relative text-left p-5",
              "border-[var(--border-default)]",
              // Internal hairlines: right border except last col; top border for the 2nd row on mobile
              i < 3 && "lg:border-r",
              i % 2 === 0 && "border-r lg:border-r",
              i === 3 && "border-r-0",
              i >= 2 && "border-t lg:border-t-0",
              "hover:bg-[var(--bg-surface)] transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-label">{kpi.label}</span>
              <span
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  kpi.chip
                )}
              >
                <Icon name={kpi.icon} size={15} />
              </span>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-[28px] leading-none font-semibold tracking-tight text-[var(--fg-primary)]">
                {kpi.value}
              </p>
              <span className="flex items-center gap-1 text-[11px] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                View <Icon name="arrowRight" size={11} />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Status distribution ── */}
      {totalTickets > 0 && (
        <div
          className={cn(
            "rounded-xl px-5 py-4",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "shadow-[var(--shadow-card)]",
            "animate-fade-up"
          )}
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-label">Ticket distribution</p>
            <p className="text-xs text-[var(--fg-muted)]">
              {totalTickets} total ticket{totalTickets !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--bg-surface)]">
            {buckets.map((b) => (
              <div
                key={b.status_key}
                className={cn(
                  STATUS_META[b.status_key]?.bar || "bg-slate-500",
                  "first:rounded-l-full last:rounded-r-full",
                  "transition-all duration-500"
                )}
                style={{ width: `${(b.total / totalTickets) * 100}%` }}
                title={`${b.status_label}: ${b.total}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3">
            {buckets.map((b) => (
              <span key={b.status_key} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    STATUS_META[b.status_key]?.bar || "bg-slate-500"
                  )}
                />
                <span className="text-[var(--fg-secondary)]">{b.status_label}</span>
                <span className="font-medium text-[var(--fg-primary)]">{b.total}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent tickets */}
        <div
          className={cn(
            "lg:col-span-3 flex flex-col",
            "rounded-xl overflow-hidden",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "shadow-[var(--shadow-card)]",
            "animate-fade-up"
          )}
          style={{ animationDelay: "180ms" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                Recent tickets
              </h2>
              {dashboardData?.recentTickets?.length > 0 && (
                <Badge tone="slate" size="sm">{dashboardData.recentTickets.length}</Badge>
              )}
            </div>
            <button
              onClick={() => navigate("/tickets")}
              className="flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
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
                  className={cn(
                    "flex items-center gap-3 px-5 py-3",
                    "hover:bg-[var(--bg-surface)]",
                    "cursor-pointer transition-colors duration-150 group"
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-mono font-medium whitespace-nowrap",
                      "px-1.5 py-0.5 rounded-md",
                      "bg-[var(--bg-surface)] text-[var(--fg-secondary)]",
                      "group-hover:text-[var(--accent)] transition-colors"
                    )}
                  >
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
                    className="text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-14 px-5">
              <div className="w-12 h-12 mb-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
                <Icon name="inbox" size={20} className="text-[var(--fg-muted)]" />
              </div>
              <p className="text-sm font-medium text-[var(--fg-primary)] mb-1">
                No tickets yet
              </p>
              <p className="text-xs text-[var(--fg-secondary)] mb-4">
                Create your first ticket to get things moving
              </p>
              <Button size="sm" onClick={() => setShowCreateModal(true)} icon={<Icon name="plus" size={14} />}>
                New Ticket
              </Button>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div
          className={cn(
            "lg:col-span-2 flex flex-col",
            "rounded-xl overflow-hidden",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "shadow-[var(--shadow-card)]",
            "animate-fade-up"
          )}
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
              Activity
            </h2>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </div>

          {dashboardData?.activityFeed?.length > 0 ? (
            <div className="flex-1 overflow-y-auto max-h-[460px]">
              <div className="px-5 py-4 space-y-4">
                {dashboardData.activityFeed.slice(0, 12).map((activity, idx, arr) => {
                  const metaInfo = ACTIVITY_META[activity.event_type] || {
                    icon: "lightning",
                    cls: "bg-slate-500/10 text-slate-400",
                  };
                  return (
                    <div key={activity.id} className="relative flex gap-3">
                      {/* Connector line */}
                      {idx < arr.length - 1 && (
                        <span className="absolute left-[15px] top-8 bottom-[-16px] w-px bg-[var(--border-default)]" />
                      )}
                      <span
                        className={cn(
                          "relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          metaInfo.cls
                        )}
                      >
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
            <div className="flex-1 flex flex-col items-center justify-center text-center py-14 px-5">
              <div className="w-12 h-12 mb-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center">
                <Icon name="lightning" size={20} className="text-[var(--fg-muted)]" />
              </div>
              <p className="text-sm font-medium text-[var(--fg-primary)] mb-1">
                No activity yet
              </p>
              <p className="text-xs text-[var(--fg-secondary)]">
                Ticket events will appear here as they happen
              </p>
            </div>
          )}
        </div>
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
