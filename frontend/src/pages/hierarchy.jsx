/**
 * Organizational Hierarchy Page — Vodafone Service Desk
 *
 * Premium org experience: branded header, tinted KPI cards, a segmented
 * Org-Chart / List switcher, a clean search + team toolbar, an elevated chart
 * canvas with a subtle grid backdrop, and refined people cards.
 *
 * Visual / layout redesign only — every piece of state, effect, handler, API
 * call, the hierarchy lookups, tree-building data flow, and the edit modal are
 * preserved exactly.
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Select, SearchableSelect } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton, { SkeletonKpis } from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import OrgChart from "../components/OrgChart";
import { useToast } from "../contexts/toast";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Hierarchy() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [hierarchy, setHierarchy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    title: "",
    phone: "",
    roles: ["requester"],
    manager_id: "",
    team_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [viewMode, setViewMode] = useState("list"); // 'tree' or 'list'

  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [orgChartData, teamsData] = await Promise.all([
        api("/hierarchy/org-chart"),
        api("/teams").catch(() => ({ teams: [] }))
      ]);
      setUsers(orgChartData.users || []);
      setHierarchy(orgChartData.hierarchy || []);
      const teamsList = teamsData?.teams || teamsData?.items || [];
      setTeams(Array.isArray(teamsList) ? teamsList : []);
    } catch (error) {
      console.error("Failed to load hierarchy:", error);
      toast.error(error.message || "Failed to load hierarchy");
    } finally {
      setLoading(false);
    }
  }

  async function openEditModal(u) {
    setSelectedUser(u);

    // Get current manager and team for this user
    let currentManagerId = "";
    let currentTeamId = "";

    try {
      // Find current manager from hierarchy
      const userHierarchy = hierarchy.find(h => h.user_id === u.id && h.level === 1);
      if (userHierarchy) {
        currentManagerId = userHierarchy.manager_id || "";
      }

      // Fetch user's current teams
      const userTeams = await api(`/teams?userId=${u.id}`).catch(() => ({ teams: [] }));
      if (userTeams.teams && userTeams.teams.length > 0) {
        currentTeamId = userTeams.teams[0].id || "";
      }
    } catch (error) {
      console.error("Error loading user relationships:", error);
    }

    setFormData({
      full_name: u.full_name || "",
      title: u.title || "",
      phone: u.phone || "",
      roles: u.roles || ["requester"],
      manager_id: currentManagerId,
      team_id: currentTeamId,
    });
    setShowEditModal(true);
  }

  function toggleRole(role) {
    setFormData((prev) => {
      const has = prev.roles.includes(role);
      const newRoles = has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      return { ...prev, roles: newRoles.length > 0 ? newRoles : ["requester"] };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedUser) return;

    setSubmitting(true);
    try {
      // Update user details
      const payload = {
        full_name: formData.full_name,
        title: formData.title,
        phone: formData.phone,
        roles: formData.roles,
      };
      await api(`/users/${selectedUser.id}`, { method: "PATCH", body: payload });

      // Update manager if changed
      if (formData.manager_id) {
        await api("/hierarchy/set-manager", {
          method: "POST",
          body: {
            user_id: selectedUser.id,
            manager_id: Number(formData.manager_id)
          }
        });
      } else {
        // Remove manager if cleared
        await api(`/hierarchy/user/${selectedUser.id}`, { method: "DELETE" }).catch(() => {});
      }

      // Update team membership: always clear, then re-add if one is selected
      await api(`/teams/members/${selectedUser.id}`, { method: "DELETE" }).catch(() => {});
      if (formData.team_id) {
        await api("/teams/members", {
          method: "POST",
          body: {
            team_id: Number(formData.team_id),
            user_id: selectedUser.id
          }
        });
      }

      toast.success("User updated");
      setShowEditModal(false);
      loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRemoveManager(u) {
    confirm({
      title: "Remove from hierarchy?",
      message: (
        <>
          This removes the reporting line for{" "}
          <strong className="text-[var(--fg-primary)]">
            {u.full_name || u.email}
          </strong>
          . They will no longer have a manager and approval chains that rely on
          their hierarchy will stop at them.
        </>
      ),
      confirmText: "Remove",
      onConfirm: async () => {
        try {
          await api(`/hierarchy/user/${u.id}`, { method: "DELETE" });
          toast.success("Removed from hierarchy");
          loadData();
        } catch (error) {
          toast.error(error.message);
        }
      },
    });
  }

  // Build hierarchy map for quick lookups
  const hierarchyMap = {};
  hierarchy.forEach(h => {
    if (!hierarchyMap[h.user_id]) {
      hierarchyMap[h.user_id] = [];
    }
    hierarchyMap[h.user_id].push(h);
  });

  // Get manager for user
  function getManager(userId) {
    const userHierarchy = hierarchy.find(h => h.user_id === userId && h.level === 1);
    if (!userHierarchy) return null;
    return users.find(u => u.id === userHierarchy.manager_id);
  }

  // Get direct reports
  function getDirectReports(userId) {
    const reports = hierarchy.filter(h => h.manager_id === userId && h.level === 1);
    return reports.map(r => users.find(u => u.id === r.user_id)).filter(Boolean);
  }

  const filtered = users.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.title || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTeam = !teamFilter || u.team_id === Number(teamFilter);
    return matchesSearch && matchesTeam;
  });

  // ── Derived metrics for KPI cards ──────────────────────────────
  const inHierarchyCount = new Set(hierarchy.map(h => h.user_id)).size;
  const maxLevels = Math.max(0, ...hierarchy.map(h => h.level));
  const unassignedCount = users.filter(
    (u) => u.is_active !== false && !getManager(u.id)
  ).length;

  const kpis = [
    {
      label: "Total Users",
      value: users.length,
      icon: "users",
      iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15",
      hint: "People in the directory",
    },
    {
      label: "In Hierarchy",
      value: inHierarchyCount,
      icon: "sitemap",
      iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
      hint: "Users with a reporting line",
    },
    {
      label: "Unassigned",
      value: unassignedCount,
      icon: "userPlus",
      iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15",
      hint: "Active users without a manager",
    },
    {
      label: "Max Levels",
      value: maxLevels,
      icon: "layers",
      iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15",
      hint: "Depth of the reporting chain",
    },
  ];

  const VIEWS = [
    { key: "tree", label: "Org Chart", icon: "sitemap" },
    { key: "list", label: "List View", icon: "list" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="sitemap"
        title="Organizational Hierarchy"
        subtitle="Visualize reporting lines and assign each person's manager and team."
        actions={
          <button
            onClick={() => loadData()}
            title="Refresh"
            className={cn(
              "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
              "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
            )}
          >
            <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
          </button>
        }
      />

      {/* KPI cards */}
      {loading ? (
        <SkeletonKpis count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
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
              <p className="mt-3 text-[11px] text-[var(--fg-muted)]">{kpi.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* View switcher & toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented view switcher */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
          {VIEWS.map((v) => {
            const active = viewMode === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200",
                  active
                    ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                )}
              >
                <Icon
                  name={v.icon}
                  size={15}
                  className={active ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"}
                />
                {v.label}
              </button>
            );
          })}
        </div>

        {viewMode === "list" && (
          <>
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input
                icon="search"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-44">
              <Select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <option value="">All Teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <Badge tone="slate" className="ml-auto">
              {filtered.length} {filtered.length === 1 ? "user" : "users"}
            </Badge>
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        viewMode === "tree" ? (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-6">
            <div className="flex items-center gap-2.5 mb-8">
              <Skeleton className="h-9 w-28" rounded="rounded-lg" />
              <Skeleton className="h-9 w-28" rounded="rounded-lg" />
            </div>
            <div className="flex justify-center gap-16">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-56" rounded="rounded-2xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52" rounded="rounded-2xl" />
            ))}
          </div>
        )
      ) : viewMode === "tree" ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl animate-fade-up",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]"
          )}
        >
          {/* Subtle grid backdrop + brand glow for the canvas */}
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--accent)] opacity-[0.05] blur-3xl" />
          <div className="relative p-5 sm:p-6">
            <OrgChart users={users} hierarchy={hierarchy} onEditUser={openEditModal} />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="users"
            title="No people found"
            description={
              searchQuery || teamFilter
                ? "Try adjusting your search or team filter."
                : "Once users are added to the directory they will appear here."
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((u, i) => {
            const manager = getManager(u.id);
            const reports = getDirectReports(u.id);
            const userHierarchyChain = hierarchyMap[u.id] || [];

            return (
              <div
                key={u.id}
                className={cn(
                  "group relative flex flex-col rounded-2xl p-5 animate-fade-up",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]"
                )}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                {/* Person header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] ring-1 ring-[var(--accent)]/15 font-semibold text-sm">
                      {initials(u.full_name || u.email)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight line-clamp-1">
                        {u.full_name || u.email}
                      </h3>
                      <p className="text-sm text-[var(--fg-muted)] line-clamp-1">
                        {u.title || "No title"}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => openEditModal(u)}
                      title="Edit user"
                      className={cn(
                        "shrink-0 p-2 rounded-lg transition-all duration-150",
                        "text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]",
                        "opacity-0 group-hover:opacity-100 focus:opacity-100"
                      )}
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                  )}
                </div>

                {/* Team Badge */}
                {u.team_name && (
                  <div className="mt-3.5">
                    <Badge tone="emerald" size="sm">
                      <Icon name="teams" size={11} className="shrink-0" />
                      {u.team_name}
                    </Badge>
                  </div>
                )}

                {/* Manager Info */}
                <div className="mt-3.5">
                  {manager ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-6 w-6 shrink-0 rounded-md bg-[var(--bg-surface)] text-[var(--fg-muted)] flex items-center justify-center">
                          <Icon name="arrow-up" size={13} />
                        </span>
                        <span className="text-[var(--fg-secondary)]">Reports to</span>
                        <span className="text-[var(--fg-primary)] font-medium truncate">
                          {manager.full_name || manager.email}
                        </span>
                      </div>
                      {userHierarchyChain.length > 1 && (
                        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)] pl-8">
                          <Icon name="sitemap" size={12} />
                          <span>{userHierarchyChain.length} levels in hierarchy</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                      <span className="h-6 w-6 shrink-0 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <Icon name="alert" size={13} />
                      </span>
                      <span>No manager assigned</span>
                    </div>
                  )}
                </div>

                {/* Direct Reports */}
                {reports.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                    <div className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] mb-2.5">
                      <Icon name="arrow-down" size={14} className="text-[var(--fg-muted)]" />
                      <span className="font-medium text-[var(--fg-primary)]">{reports.length}</span>
                      <span>Direct Report{reports.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {reports.slice(0, 3).map(r => (
                        <Badge key={r.id} tone="slate" size="sm">
                          {r.full_name || r.email}
                        </Badge>
                      ))}
                      {reports.length > 3 && (
                        <Badge tone="slate" size="sm">+{reports.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Spacer pushes the destructive action to the card bottom */}
                <div className="flex-1" />

                {/* Actions */}
                {isAdmin && manager && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                    <button
                      onClick={() => handleRemoveManager(u)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-rose-500 hover:text-rose-400 transition-colors"
                    >
                      <Icon name="trash" size={14} />
                      <span>Remove from hierarchy</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit User Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit User"
        subtitle={`Update details for ${selectedUser?.full_name || selectedUser?.email}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              placeholder="John Smith"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />
            <Input
              label="Title"
              placeholder="Support Engineer"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <Input
            label="Phone"
            placeholder="+1 555-0123"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />

          {/* Manager and Team Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchableSelect
              label="Manager"
              value={formData.manager_id}
              onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
              placeholder="No manager"
              searchPlaceholder="Search by name or title..."
              emptyMessage="No matching users found"
              options={[
                { value: "", label: "No manager", subtitle: "Remove from hierarchy" },
                ...users
                  .filter(u => u.id !== selectedUser?.id && u.is_active !== false)
                  .map(u => ({
                    value: u.id,
                    label: u.full_name || u.email,
                    subtitle: u.title || u.email
                  }))
              ]}
            />

            <Select
              label="Team"
              value={formData.team_id}
              onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
            >
              <option value="">No team</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
              Roles
            </label>
            <p className="text-xs text-[var(--fg-secondary)] mb-3">Select one or more roles for this user</p>
            <div className="flex gap-3">
              {["admin", "agent", "requester"].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                    formData.roles.includes(role)
                      ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                      : cn(
                          "bg-[var(--bg-base)] text-[var(--fg-secondary)]",
                          "border border-[var(--border-default)]",
                          "hover:border-[var(--border-hover)] hover:text-[var(--fg-primary)]"
                        )
                  )}
                >
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={cn(
            "flex items-start gap-3 p-4 rounded-xl",
            "bg-blue-500/10 border border-blue-500/20"
          )}>
            <Icon name="info" size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-500/90">
              The system will automatically build the full reporting chain including all levels above the selected manager.
            </p>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
