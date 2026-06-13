/**
 * Organizational Hierarchy Page
 * Linear/Modern Design System
 * Visual Org Chart and Manager Assignment
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Select, SearchableSelect } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import OrgChart from "../components/OrgChart";
import { useToast } from "../contexts/toast";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
            Organizational Hierarchy
          </h1>
          <p className="text-[var(--fg-secondary)] mt-1 text-sm">Click Edit (✏) on any person to assign their reporting manager</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card tint="blue" hover>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
              <Icon name="users" size={24} />
            </div>
            <div>
              <p className="text-sm text-[var(--fg-secondary)]">Total Users</p>
              <p className="text-2xl font-semibold text-[var(--fg-primary)]">{users.length}</p>
            </div>
          </div>
        </Card>

        <Card tint="emerald" hover>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <Icon name="user" size={24} />
            </div>
            <div>
              <p className="text-sm text-[var(--fg-secondary)]">In Hierarchy</p>
              <p className="text-2xl font-semibold text-[var(--fg-primary)]">
                {new Set(hierarchy.map(h => h.user_id)).size}
              </p>
            </div>
          </div>
        </Card>

        <Card tint="violet" hover>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center flex-shrink-0">
              <Icon name="sitemap" size={24} />
            </div>
            <div>
              <p className="text-sm text-[var(--fg-secondary)]">Max Levels</p>
              <p className="text-2xl font-semibold text-[var(--fg-primary)]">
                {Math.max(0, ...hierarchy.map(h => h.level))}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* View Toggle & Search */}
      <div className="flex flex-wrap items-center gap-4">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <button
            onClick={() => setViewMode("tree")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              viewMode === "tree"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
            )}
          >
            <div className="flex items-center gap-2">
              <Icon name="sitemap" size={16} />
              <span>Org Chart</span>
            </div>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              viewMode === "list"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
            )}
          >
            <div className="flex items-center gap-2">
              <Icon name="list" size={16} />
              <span>List View</span>
            </div>
          </button>
        </div>

        {viewMode === "list" && (
          <>
            <div className="flex-1 max-w-sm">
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
            <Badge tone="slate">{filtered.length} users</Badge>
          </>
        )}
      </div>

      {loading ? (
        <div className={cn(
          "flex items-center justify-center py-20 rounded-xl",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]"
        )}>
          <div className="text-center">
            <div className={cn(
              "w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4",
              "bg-[var(--bg-base)] border border-[var(--border-default)]"
            )}>
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-[var(--border-default)] border-t-[var(--accent)]" />
            </div>
            <p className="text-sm font-medium text-[var(--fg-secondary)]">Loading hierarchy...</p>
          </div>
        </div>
      ) : viewMode === "tree" ? (
        <div className={cn(
          "rounded-xl p-6",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]"
        )}>
          <OrgChart users={users} hierarchy={hierarchy} onEditUser={openEditModal} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((u) => {
            const manager = getManager(u.id);
            const reports = getDirectReports(u.id);
            const userHierarchyChain = hierarchyMap[u.id] || [];

            return (
              <Card key={u.id} tint="slate" hover className="group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center",
                      "bg-[var(--accent)]/10 text-[var(--accent)]"
                    )}>
                      <Icon name="user" size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-[var(--fg-primary)] line-clamp-1">
                        {u.full_name || u.email}
                      </h3>
                      <p className="text-sm text-[var(--fg-secondary)] line-clamp-1">
                        {u.title || "No title"}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => openEditModal(u)}
                      className={cn(
                        "p-2 rounded-lg transition-all duration-200",
                        "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                        "hover:bg-[var(--bg-base)]"
                      )}
                      title="Edit user"
                    >
                      <Icon name="pencil" size={14} />
                    </button>
                  )}
                </div>

                {/* Team Badge */}
                {u.team_name && (
                  <div className="mb-3">
                    <Badge tone="emerald" size="sm">
                      <Icon name="teams" size={12} className="mr-1" />
                      {u.team_name}
                    </Badge>
                  </div>
                )}

                {/* Manager Info */}
                {manager ? (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Icon name="arrow-up" size={14} className="text-[var(--fg-muted)]" />
                      <span className="text-[var(--fg-secondary)]">Reports to:</span>
                      <span className="text-[var(--fg-primary)] font-medium">
                        {manager.full_name || manager.email}
                      </span>
                    </div>
                    {userHierarchyChain.length > 1 && (
                      <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                        <Icon name="sitemap" size={12} />
                        <span>{userHierarchyChain.length} levels in hierarchy</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                    <Icon name="alert" size={14} />
                    <span>No manager assigned</span>
                  </div>
                )}

                {/* Direct Reports */}
                {reports.length > 0 && (
                  <div className="mb-4 pt-4 border-t border-[var(--border-default)]">
                    <div className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] mb-2">
                      <Icon name="arrow-down" size={14} />
                      <span>{reports.length} Direct Report{reports.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
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

                {/* Actions */}
                {isAdmin && manager && (
                  <div className="pt-4 border-t border-[var(--border-default)]">
                    <button
                      onClick={() => handleRemoveManager(u)}
                      className={cn(
                        "text-sm text-rose-400 hover:text-rose-300 transition-colors",
                        "flex items-center gap-2"
                      )}
                    >
                      <Icon name="trash" size={14} />
                      <span>Remove from hierarchy</span>
                    </button>
                  </div>
                )}
              </Card>
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
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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
            "flex items-start gap-3 p-4 rounded-lg",
            "bg-blue-500/10 border border-blue-500/20"
          )}>
            <Icon name="info" size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-400">
              The system will automatically build the full reporting chain including all levels above the selected manager.
            </p>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
