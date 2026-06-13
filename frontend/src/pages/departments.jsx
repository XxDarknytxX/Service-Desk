/**
 * Departments Page — Vodafone Service Desk
 *
 * Premium organization experience: a branded header, at-a-glance KPI rail
 * (derived from existing department data), a grid / table view switcher, an
 * elevated card grid and data table, and grouped create/edit modal fields.
 *
 * Fully token-driven (dark & light), responsive, with shimmer loading and a
 * polished empty state. Every piece of state, every handler, API call, and
 * feature (search, create/edit/delete, parent + head selection, admin gating)
 * is preserved exactly — visual / layout changes only.
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea, Select } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton, { SkeletonKpis } from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

// Rotating tints for department cards — full static class strings (no dynamic Tailwind)
const DEPT_TINTS = [
  { icon: "bg-violet-500/10 text-violet-500 border-violet-500/15", ring: "violet" },
  { icon: "bg-blue-500/10 text-blue-500 border-blue-500/15", ring: "blue" },
  { icon: "bg-cyan-500/10 text-cyan-500 border-cyan-500/15", ring: "cyan" },
  { icon: "bg-teal-500/10 text-teal-500 border-teal-500/15", ring: "teal" },
  { icon: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", ring: "emerald" },
  { icon: "bg-indigo-500/10 text-indigo-500 border-indigo-500/15", ring: "indigo" },
  { icon: "bg-purple-500/10 text-purple-500 border-purple-500/15", ring: "purple" },
  { icon: "bg-pink-500/10 text-pink-500 border-pink-500/15", ring: "pink" },
];

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Departments() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // grid | table — presentation only
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    parent_department_id: "",
    head_user_id: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => {
    loadDepartments();
    loadUsers();
  }, []);

  async function loadDepartments() {
    try {
      const data = await api("/departments");
      setDepartments(data.departments || []);
    } catch (error) {
      console.error("Failed to load departments:", error);
      toast.error(error.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await api("/users");
      setUsers(data.items || []);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }

  function openCreateModal() {
    setEditingDept(null);
    setFormData({
      name: "",
      description: "",
      parent_department_id: "",
      head_user_id: ""
    });
    setShowModal(true);
  }

  function openEditModal(dept) {
    setEditingDept(dept);
    setFormData({
      name: dept.name || "",
      description: dept.description || "",
      parent_department_id: dept.parent_department_id || "",
      head_user_id: dept.head_user_id || ""
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        parent_department_id: formData.parent_department_id ? Number(formData.parent_department_id) : null,
        head_user_id: formData.head_user_id ? Number(formData.head_user_id) : null
      };

      if (editingDept) {
        await api(`/departments/${editingDept.id}`, { method: "PATCH", body: payload });
        toast.success("Department updated");
      } else {
        await api("/departments", { method: "POST", body: payload });
        toast.success("Department created");
      }
      setShowModal(false);
      loadDepartments();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(dept) {
    confirm({
      title: "Delete department?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{dept.name}</strong>.
          Sub-departments will become top-level. This action cannot be undone.
        </>
      ),
      confirmText: "Delete Department",
      onConfirm: async () => {
        try {
          await api(`/departments/${dept.id}`, { method: "DELETE" });
          toast.success("Department deleted");
          loadDepartments();
        } catch (error) {
          toast.error(error.message);
        }
      },
    });
  }

  const filtered = departments.filter((d) =>
    (d.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Build a map for department lookup
  const deptMap = {};
  departments.forEach(d => { deptMap[d.id] = d; });

  // ── Derived KPIs (from already-fetched data — nothing fabricated) ──
  const totalTeams = departments.reduce((sum, d) => sum + (Number(d.team_count) || 0), 0);
  const totalMembers = departments.reduce((sum, d) => sum + (Number(d.user_count) || 0), 0);
  const subDeptCount = departments.filter(d => d.parent_department_id).length;

  const kpis = [
    {
      label: "Departments",
      value: departments.length,
      icon: "organization",
      iconCls: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/15",
      hint: "Total departments",
    },
    {
      label: "Sub-departments",
      value: subDeptCount,
      icon: "sitemap",
      iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15",
      hint: "Nested under a parent",
    },
    {
      label: "Teams",
      value: totalTeams,
      icon: "teams",
      iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15",
      hint: "Across all departments",
    },
    {
      label: "Members",
      value: totalMembers,
      icon: "users",
      iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
      hint: "People assigned",
    },
  ];

  // Reusable bordered icon-button for header controls (mirrors tickets.jsx ControlButton)
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

  const fmtDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="organization"
        title="Departments"
        subtitle="Organize teams and users by department hierarchy"
        actions={
          <>
            <ControlButton title="Refresh" onClick={loadDepartments}>
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </ControlButton>
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
              {[
                { key: "grid", icon: "grid", title: "Grid view" },
                { key: "table", icon: "list", title: "Table view" },
              ].map((m) => {
                const active = viewMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setViewMode(m.key)}
                    title={m.title}
                    className={cn(
                      "h-8 w-8 inline-flex items-center justify-center rounded-md transition-all duration-150",
                      active
                        ? "bg-[var(--bg-elevated)] text-[var(--accent)] shadow-[var(--shadow-sm)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                    )}
                  >
                    <Icon name={m.icon} size={15} />
                  </button>
                );
              })}
            </div>
            {isAdmin && (
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Create Department
              </Button>
            )}
          </>
        }
      />

      {/* KPI rail */}
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

      {/* Search toolbar */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search departments..."
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
          <Badge tone="slate">
            {filtered.length} {filtered.length === 1 ? "department" : "departments"}
          </Badge>
        </div>
      </div>

      {/* Content states */}
      {loading ? (
        viewMode === "table" ? (
          <DeptTableSkeleton />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <DeptCardSkeleton key={i} delay={i * 60} />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="organization"
            title="No departments found"
            description={
              searchQuery
                ? "Try a different search term to find what you're looking for."
                : "Create your first department to start organizing teams and people."
            }
            action={
              isAdmin && !searchQuery ? (
                <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                  Create Department
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        /* ── Card grid ── */
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((dept, idx) => {
            const tint = DEPT_TINTS[idx % DEPT_TINTS.length];
            const parentDept = dept.parent_department_id ? deptMap[dept.parent_department_id] : null;
            const headUser = users.find((u) => u.id === dept.head_user_id);

            return (
              <div
                key={dept.id}
                className={cn(
                  "group relative flex flex-col rounded-2xl p-5",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                  "animate-fade-up"
                )}
                style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-105",
                      tint.icon
                    )}
                  >
                    <Icon name="building" size={22} />
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => openEditModal(dept)}
                        title="Edit department"
                        className={cn(
                          "p-2 rounded-lg transition-all duration-150",
                          "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                          "hover:bg-[var(--bg-surface)]"
                        )}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(dept)}
                        title="Delete department"
                        className={cn(
                          "p-2 rounded-lg transition-all duration-150",
                          "text-[var(--fg-muted)] hover:text-rose-500",
                          "hover:bg-rose-500/10"
                        )}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-semibold text-[var(--fg-primary)] tracking-tight mb-1.5 line-clamp-1">
                  {dept.name}
                </h3>
                <p className="text-sm text-[var(--fg-secondary)] leading-relaxed line-clamp-2 mb-4 min-h-[40px]">
                  {dept.description || "No description provided"}
                </p>

                {/* Hierarchy & ownership */}
                <div className="space-y-2 mb-4">
                  {parentDept && (
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <Icon name="sitemap" size={13} className="shrink-0" />
                      <span className="truncate">Parent: <span className="text-[var(--fg-secondary)]">{parentDept.name}</span></span>
                    </div>
                  )}
                  {headUser && (
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <Icon name="userCheck" size={13} className="shrink-0" />
                      <span className="truncate">Head: <span className="text-[var(--fg-secondary)]">{headUser.full_name || headUser.email}</span></span>
                    </div>
                  )}
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-default)] px-3 py-2">
                    <Icon name="teams" size={14} className="text-blue-500 shrink-0" />
                    <span className="text-sm font-semibold text-[var(--fg-primary)] tabular-nums">{dept.team_count || 0}</span>
                    <span className="text-xs text-[var(--fg-muted)]">teams</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-default)] px-3 py-2">
                    <Icon name="users" size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-[var(--fg-primary)] tabular-nums">{dept.user_count || 0}</span>
                    <span className="text-xs text-[var(--fg-muted)]">users</span>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                    <Icon name="hash" size={12} />
                    <span className="font-mono text-[var(--accent)]">{dept.id}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                    <Icon name="calendar" size={12} />
                    <span>{fmtDate(dept.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Table view ── */
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                  <th className="px-4 py-3 text-left text-label">Department</th>
                  <th className="px-4 py-3 text-left text-label hidden lg:table-cell">Parent</th>
                  <th className="px-4 py-3 text-left text-label hidden lg:table-cell">Head</th>
                  <th className="px-4 py-3 text-left text-label">Teams</th>
                  <th className="px-4 py-3 text-left text-label">Users</th>
                  <th className="px-4 py-3 text-left text-label hidden md:table-cell">Created</th>
                  {isAdmin && <th className="px-4 py-3 text-right text-label w-px whitespace-nowrap">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {filtered.map((dept, idx) => {
                  const tint = DEPT_TINTS[idx % DEPT_TINTS.length];
                  const parentDept = dept.parent_department_id ? deptMap[dept.parent_department_id] : null;
                  const headUser = users.find((u) => u.id === dept.head_user_id);

                  return (
                    <tr
                      key={dept.id}
                      className="hover:bg-[var(--bg-surface)] transition-colors duration-150 group"
                    >
                      {/* Department */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-9 w-9 rounded-lg flex items-center justify-center border shrink-0",
                              tint.icon
                            )}
                          >
                            <Icon name="building" size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--fg-primary)] truncate">{dept.name}</span>
                              <span className="text-[11px] font-mono text-[var(--accent)] shrink-0">#{dept.id}</span>
                            </div>
                            {dept.description && (
                              <p className="text-xs text-[var(--fg-muted)] truncate max-w-[320px]">{dept.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Parent */}
                      <td className="px-4 py-3.5 hidden lg:table-cell whitespace-nowrap">
                        {parentDept ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-secondary)]">
                            <Icon name="sitemap" size={13} className="text-[var(--fg-muted)]" />
                            {parentDept.name}
                          </span>
                        ) : (
                          <Badge tone="slate" size="sm">Top level</Badge>
                        )}
                      </td>

                      {/* Head */}
                      <td className="px-4 py-3.5 hidden lg:table-cell whitespace-nowrap">
                        {headUser ? (
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold flex items-center justify-center shrink-0">
                              {(headUser.full_name || headUser.email || "?").charAt(0).toUpperCase()}
                            </span>
                            <span className="text-sm text-[var(--fg-secondary)]">{headUser.full_name || headUser.email}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-[var(--fg-muted)] italic">Unassigned</span>
                        )}
                      </td>

                      {/* Teams */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-primary)] tabular-nums">
                          <Icon name="teams" size={13} className="text-blue-500" />
                          {dept.team_count || 0}
                        </span>
                      </td>

                      {/* Users */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-primary)] tabular-nums">
                          <Icon name="users" size={13} className="text-emerald-500" />
                          {dept.user_count || 0}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5 hidden md:table-cell whitespace-nowrap">
                        <span className="text-xs text-[var(--fg-muted)]">{fmtDate(dept.created_at)}</span>
                      </td>

                      {/* Actions */}
                      {isAdmin && (
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <button
                              onClick={() => openEditModal(dept)}
                              title="Edit department"
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] transition-all duration-150"
                            >
                              <Icon name="pencil" size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(dept)}
                              title="Delete department"
                              className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all duration-150"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingDept ? "Edit Department" : "Create Department"}
        subtitle={editingDept ? "Update department details" : "Add a new department to your organization"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingDept ? "Save Changes" : "Create Department"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Details section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                <Icon name="building" size={14} />
              </span>
              <h3 className="text-label">Details</h3>
            </div>
            <Input
              label="Department Name"
              placeholder="Engineering"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              icon="building"
            />
            <Textarea
              label="Description"
              placeholder="Describe the department's responsibilities and purpose..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>

          {/* Hierarchy & ownership section */}
          <div className="space-y-4 pt-2 border-t border-[var(--border-default)]">
            <div className="flex items-center gap-2 pt-2">
              <span className="h-7 w-7 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
                <Icon name="sitemap" size={14} />
              </span>
              <h3 className="text-label">Hierarchy &amp; ownership</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Parent Department"
                value={formData.parent_department_id}
                onChange={(e) => setFormData({ ...formData, parent_department_id: e.target.value })}
                helperText="Leave empty for a top-level department"
              >
                <option value="">None (Top Level)</option>
                {departments
                  .filter(d => !editingDept || d.id !== editingDept.id) // Don't allow self as parent
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))
                }
              </Select>
              <Select
                label="Department Head"
                value={formData.head_user_id}
                onChange={(e) => setFormData({ ...formData, head_user_id: e.target.value })}
                helperText="The person who leads this department"
              >
                <option value="">No head assigned</option>
                {users
                  .filter(u => u.is_active)
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email} {u.title ? `(${u.title})` : ""}
                    </option>
                  ))
                }
              </Select>
            </div>
          </div>
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}

