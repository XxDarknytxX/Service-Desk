/**
 * Teams Page — Vodafone Service Desk
 *
 * Premium team-management experience: branded header, an elevated toolbar with
 * search + refresh, a polished card grid (tinted identity tiles, member counts,
 * manager-aware footers, hover-lift, reveal-on-hover action menu), shimmer
 * loading, and a consistent EmptyState. The create/edit, member-management, and
 * module-privilege modals are reorganised into grouped, tinted sections.
 *
 * Fully token-driven (dark & light) and responsive. Every piece of state, every
 * handler, API call, the team-hierarchy mini-org-chart, the privilege module
 * grid, and the member tools are preserved exactly — visual changes only.
 */

import { useEffect, useState } from "react";
import { Tree, TreeNode } from "react-organizational-chart";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

// Mini Team Hierarchy Component - Similar to main OrgChart

function TeamMemberNode({ member, hasReports, reportsCount }) {
  const roleColors = {
    admin: "bg-purple-500/20 text-purple-300 border-purple-400/50",
    agent: "bg-blue-500/20 text-blue-300 border-blue-400/50",
    requester: "bg-slate-500/20 text-slate-300 border-slate-400/50",
  };

  const primaryRole = member.roles?.[0] || "requester";
  const roleColor = roleColors[primaryRole] || roleColors.requester;

  return (
    <div className="inline-block">
      <div
        className={cn(
          "group relative rounded-lg p-3",
          "bg-[var(--bg-elevated)] border-2",
          "shadow-lg hover:shadow-xl transition-all duration-200",
          "hover:border-[var(--accent)]",
          "w-48"
        )}
        style={{ borderColor: "rgba(148, 163, 184, 0.5)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
              "bg-[var(--accent)]/20 text-[var(--accent)]",
              "font-semibold text-xs"
            )}
          >
            {(member.full_name || member.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)] line-clamp-1">
              {member.full_name || member.email}
            </h3>
            <p className="text-[10px] text-[var(--fg-secondary)] line-clamp-1">
              {member.title || "No title"}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {member.is_lead ? (
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-400/50">
              ★ Manager
            </div>
          ) : null}
          <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", roleColor)}>
            <span className="capitalize">{primaryRole}</span>
          </div>
          {hasReports ? (
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--fg-secondary)]">
              <Icon name="users" size={10} />
              <span>{reportsCount}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TeamHierarchyNode({ member, members }) {
  const getReports = (managerId) => members.filter(m => m.manager?.id === managerId);
  const reports = getReports(member.id);
  const hasReports = reports.length > 0;

  if (!hasReports) {
    return (
      <TreeNode
        label={<TeamMemberNode member={member} hasReports={false} reportsCount={0} />}
      />
    );
  }

  return (
    <TreeNode
      label={<TeamMemberNode member={member} hasReports={true} reportsCount={reports.length} />}
    >
      {reports.map(report => (
        <TeamHierarchyNode key={report.id} member={report} members={members} />
      ))}
    </TreeNode>
  );
}

function TeamHierarchy({ members }) {
  const memberIds = new Set(members.map(m => m.id));

  // Find root members (those whose manager is not in the team)
  const roots = members.filter(m => !m.manager || !memberIds.has(m.manager.id));

  // Get reports for a manager
  const getReports = (managerId) => members.filter(m => m.manager?.id === managerId);

  if (roots.length === 0) {
    return (
      <div className="text-center py-6 text-[var(--fg-secondary)] text-sm">
        No hierarchy structure available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto py-4">
      <div className="inline-flex min-w-full justify-center gap-8">
        {roots.map(root => {
          const rootReports = getReports(root.id);
          const hasReports = rootReports.length > 0;

          return (
            <Tree
              key={root.id}
              lineWidth="2px"
              lineColor="rgba(148, 163, 184, 0.6)"
              lineBorderRadius="8px"
              nodePadding="12px"
              label={<TeamMemberNode member={root} hasReports={hasReports} reportsCount={rootReports.length} />}
            >
              {rootReports.map(report => (
                <TeamHierarchyNode key={report.id} member={report} members={members} />
              ))}
            </Tree>
          );
        })}
      </div>
    </div>
  );
}

// Rotating tints for team cards — full static class strings (no dynamic Tailwind)
const TEAM_TINTS = [
  { tile: "bg-violet-500/10 text-violet-500 border-violet-500/15", ring: "var(--accent)", glow: "bg-violet-500" },
  { tile: "bg-blue-500/10 text-blue-500 border-blue-500/15", ring: "var(--accent)", glow: "bg-blue-500" },
  { tile: "bg-cyan-500/10 text-cyan-500 border-cyan-500/15", ring: "var(--accent)", glow: "bg-cyan-500" },
  { tile: "bg-teal-500/10 text-teal-500 border-teal-500/15", ring: "var(--accent)", glow: "bg-teal-500" },
  { tile: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", ring: "var(--accent)", glow: "bg-emerald-500" },
  { tile: "bg-indigo-500/10 text-indigo-500 border-indigo-500/15", ring: "var(--accent)", glow: "bg-indigo-500" },
  { tile: "bg-purple-500/10 text-purple-500 border-purple-500/15", ring: "var(--accent)", glow: "bg-purple-500" },
  { tile: "bg-pink-500/10 text-pink-500 border-pink-500/15", ring: "var(--accent)", glow: "bg-pink-500" },
];

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Teams() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState("grid"); // 'grid' or 'table'
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  // Privileges modal state
  const [showPrivilegesModal, setShowPrivilegesModal] = useState(false);
  const [privilegesTeam, setPrivilegesTeam] = useState(null);
  const [moduleRegistry, setModuleRegistry] = useState([]);
  const [privilegesRestricted, setPrivilegesRestricted] = useState(false);
  const [privilegesModules, setPrivilegesModules] = useState([]);
  const [loadingPrivileges, setLoadingPrivileges] = useState(false);
  const [savingPrivileges, setSavingPrivileges] = useState(false);

  // Members modal extras
  const [togglingLead, setTogglingLead] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");

  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    try {
      const data = await api("/teams");
      setTeams(data.items || []);
    } catch (error) {
      toast.error(error.message || "Failed to load teams");
    } finally { setLoading(false); }
  }

  function openCreateModal() {
    setEditingTeam(null);
    setFormData({ name: "", description: "" });
    setShowModal(true);
  }

  function openEditModal(team) {
    setEditingTeam(team);
    setFormData({ name: team.name || "", description: team.description || "" });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingTeam) {
        await api(`/teams/${editingTeam.id}`, { method: "PATCH", body: formData });
        toast.success("Team updated");
      } else {
        await api("/teams", { method: "POST", body: formData });
        toast.success("Team created");
      }
      setShowModal(false);
      loadTeams();
    } catch (error) { toast.error(error.message); }
    finally { setSubmitting(false); }
  }

  function handleDelete(team) {
    confirm({
      title: "Delete team?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{team.name}</strong> and
          remove all of its member assignments. This action cannot be undone.
        </>
      ),
      confirmText: "Delete Team",
      onConfirm: async () => {
        try {
          await api(`/teams/${team.id}`, { method: "DELETE" });
          toast.success("Team deleted");
          loadTeams();
        } catch (error) { toast.error(error.message); }
      },
    });
  }

  async function openMembersModal(team) {
    setSelectedTeam(team);
    setShowMembersModal(true);
    setShowAddMember(false);
    setAddMemberSearch("");
    setLoadingMembers(true);
    try {
      const [membersData, usersData] = await Promise.all([
        api(`/teams/${team.id}/members`),
        api("/users"),
      ]);
      setTeamMembers(membersData.members || membersData.items || []);
      setAllUsers(usersData.items || []);
    } catch (error) {
      console.error("Failed to load team members:", error);
      setTeamMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function reloadMembers() {
    if (!selectedTeam) return;
    setLoadingMembers(true);
    try {
      const data = await api(`/teams/${selectedTeam.id}/members`);
      setTeamMembers(data.members || data.items || []);
    } catch (error) {
      console.error("Failed to reload team members:", error);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function toggleLead(member) {
    setTogglingLead(member.id);
    try {
      // POST with ON DUPLICATE KEY UPDATE toggles is_lead on existing membership
      await api("/teams/members", {
        method: "POST",
        body: { team_id: selectedTeam.id, user_id: member.id, is_lead: member.is_lead ? false : true },
      });
      await reloadMembers();
    } catch (error) {
      toast.error(error.message || "Failed to update lead status");
    } finally {
      setTogglingLead(null);
    }
  }

  function removeMember(member) {
    confirm({
      title: "Remove member?",
      message: (
        <>
          Remove{" "}
          <strong className="text-[var(--fg-primary)]">
            {member.full_name || member.email}
          </strong>{" "}
          from {selectedTeam?.name || "this team"}? They will keep their account
          and can be re-added later.
        </>
      ),
      confirmText: "Remove",
      onConfirm: async () => {
        try {
          // DELETE /teams/members/:userId removes the user from all teams
          await api(`/teams/members/${member.id}`, { method: "DELETE" });
          toast.success("Member removed");
          await reloadMembers();
          loadTeams();
        } catch (error) {
          toast.error(error.message || "Failed to remove member");
        }
      },
    });
  }

  async function addMember(u) {
    try {
      await api("/teams/members", {
        method: "POST",
        body: { team_id: selectedTeam.id, user_id: u.id },
      });
      setShowAddMember(false);
      setAddMemberSearch("");
      await reloadMembers();
      loadTeams();
    } catch (error) {
      toast.error(error.message || "Failed to add member");
    }
  }

  async function openPrivilegesModal(team) {
    setPrivilegesTeam(team);
    setShowPrivilegesModal(true);
    setLoadingPrivileges(true);
    try {
      const [registryData, accessData] = await Promise.all([
        api("/teams/modules"),
        api(`/teams/${team.id}/access`),
      ]);
      setModuleRegistry(registryData.modules || []);
      setPrivilegesRestricted(accessData.restricted || false);
      setPrivilegesModules(accessData.modules || []);
    } catch (error) {
      console.error("Failed to load privileges:", error);
    } finally {
      setLoadingPrivileges(false);
    }
  }

  function togglePrivilegeModule(key) {
    setPrivilegesModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function selectAllInSection(sectionModules) {
    const keys = sectionModules.map(m => m.key);
    setPrivilegesModules(prev => {
      const withoutSection = prev.filter(k => !keys.includes(k));
      return [...withoutSection, ...keys];
    });
  }

  function deselectAllInSection(sectionModules) {
    const keys = sectionModules.map(m => m.key);
    setPrivilegesModules(prev => prev.filter(k => !keys.includes(k)));
  }

  async function savePrivileges() {
    if (privilegesRestricted && privilegesModules.length === 0) {
      toast.warning("At least one module must be enabled when restricting access");
      return;
    }
    setSavingPrivileges(true);
    try {
      await api(`/teams/${privilegesTeam.id}/access`, {
        method: "PUT",
        body: { restricted: privilegesRestricted, modules: privilegesModules },
      });
      toast.success("Team privileges saved");
      setShowPrivilegesModal(false);
    } catch (error) {
      toast.error(error.message || "Failed to save privileges");
    } finally {
      setSavingPrivileges(false);
    }
  }

  // Group modules by section
  const modulesBySection = moduleRegistry.reduce((acc, mod) => {
    if (!acc[mod.section]) acc[mod.section] = [];
    acc[mod.section].push(mod);
    return acc;
  }, {});

  const filtered = teams.filter((t) =>
    (t.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Derived summary metrics for the header subtitle ──
  const totalMembers = teams.reduce((sum, t) => sum + (Number(t.member_count) || 0), 0);
  const avgMembers = teams.length ? Math.round(totalMembers / teams.length) : 0;
  const largestTeam = teams.reduce((max, t) => Math.max(max, Number(t.member_count) || 0), 0);
  const kpis = [
    { label: "Total Teams", value: teams.length, icon: "teams", iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15" },
    { label: "Total Members", value: totalMembers, icon: "users", iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15" },
    { label: "Avg · Team", value: avgMembers, icon: "userCheck", iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15" },
    { label: "Largest Team", value: largestTeam, icon: "trendingUp", iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15" },
  ];

  // Reusable header control button (mirrors tickets.jsx)
  const ControlButton = ({ active, title, onClick, children }) => (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
        "bg-[var(--bg-elevated)] border",
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="teams"
        title="Teams"
        subtitle={
          loading
            ? "Organize agents by department or expertise"
            : `${teams.length} ${teams.length === 1 ? "team" : "teams"} · ${totalMembers} ${totalMembers === 1 ? "member" : "members"} across your organization`
        }
        actions={
          <>
            <ControlButton title="Refresh" onClick={() => { setLoading(true); loadTeams(); }}>
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </ControlButton>
            {isAdmin && (
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Create Team
              </Button>
            )}
          </>
        }
      />

      {/* KPI summary */}
      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <div
              key={kpi.label}
              className="group relative overflow-hidden rounded-2xl p-5 bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)] animate-kpi-rise"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-label">{kpi.label}</span>
                <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110", kpi.iconCls)}>
                  <Icon name={kpi.icon} size={16} />
                </span>
              </div>
              <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: search + view toggle */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search teams by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm",
                "bg-[var(--bg-base)]",
                "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                "transition-all duration-200"
              )}
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {/* Grid / Table view toggle */}
            <div className="inline-flex items-center p-1 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
              {[{ k: "grid", i: "grid", t: "Grid view" }, { k: "table", i: "table", t: "Table view" }].map((v) => (
                <button
                  key={v.k}
                  onClick={() => setView(v.k)}
                  title={v.t}
                  className={cn(
                    "h-8 w-8 inline-flex items-center justify-center rounded-md transition-all duration-150",
                    view === v.k
                      ? "bg-[var(--bg-elevated)] text-[var(--accent)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  )}
                >
                  <Icon name={v.i} size={15} />
                </button>
              ))}
            </div>
            <Badge tone="slate" size="md">
              {filtered.length} {filtered.length === 1 ? "team" : "teams"}
            </Badge>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
              >
                <Icon name="close" size={13} />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid / states */}
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <Skeleton className="h-12 w-12" rounded="rounded-xl" />
                <Skeleton className="h-5 w-16" rounded="rounded-full" />
              </div>
              <Skeleton className="h-4 w-2/3 mb-3" rounded="rounded-md" />
              <Skeleton className="h-3 w-full mb-2" rounded="rounded-md" />
              <Skeleton className="h-3 w-4/5" rounded="rounded-md" />
              <div className="mt-5 pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                <Skeleton className="h-4 w-24" rounded="rounded-md" />
                <Skeleton className="h-4 w-16" rounded="rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="teams"
            title={searchQuery ? "No teams match your search" : "No teams yet"}
            description={
              searchQuery
                ? "Try a different name or description, or clear the search to see all teams."
                : "Create your first team to start organizing agents by department or expertise."
            }
            action={
              searchQuery ? (
                <Button variant="secondary" onClick={() => setSearchQuery("")} icon={<Icon name="close" size={14} />}>
                  Clear search
                </Button>
              ) : (
                isAdmin && (
                  <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                    Create Team
                  </Button>
                )
              )
            }
          />
        </div>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-surface)]/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Team</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Description</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Members</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Created</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((team, idx) => {
                  const tint = TEAM_TINTS[idx % TEAM_TINTS.length];
                  const memberCount = team.member_count || 0;
                  return (
                    <tr
                      key={team.id}
                      onClick={() => openMembersModal(team)}
                      className="border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center border", tint.tile)}>
                            <Icon name="teams" size={16} />
                          </div>
                          <span className="font-medium text-[var(--fg-primary)] truncate">{team.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[360px]">
                        <span className="text-[var(--fg-secondary)] line-clamp-1">{team.description || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center gap-1.5 text-[var(--fg-secondary)]">
                          <Icon name="users" size={13} className="text-[var(--fg-muted)]" />
                          <span className="tabular-nums">{memberCount}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--fg-muted)]">
                        {team.created_at ? new Date(team.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openMembersModal(team)} title="Manage members" className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all">
                            <Icon name="users" size={14} />
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openPrivilegesModal(team)} title="Team privileges" className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition-all">
                                <Icon name="shield" size={14} />
                              </button>
                              <button onClick={() => openEditModal(team)} title="Edit team" className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all">
                                <Icon name="pencil" size={14} />
                              </button>
                              <button onClick={() => handleDelete(team)} title="Delete team" className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                                <Icon name="trash" size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((team, idx) => {
            const tint = TEAM_TINTS[idx % TEAM_TINTS.length];
            const memberCount = team.member_count || 0;
            return (
              <div
                key={team.id}
                onClick={() => openMembersModal(team)}
                className={cn(
                  "group relative flex flex-col text-left overflow-hidden rounded-2xl p-5 cursor-pointer",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                  "animate-fade-up"
                )}
                style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
              >
                {/* decorative tint glow */}
                <div className={cn("pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full opacity-[0.07] blur-3xl", tint.glow)} />

                <div className="relative flex items-start justify-between mb-4">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110",
                      tint.tile
                    )}
                  >
                    <Icon name="teams" size={22} />
                  </div>
                  {isAdmin && (
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openPrivilegesModal(team)}
                        className={cn(
                          "p-2 rounded-lg transition-all duration-150",
                          "text-[var(--fg-muted)] hover:text-amber-500",
                          "hover:bg-amber-500/10"
                        )}
                        title="Team Privileges"
                      >
                        <Icon name="shield" size={15} />
                      </button>
                      <button
                        onClick={() => openEditModal(team)}
                        className={cn(
                          "p-2 rounded-lg transition-all duration-150",
                          "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                          "hover:bg-[var(--bg-surface)]"
                        )}
                        title="Edit team"
                      >
                        <Icon name="pencil" size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(team)}
                        title="Delete team"
                        className={cn(
                          "p-2 rounded-lg transition-all duration-150",
                          "text-[var(--fg-muted)] hover:text-rose-500",
                          "hover:bg-rose-500/10"
                        )}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="relative text-base font-semibold text-[var(--fg-primary)] mb-1.5 line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                  {team.name}
                </h3>
                <p className="relative text-sm text-[var(--fg-secondary)] line-clamp-2 mb-4 min-h-[40px] leading-relaxed">
                  {team.description || "No description provided"}
                </p>

                <div className="relative mt-auto pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--fg-secondary)]">
                    <span className="h-7 w-7 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center text-[var(--fg-muted)]">
                      <Icon name="users" size={14} />
                    </span>
                    <span className="tabular-nums">
                      {memberCount} {memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                    <Icon name="calendar" size={12} />
                    <span>{team.created_at ? new Date(team.created_at).toLocaleDateString() : "—"}</span>
                  </span>
                </div>

                {/* hover affordance */}
                <div className="relative mt-3 flex items-center gap-1 text-xs font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all">
                  Manage members
                  <Icon name="arrowRight" size={13} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Team Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingTeam ? "Edit Team" : "Create Team"}
        subtitle={editingTeam ? "Update team details" : "Add a new team to your organization"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingTeam ? "Save Changes" : "Create Team"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-label mb-3">Team details</p>
            <div className="space-y-4">
              <Input
                label="Team Name"
                placeholder="Support Team"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                icon="teams"
              />
              <Textarea
                label="Description"
                placeholder="Describe the team's responsibilities and purpose..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                helperText="Optional — appears on the team card to help others understand its focus."
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Privileges Modal */}
      <Modal
        open={showPrivilegesModal}
        onClose={() => setShowPrivilegesModal(false)}
        title={`Team Privileges — ${privilegesTeam?.name || ""}`}
        subtitle="Configure which modules this team's members can access"
        size="lg"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowPrivilegesModal(false)}>Cancel</Button>
            <Button onClick={savePrivileges} loading={savingPrivileges} icon={<Icon name="shield" size={14} />}>
              Save Privileges
            </Button>
          </>
        }
      >
        {loadingPrivileges ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" rounded="rounded-xl" />
            <Skeleton className="h-4 w-32" rounded="rounded-md" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" rounded="rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Restriction master toggle */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl",
              "border-2 transition-all duration-200",
              privilegesRestricted
                ? "bg-amber-500/5 border-amber-500/30"
                : "bg-emerald-500/5 border-emerald-500/30"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  privilegesRestricted
                    ? "bg-amber-500/15 text-amber-500"
                    : "bg-emerald-500/15 text-emerald-500"
                )}>
                  <Icon name={privilegesRestricted ? "lock" : "lockOpen"} size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--fg-primary)]">
                    {privilegesRestricted ? "Custom Access" : "Unrestricted Access"}
                  </p>
                  <p className="text-xs text-[var(--fg-secondary)]">
                    {privilegesRestricted
                      ? "Only selected modules below are accessible to team members"
                      : "Team members can access all modules their role allows"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!privilegesRestricted) {
                    // Switching to restricted: default enable all modules
                    setPrivilegesModules(moduleRegistry.map(m => m.key));
                  }
                  setPrivilegesRestricted(!privilegesRestricted);
                }}
                className={cn(
                  "relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-200 cursor-pointer",
                  privilegesRestricted ? "bg-amber-500" : "bg-emerald-500"
                )}
              >
                <span className={cn(
                  "inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-1",
                  privilegesRestricted ? "translate-x-6 ml-0.5" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Module grid — only shown when restricted */}
            {privilegesRestricted && (
              <div className="space-y-6">
                {Object.entries(modulesBySection).map(([section, modules]) => {
                  const allSelected = modules.every(m => privilegesModules.includes(m.key));
                  const noneSelected = modules.every(m => !privilegesModules.includes(m.key));

                  const sectionColors = {
                    Main: { bg: "bg-blue-500/8", border: "border-blue-500/20", text: "text-blue-500", dot: "bg-blue-500" },
                    Administration: { bg: "bg-violet-500/8", border: "border-violet-500/20", text: "text-violet-500", dot: "bg-violet-500" },
                    Operations: { bg: "bg-emerald-500/8", border: "border-emerald-500/20", text: "text-emerald-500", dot: "bg-emerald-500" },
                  };
                  const sc = sectionColors[section] || sectionColors.Main;

                  return (
                    <div key={section}>
                      {/* Section header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", sc.dot)} />
                          <h4 className={cn("text-sm font-semibold", sc.text)}>{section}</h4>
                          <span className="text-xs text-[var(--fg-muted)]">
                            ({modules.filter(m => privilegesModules.includes(m.key)).length}/{modules.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => selectAllInSection(modules)}
                            disabled={allSelected}
                            className="text-[10px] font-medium text-[var(--accent)] hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Select all
                          </button>
                          <span className="text-[var(--fg-muted)]">|</span>
                          <button
                            onClick={() => deselectAllInSection(modules)}
                            disabled={noneSelected}
                            className="text-[10px] font-medium text-[var(--fg-secondary)] hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Module cards */}
                      <div className="grid gap-2">
                        {modules.map(mod => {
                          const isEnabled = privilegesModules.includes(mod.key);
                          const iconMap = {
                            dashboard: "dashboard", tickets: "tickets", approvals: "checkCircle",
                            users: "users", teams: "teams", hierarchy: "sitemap",
                            "approval-rules": "settings", templates: "clipboard",
                            assets: "assets", sla: "sla", "knowledge-base": "knowledgeBase",
                            reports: "reports",
                          };
                          return (
                            <button
                              key={mod.key}
                              onClick={() => togglePrivilegeModule(mod.key)}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg text-left w-full transition-all duration-200",
                                "border",
                                isEnabled
                                  ? cn(sc.bg, sc.border)
                                  : "bg-[var(--bg-base)] border-[var(--border-default)] opacity-60 hover:opacity-80"
                              )}
                            >
                              {/* Toggle */}
                              <div className={cn(
                                "w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all",
                                isEnabled
                                  ? "bg-[var(--accent)] text-white"
                                  : "border-2 border-[var(--border-default)]"
                              )}>
                                {isEnabled && (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                )}
                              </div>

                              {/* Icon */}
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                isEnabled ? sc.bg : "bg-[var(--bg-elevated)]",
                                isEnabled ? sc.text : "text-[var(--fg-muted)]"
                              )}>
                                <Icon name={iconMap[mod.key] || "grid"} size={16} />
                              </div>

                              {/* Label + description */}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-sm font-medium",
                                  isEnabled ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)]"
                                )}>
                                  {mod.label}
                                </p>
                                <p className="text-[11px] text-[var(--fg-muted)] line-clamp-1">{mod.description}</p>
                              </div>

                              {/* Role badge */}
                              {mod.roles && (
                                <Badge tone={mod.roles.includes("admin") && mod.roles.length === 1 ? "brand" : "blue"} size="sm">
                                  {mod.roles.includes("admin") && mod.roles.length === 1
                                    ? "Admin"
                                    : mod.roles.join(" & ")}
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Info note */}
                <div className={cn(
                  "flex items-start gap-3 p-3 rounded-lg",
                  "bg-blue-500/5 border border-blue-500/20"
                )}>
                  <Icon name="info" size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                    <strong className="text-[var(--fg-primary)]">Note:</strong> Module access works alongside role permissions.
                    A user still needs the correct role (Admin, Agent) to see admin-only modules.
                    Admins always have unrestricted access regardless of team settings.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Team Members Modal */}
      <Modal
        open={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        title={selectedTeam?.name || "Team Members"}
        subtitle={`${teamMembers.length} member${teamMembers.length !== 1 ? 's' : ''} in this team`}
        size="lg"
        actions={
          <Button variant="secondary" onClick={() => setShowMembersModal(false)}>Done</Button>
        }
      >
        {loadingMembers ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-default)]">
                <Skeleton className="h-9 w-9" rounded="rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" rounded="rounded-md" />
                  <Skeleton className="h-3 w-56" rounded="rounded-md" />
                </div>
                <Skeleton className="h-6 w-16" rounded="rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Team Hierarchy View — only shown when there are members */}
            {teamMembers.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-[var(--fg-primary)] mb-3 flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <Icon name="organization" size={14} />
                  </span>
                  Team Hierarchy
                </h4>
                <div className={cn(
                  "p-4 rounded-xl",
                  "bg-[var(--bg-base)] border border-[var(--border-default)]"
                )}>
                  <TeamHierarchy members={teamMembers} />
                </div>
              </div>
            )}

            {/* Member List */}
            <div>
              {/* Section header with Add Member button */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-[var(--fg-primary)] flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                    <Icon name="users" size={14} />
                  </span>
                  All Members
                  {teamMembers.length > 0 && (
                    <Badge tone="slate" size="sm">{teamMembers.length}</Badge>
                  )}
                </h4>
                {isAdmin && (
                  <button
                    onClick={() => { setShowAddMember(!showAddMember); setAddMemberSearch(""); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                      showAddMember
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                        : "bg-[var(--bg-base)] text-[var(--fg-secondary)] border border-[var(--border-default)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40"
                    )}
                  >
                    <Icon name="userPlus" size={13} />
                    Add Member
                  </button>
                )}
              </div>

              {/* Inline Add Member search */}
              {showAddMember && isAdmin && (
                <div className="mb-3 relative">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search users to add..."
                      value={addMemberSearch}
                      onChange={(e) => setAddMemberSearch(e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-3 py-2.5 rounded-lg text-sm",
                        "bg-[var(--bg-base)] border border-[var(--accent)]/40",
                        "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                        "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                      )}
                    />
                  </div>
                  {addMemberSearch.trim() && (() => {
                    const memberIds = new Set(teamMembers.map(m => m.id));
                    const q = addMemberSearch.toLowerCase();
                    const suggestions = allUsers.filter(u =>
                      !memberIds.has(u.id) &&
                      ((u.full_name || "").toLowerCase().includes(q) ||
                       (u.email || "").toLowerCase().includes(q))
                    ).slice(0, 8);
                    if (suggestions.length === 0) return (
                      <div className={cn(
                        "absolute z-10 w-full mt-1 rounded-lg py-3 text-center text-sm",
                        "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                        "text-[var(--fg-muted)] shadow-[var(--shadow-elevated)]"
                      )}>
                        No users found
                      </div>
                    );
                    return (
                      <div className={cn(
                        "absolute z-10 w-full mt-1 rounded-lg overflow-hidden",
                        "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-elevated)]"
                      )}>
                        {suggestions.map(u => (
                          <button
                            key={u.id}
                            onClick={() => addMember(u)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                              "hover:bg-[var(--bg-surface)]"
                            )}
                          >
                            <div className={cn(
                              "h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0",
                              "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold text-xs"
                            )}>
                              {(u.full_name || u.email || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                                {u.full_name || u.email}
                              </p>
                              <p className="text-xs text-[var(--fg-muted)] truncate">{u.email}</p>
                            </div>
                            <Icon name="plus" size={14} className="text-[var(--fg-muted)] shrink-0" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {teamMembers.length === 0 ? (
                <EmptyState
                  icon="users"
                  title="No members yet"
                  description="Use the Add Member button above to add people to this team."
                  compact
                />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl",
                        "bg-[var(--bg-base)] border border-[var(--border-default)]",
                        "hover:border-[var(--border-hover)] transition-colors"
                      )}
                    >
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                        "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold text-sm"
                      )}>
                        {(member.full_name || member.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--fg-primary)] truncate flex items-center gap-1.5">
                          {member.full_name || "Unnamed"}
                          {member.is_lead && (
                            <Icon name="star" size={12} className="text-amber-500 shrink-0" />
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                          <span className="truncate">{member.email}</span>
                          {member.manager && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Icon name="arrowUp" size={10} />
                                Reports to {member.manager.full_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                        {member.title && (
                          <Badge tone="slate" size="sm">{member.title}</Badge>
                        )}
                        {(member.roles || []).map((role) => (
                          <Badge
                            key={role}
                            tone={role === "admin" ? "brand" : role === "agent" ? "blue" : "slate"}
                            size="sm"
                          >
                            {role}
                          </Badge>
                        ))}
                        {/* Toggle Lead button */}
                        {isAdmin && (
                          <button
                            onClick={() => toggleLead(member)}
                            disabled={togglingLead === member.id}
                            title={member.is_lead ? "Remove manager status" : "Set as team manager"}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-200",
                              togglingLead === member.id
                                ? "opacity-50 cursor-not-allowed"
                                : member.is_lead
                                  ? "bg-amber-500/15 text-amber-500 border border-amber-400/40 hover:bg-amber-500/25"
                                  : "bg-[var(--bg-elevated)] text-[var(--fg-muted)] border border-[var(--border-default)] hover:text-amber-500 hover:border-amber-400/40"
                            )}
                          >
                            {togglingLead === member.id ? (
                              <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : member.is_lead ? (
                              <span>★ Manager</span>
                            ) : (
                              <span>☆ Set Manager</span>
                            )}
                          </button>
                        )}
                        {/* Remove member button */}
                        {isAdmin && (
                          <button
                            onClick={() => removeMember(member)}
                            title="Remove from team"
                            className={cn(
                              "p-1.5 rounded-md transition-all duration-200",
                              "text-[var(--fg-muted)] hover:text-rose-500",
                              "hover:bg-rose-500/10 border border-transparent hover:border-rose-400/30"
                            )}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirmDialog}
    </div>
  );
}
