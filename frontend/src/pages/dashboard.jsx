/**
 * Dashboard Page
 * Linear/Modern Design System
 *
 * Features:
 * - Dark stat cards with subtle accent glows
 * - Mouse-tracking spotlight on cards
 * - Activity feed with clean list styling
 * - Staggered animations on load
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../contexts/auth";
import { useMeta } from "../contexts/meta";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Button from "../components/ui/Button";
import Card, { StatCard, ListCard } from "../components/ui/Card";
import TicketCreateModal from "../components/tickets/TicketCreateModal";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { meta } = useMeta();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  const getStatusBucketCount = (statusKey) => {
    if (!dashboardData?.statusBuckets) return 0;
    const bucket = dashboardData.statusBuckets.find(
      (b) => b.status_key === statusKey
    );
    return bucket?.total || 0;
  };

  const timeAgo = (timestamp) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  const getStatusTone = (statusLabel) => {
    const status = statusLabel?.toLowerCase().replace(/\s+/g, "_");
    if (status === "new" || status === "open") return "blue";
    if (status === "pending") return "amber";
    if (status === "on_hold") return "slate";
    if (status === "solved") return "emerald";
    if (status === "closed") return "slate";
    return "slate";
  };

  const getActivityIcon = (eventType) => {
    switch (eventType) {
      case "ticket.created":
        return "plus";
      case "ticket.updated":
        return "pencil";
      case "ticket.commented":
        return "message";
      case "ticket.tag_added":
        return "tag";
      case "ticket.assigned":
        return "userPlus";
      case "ticket.status_changed":
        return "refresh";
      default:
        return "lightning";
    }
  };

  const getActivityColor = (eventType) => {
    switch (eventType) {
      case "ticket.created":
        return "emerald";
      case "ticket.updated":
        return "blue";
      case "ticket.commented":
        return "slate";
      case "ticket.tag_added":
        return "violet";
      case "ticket.assigned":
        return "indigo";
      case "ticket.status_changed":
        return "amber";
      default:
        return "slate";
    }
  };

  const getActivityDescription = (activity) => {
    const actorName = activity.actor_name || "System";
    switch (activity.event_type) {
      case "ticket.created":
        return `${actorName} created`;
      case "ticket.updated":
        return `${actorName} updated`;
      case "ticket.commented":
        return `${actorName} commented on`;
      case "ticket.tag_added":
        return `${actorName} added a tag to`;
      case "ticket.assigned":
        return `${actorName} was assigned to`;
      case "ticket.status_changed":
        return `${actorName} changed status of`;
      case "ticket.sent_for_approval":
        return `${actorName} sent for approval`;
      case "approval.approved":
        return `${actorName} approved`;
      case "approval.rejected":
        return `${actorName} rejected`;
      case "approval.level_advanced":
        return `Approval advanced to next level on`;
      case "approval.post_actions_applied":
        return `Post-approval actions applied to`;
      case "approval.delegated":
        return `${actorName} delegated approval on`;
      case "sla.paused":
        return `SLA paused (pending approval) on`;
      case "sla.resumed":
        return `SLA resumed on`;
      case "sla.breached":
        return `SLA breached on`;
      default:
        return `${actorName} updated`;
    }
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getFirstName = () => {
    const name = user?.fullName || user?.full_name;
    if (!name) return "User";
    return name.split(" ")[0];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-xl",
              "bg-[var(--accent)]/10",
              "border border-[var(--accent)]/20",
              "flex items-center justify-center"
            )}
          >
            <svg
              className="animate-spin h-5 w-5 text-[var(--accent)]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <p className="text-sm text-[var(--fg-secondary)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Stat cards configuration
  const stats = [
    {
      label: "Open",
      value: dashboardData?.quickStats?.openTickets || 0,
      color: "blue",
      icon: <Icon name="tickets" size={18} />,
    },
    {
      label: "Urgent",
      value: dashboardData?.quickStats?.urgentTickets || 0,
      color: "accent",
      icon: <Icon name="alert" size={18} />,
    },
    {
      label: "Pending",
      value: getStatusBucketCount("pending"),
      color: "amber",
      icon: <Icon name="clock" size={18} />,
    },
    {
      label: "Solved",
      value: getStatusBucketCount("solved"),
      color: "emerald",
      icon: <Icon name="check" size={18} />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              {getGreeting()},{" "}
              <span className="text-[var(--accent)]">{getFirstName()}</span>
            </h1>
            <p className="text-[var(--fg-secondary)] mt-1 text-sm">
              {getCurrentDate()}
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            icon={<Icon name="plus" size={16} />}
          >
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color}
            icon={stat.icon}
          />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Tickets - 3 columns */}
        <div className="lg:col-span-3">
          <ListCard
            tint="indigo"
            header={
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--fg-primary)]">
                  Recent Tickets
                </h2>
                <button
                  onClick={() => navigate("/tickets")}
                  className="text-sm font-medium text-[var(--accent)] hover:underline transition-all"
                >
                  View all
                </button>
              </div>
            }
          >
            {dashboardData?.recentTickets && dashboardData.recentTickets.length > 0 ? (
              <div className="divide-y divide-[var(--border-default)]">
                {dashboardData.recentTickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className={cn(
                      "flex items-center gap-4 px-5 py-3.5",
                      "hover:bg-[var(--bg-surface)]",
                      "cursor-pointer transition-all duration-150",
                      "group"
                    )}
                  >
                    <span className="text-xs font-mono font-medium text-[var(--accent)] group-hover:underline whitespace-nowrap">
                      #{ticket.ticket_number}
                    </span>
                    <p className="text-sm text-[var(--fg-primary)] truncate flex-1 font-medium">
                      {ticket.subject}
                    </p>
                    <Badge tone={getStatusTone(ticket.status_label)} size="sm">
                      {ticket.status_label}
                    </Badge>
                    <span className="text-xs text-[var(--fg-muted)] whitespace-nowrap hidden sm:block">
                      {formatDate(ticket.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 px-5">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center">
                  <Icon name="tickets" size={20} className="text-[var(--fg-muted)]" />
                </div>
                <p className="text-[var(--fg-secondary)] text-sm">No recent tickets</p>
              </div>
            )}
          </ListCard>
        </div>

        {/* Activity Feed - 2 columns */}
        <div className="lg:col-span-2">
          <ListCard
            tint="violet"
            header={
              <h2 className="text-base font-semibold text-[var(--fg-primary)]">
                Activity
              </h2>
            }
          >
            {dashboardData?.activityFeed && dashboardData.activityFeed.length > 0 ? (
              <div className="divide-y divide-[var(--border-default)]/50">
                {dashboardData.activityFeed.slice(0, 10).map((activity, index) => {
                  const color = getActivityColor(activity.event_type);
                  const iconColorMap = {
                    emerald: "bg-emerald-500/10 text-emerald-400",
                    blue: "bg-blue-500/10 text-blue-400",
                    slate: "bg-slate-500/10 text-slate-400",
                    violet: "bg-violet-500/10 text-violet-400",
                    indigo: "bg-indigo-500/10 text-indigo-400",
                    amber: "bg-amber-500/10 text-amber-400",
                  };

                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 px-5 py-3.5"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                          iconColorMap[color] || iconColorMap.slate
                        )}
                      >
                        <Icon name={getActivityIcon(activity.event_type)} size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--fg-primary)] leading-relaxed">
                          <span className="font-medium">
                            {getActivityDescription(activity)}
                          </span>{" "}
                          <button
                            onClick={() => navigate(`/tickets/${activity.ticket_id}`)}
                            className="font-semibold text-[var(--accent)] hover:underline"
                          >
                            #{activity.ticket_number}
                          </button>
                        </p>
                        <span className="text-xs text-[var(--fg-muted)] mt-0.5 block">
                          {timeAgo(activity.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 px-5">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center">
                  <Icon name="lightning" size={20} className="text-[var(--fg-muted)]" />
                </div>
                <p className="text-[var(--fg-secondary)] text-sm">No recent activity</p>
              </div>
            )}
          </ListCard>
        </div>
      </div>

      {/* Create Ticket Modal */}
      <TicketCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        meta={meta}
        user={user}
        onCreated={() => {
          setShowCreateModal(false);
          fetchDashboardData();
        }}
      />
    </div>
  );
}