/* ── Loading placeholders (shape-matched to the card / table) ── */

function DeptCardSkeleton({ delay = 0 }) {
  return (
    <div
      className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="h-12 w-12" rounded="rounded-xl" />
      </div>
      <Skeleton className="h-4 w-1/2 mb-2" rounded="rounded-md" />
      <Skeleton className="h-3 w-full mb-1.5" rounded="rounded-md" />
      <Skeleton className="h-3 w-3/4 mb-4" rounded="rounded-md" />
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Skeleton className="h-9" rounded="rounded-lg" />
        <Skeleton className="h-9" rounded="rounded-lg" />
      </div>
      <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
        <Skeleton className="h-3 w-10" rounded="rounded-md" />
        <Skeleton className="h-3 w-20" rounded="rounded-md" />
      </div>
    </div>
  );
}

function DeptTableSkeleton() {
  return (
    <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/40">
        {[40, 24, 24, 16, 16, 20].map((w, i) => (
          <Skeleton key={i} className="h-3" rounded="rounded-md" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="divide-y divide-[var(--border-default)]">
        {Array.from({ length: 7 }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-9 w-9 shrink-0" rounded="rounded-lg" />
            <Skeleton className="h-3.5 w-44" rounded="rounded-md" />
            <div className="hidden lg:flex gap-4 flex-1">
              <Skeleton className="h-3 w-24" rounded="rounded-md" />
              <Skeleton className="h-3 w-24" rounded="rounded-md" />
            </div>
            <Skeleton className="h-3 w-10 ml-auto" rounded="rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
