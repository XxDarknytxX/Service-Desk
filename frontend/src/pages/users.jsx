/**
 * Users Page — Vodafone Service Desk
 *
 * Premium directory experience: branded header, a clean search + role filter
 * toolbar, and an elevated data table with avatar initials, role/status badges,
 * hover rows and per-row quick actions. Skeleton loading, empty states, and
 * polished create/edit, generated-password, and bulk-import modals.
 *
 * All state, effects, handlers, API calls, and features are preserved exactly —
 * this is a visual / layout redesign only.
 */

import { useEffect, useState, useMemo } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Modal from "../components/ui/Modal";
import Input, { Select } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonTable } from "../components/ui/Skeleton";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const roleBadgeColors = {
  admin: "brand",
  agent: "blue",
  requester: "slate",
};

// Avatar tint per role — static class strings (no dynamic Tailwind).
const roleAvatarStyles = {
  admin: "bg-[var(--accent)]/10 text-[var(--accent)]",
  agent: "bg-blue-500/10 text-blue-500",
  requester: "bg-slate-500/10 text-slate-400",
};

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  // Team Members (org directory) vs Corporate Customers; agents only ever see customers.
  const [userTab, setUserTab] = useState(user?.roles?.includes("admin") ? "team" : "customers");
  const [statusFilter, setStatusFilter] = useState("active"); // active | inactive | all
  const [customerMode, setCustomerMode] = useState(false); // create/edit a corporate customer
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    title: "",
    company: "",
    phone: "",
    roles: ["requester"],
    manager_id: "",
    team_id: "",
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState(null);

  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersData, teamsData] = await Promise.all([
        api("/users"),
        api("/teams").catch(() => ({ teams: [] })) // Handle teams API failure gracefully
      ]);
      setUsers(usersData.items || usersData || []);
      // Ensure teams is always an array
      const teamsList = teamsData?.teams || teamsData?.items || [];
      setTeams(Array.isArray(teamsList) ? teamsList : []);
    } catch (error) {
      console.error("Failed to load data:", error);
      setTeams([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingUser(null);
    setCustomerMode(false);
    setFormData({
      full_name: "",
      email: "",
      password: "",
      title: "",
      company: "",
      phone: "",
      roles: ["requester"],
      manager_id: "",
      team_id: "",
      is_active: true,
    });
    setGeneratedPassword(null);
    setShowModal(true);
  }

  // Corporate customers are a different kind of user: no org hierarchy/team,
  // role fixed to corporate_customer, with a required company.
  function openCreateCustomerModal() {
    setEditingUser(null);
    setCustomerMode(true);
    setFormData({
      full_name: "",
      email: "",
      password: "",
      title: "",
      company: "",
      phone: "",
      roles: ["corporate_customer"],
      manager_id: "",
      team_id: "",
      is_active: true,
    });
    setGeneratedPassword(null);
    setShowModal(true);
  }

  async function openEditModal(u) {
    setEditingUser(u);
    setCustomerMode((u.roles || []).includes("corporate_customer"));

    // Get current manager and team for this user
    let currentManagerId = "";
    let currentTeamId = "";

    try {
      // Fetch user's current manager
      const hierarchyData = await api(`/hierarchy/user/${u.id}`).catch(() => ({ chain: [] }));
      if (hierarchyData.chain && hierarchyData.chain.length > 0) {
        currentManagerId = hierarchyData.chain[0].manager_id || "";
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
      email: u.email || "",
      password: "",
      title: u.title || "",
      company: u.company || "",
      phone: u.phone || "",
      roles: u.roles || ["requester"],
      manager_id: currentManagerId,
      team_id: currentTeamId,
      is_active: u.is_active !== undefined ? !!u.is_active : true,
    });
    setGeneratedPassword(null);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (customerMode && !(formData.company || "").trim()) {
      toast.error("Company is required for corporate customers");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { ...formData };
      // Blank password → let the backend auto-generate (never send an empty string,
      // which fails the "if present, min 6 chars" validation).
      if (!payload.password) delete payload.password;

      // Clean up empty values
      if (!payload.manager_id) delete payload.manager_id;
      if (!payload.team_id) delete payload.team_id;

      if (editingUser) {
        await api(`/users/${editingUser.id}`, { method: "PATCH", body: payload });

        // Update manager if changed
        if (formData.manager_id) {
          await api("/hierarchy/set-manager", {
            method: "POST",
            body: {
              user_id: editingUser.id,
              manager_id: Number(formData.manager_id)
            }
          });
        } else {
          // Remove manager if cleared
          await api(`/hierarchy/user/${editingUser.id}`, { method: "DELETE" }).catch(() => {});
        }

        // Update team membership: always clear, then re-add if one is selected
        await api(`/teams/members/${editingUser.id}`, { method: "DELETE" }).catch(() => {});
        if (formData.team_id) {
          await api("/teams/members", {
            method: "POST",
            body: {
              team_id: Number(formData.team_id),
              user_id: editingUser.id
            }
          });
        }

        toast.success("User updated");
        setShowModal(false);
        loadData();
      } else {
        const result = await api("/users", { method: "POST", body: payload });

        // If manager or team was selected, assign them after user creation
        const userId = result.id;

        if (formData.manager_id) {
          await api("/hierarchy/set-manager", {
            method: "POST",
            body: {
              user_id: userId,
              manager_id: Number(formData.manager_id)
            }
          });
        }

        if (formData.team_id) {
          await api("/teams/members", {
            method: "POST",
            body: {
              team_id: Number(formData.team_id),
              user_id: userId
            }
          });
        }

        if (result.generatedPassword) {
          setGeneratedPassword(result.generatedPassword);
        } else {
          toast.success("User created");
          setShowModal(false);
          loadData();
        }
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function generateRandomPassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure at least one uppercase, lowercase, digit, and special char
    if (!/[A-Z]/.test(password)) password = "A" + password.slice(1);
    if (!/[a-z]/.test(password)) password = password.slice(0, 1) + "a" + password.slice(2);
    if (!/[0-9]/.test(password)) password = password.slice(0, 2) + "1" + password.slice(3);
    if (!/[!@#$%^&*]/.test(password)) password = password.slice(0, 3) + "!" + password.slice(4);
    setFormData({ ...formData, password });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.success("Password copied to clipboard!");
  }

  function closePasswordModal() {
    setGeneratedPassword(null);
    setShowModal(false);
    loadData();
  }

  function handleDeleteUser(userId, userName) {
    confirm({
      title: "Delete user?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{userName}</strong> and
          remove their team and hierarchy assignments. This action cannot be
          undone.
        </>
      ),
      confirmText: "Delete User",
      onConfirm: async () => {
        try {
          await api(`/users/${userId}`, { method: "DELETE" });
          toast.success("User deleted");
          loadData();
        } catch (error) {
          toast.error(error.message || "Failed to delete user");
        }
      },
    });
  }

  const isCustomer = (u) => (u.roles || []).includes("corporate_customer");

  async function handleToggleActive(u) {
    const next = !(u.is_active);
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { is_active: next } });
      toast.success(next ? "User activated" : "User deactivated");
      loadData();
    } catch (error) {
      toast.error(error.message || "Failed to update user");
    }
  }

  function toggleRole(role) {
    setFormData((prev) => {
      const has = prev.roles.includes(role);
      const newRoles = has ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      return { ...prev, roles: newRoles.length > 0 ? newRoles : ["requester"] };
    });
  }

  function downloadTemplate() {
    const token = localStorage.getItem("token");
    const link = document.createElement("a");
    link.href = `${API_URL}/users/import-template`;
    // Use fetch to pass auth header, then download
    fetch(`${API_URL}/users/import-template`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = "user_import_template.xlsx";
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error("Failed to download template"));
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResults(null);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", importFile);
      const resp = await fetch(`${API_URL}/users/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Import failed");
      setImportResults(data);
      if (data.summary.created > 0) loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  }

  // Agents may only ever see the corporate-customer list, never the org directory.
  const effectiveTab = isAdmin ? userTab : "customers";

  const filteredUsers = useMemo(() => users.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = effectiveTab === "customers" ? isCustomer(u) : !isCustomer(u);
    const matchesStatus =
      statusFilter === "all" ? true : statusFilter === "active" ? !!u.is_active : !u.is_active;
    const matchesRole = effectiveTab === "team" ? (!roleFilter || (u.roles || []).includes(roleFilter)) : true;
    return matchesSearch && matchesTab && matchesStatus && matchesRole;
  }), [users, searchQuery, effectiveTab, statusFilter, roleFilter]);

  const customerCount = users.filter(isCustomer).length;
  const teamCount = users.length - customerCount;
  const hasFilters = !!searchQuery || (effectiveTab === "team" && !!roleFilter) || statusFilter !== "active";

  const ROLE_FILTERS = [
    { value: "", label: "All", icon: "users" },
    { value: "admin", label: "Admins", icon: "shield" },
    { value: "agent", label: "Agents", icon: "userCheck" },
    { value: "requester", label: "Requesters", icon: "user" },
  ];

  // Memoize the rows so opening the create/edit modal (which only flips modal
  // state) no longer re-renders the whole table — that was the open lag.
  // Handlers only call setters/api so omitting them from deps is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tableRows = useMemo(() => filteredUsers.map((u) => {
    const primaryRole = (u.roles || [])[0] || "requester";
    return (
      <tr
        key={u.id}
        onClick={isAdmin ? () => openEditModal(u) : undefined}
        className={cn(
          "transition-colors duration-150 group",
          isAdmin && "hover:bg-[var(--bg-surface)] cursor-pointer"
        )}
      >
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn("h-9 w-9 rounded-full text-xs font-semibold flex items-center justify-center shrink-0", roleAvatarStyles[primaryRole] || roleAvatarStyles.requester)}>
              {(u.full_name || u.email || "?")[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--fg-primary)] truncate group-hover:text-[var(--accent)] transition-colors">{u.full_name || "Unnamed"}</p>
              <p className="text-xs text-[var(--fg-muted)] truncate">{u.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5 hidden md:table-cell whitespace-nowrap">
          <span className="text-sm text-[var(--fg-secondary)]">{u.title || "—"}</span>
        </td>
        <td className="px-4 py-3.5 hidden lg:table-cell whitespace-nowrap">
          <span className="text-sm text-[var(--fg-secondary)]">{u.phone || "—"}</span>
        </td>
        <td className="px-4 py-3.5">
          {effectiveTab === "customers" ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--fg-secondary)]">
              {u.company ? <><Icon name="building" size={13} className="text-[var(--fg-muted)]" />{u.company}</> : <span className="text-[var(--fg-muted)]">—</span>}
            </span>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {(u.roles || []).map((role) => (
                <Badge key={role} tone={roleBadgeColors[role] || "slate"} size="sm">{role}</Badge>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <Badge tone={u.is_active ? "emerald" : "slate"} size="sm" dot={!!u.is_active}>
            {u.is_active ? "Active" : "Inactive"}
          </Badge>
        </td>
        {isAdmin && (
          <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button onClick={() => openEditModal(u)} className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] transition-colors" title="Edit user">
                <Icon name="pencil" size={15} />
              </button>
              <button
                onClick={() => handleToggleActive(u)}
                className={cn("p-2 rounded-lg transition-colors text-[var(--fg-muted)]", u.is_active ? "hover:text-amber-500 hover:bg-amber-500/10" : "hover:text-emerald-500 hover:bg-emerald-500/10")}
                title={u.is_active ? "Deactivate user" : "Activate user"}
              >
                <Icon name={u.is_active ? "lock" : "lockOpen"} size={15} />
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  }), [filteredUsers, isAdmin, effectiveTab]);

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <PageHeader
          icon={effectiveTab === "customers" ? "building" : "users"}
          title={effectiveTab === "customers" ? "Corporate Customers" : "Users"}
          subtitle={
            effectiveTab === "customers"
              ? `${customerCount} ${customerCount === 1 ? "customer" : "customers"}`
              : `${teamCount} ${teamCount === 1 ? "member" : "members"} in the directory`
          }
          actions={
            isAdmin &&
            (effectiveTab === "customers" ? (
              <Button onClick={openCreateCustomerModal} icon={<Icon name="userPlus" size={16} />}>
                New Customer
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => { setShowImportModal(true); setImportFile(null); setImportResults(null); }}
                  icon={<Icon name="upload" size={16} />}
                >
                  Import
                </Button>
                <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                  Add User
                </Button>
              </>
            ))
          }
        />

        {/* Sub-tabs (admins) + status filter */}
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
              {[
                { key: "team", label: "Team Members", icon: "users", count: teamCount },
                { key: "customers", label: "Corporate Customers", icon: "building", count: customerCount },
              ].map((t) => {
                const active = userTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setUserTab(t.key); setRoleFilter(""); }}
                    className={cn(
                      "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200",
                      active ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                    )}
                  >
                    <Icon name={t.icon} size={15} className={active ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                    {t.label}
                    <span className="text-[11px] tabular-nums text-[var(--fg-muted)]">{t.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* Active / Inactive / All */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            {["active", "inactive", "all"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all duration-200",
                  statusFilter === s ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Filter / search toolbar */}
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or email..."
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

            <div className="flex items-center gap-3 flex-wrap">
              {/* Role segmented filter — org directory only */}
              {effectiveTab === "team" && (
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
                {ROLE_FILTERS.map((r) => {
                  const active = roleFilter === r.value;
                  return (
                    <button
                      key={r.value || "all"}
                      onClick={() => setRoleFilter(r.value)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200",
                        active
                          ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
                          : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      <Icon
                        name={r.icon}
                        size={14}
                        className={active ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"}
                      />
                      {r.label}
                    </button>
                  );
                })}
              </div>
              )}

              <Badge tone="slate" size="md">
                {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Users table / states */}
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <EmptyState
              icon="users"
              title="No users found"
              description={
                hasFilters
                  ? "Try adjusting your search or role filter."
                  : "Get started by adding your first user."
              }
              action={
                isAdmin && !hasFilters ? (
                  <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                    Add User
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "120ms" }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                    <th className="px-4 py-3 text-left text-label">{effectiveTab === "customers" ? "Customer" : "User"}</th>
                    <th className="px-4 py-3 text-left text-label hidden md:table-cell">{effectiveTab === "customers" ? "Position" : "Title"}</th>
                    <th className="px-4 py-3 text-left text-label hidden lg:table-cell">Phone</th>
                    <th className="px-4 py-3 text-left text-label">{effectiveTab === "customers" ? "Company" : "Roles"}</th>
                    <th className="px-4 py-3 text-left text-label">Status</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-label">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {tableRows}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Generated Password Modal */}
      {generatedPassword && (
        <Modal
          open={true}
          onClose={closePasswordModal}
          title="User Created Successfully"
          subtitle="Save this password - it won't be shown again"
          actions={
            <>
              <Button variant="secondary" onClick={() => copyToClipboard(generatedPassword)} icon={<Icon name="copy" size={15} />}>
                Copy Password
              </Button>
              <Button onClick={closePasswordModal}>Done</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/10 px-4 py-3">
              <span className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <Icon name="checkCircle" size={16} />
              </span>
              <p className="text-sm text-[var(--fg-secondary)] leading-relaxed pt-0.5">
                The user has been created with the following auto-generated password.
              </p>
            </div>
            <div className={cn(
              "p-4 rounded-xl font-mono text-lg text-center tracking-wide",
              "bg-[var(--bg-base)]",
              "border-2 border-dashed border-[var(--accent)]/40",
              "text-[var(--accent)]"
            )}>
              {generatedPassword}
            </div>
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              Make sure to share this password securely with the user. They should change it after their first login.
            </p>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Users"
        subtitle="Bulk create users from an Excel spreadsheet"
        actions={
          !importResults ? (
            <>
              <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
              <Button onClick={handleImport} loading={importing} disabled={!importFile} icon={<Icon name="upload" size={15} />}>
                Import Users
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowImportModal(false)}>Done</Button>
          )
        }
      >
        {!importResults ? (
          <div className="space-y-5">
            {/* Download template */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] px-4 py-3.5">
              <div className="flex items-start gap-3 min-w-0">
                <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <Icon name="fileText" size={16} />
                </span>
                <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">
                  Download the template, fill in user data, then upload it here.
                </p>
              </div>
              <button
                onClick={downloadTemplate}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium shrink-0",
                  "text-[var(--accent)] border border-[var(--accent)]/30",
                  "hover:bg-[var(--accent)]/10 transition-colors"
                )}
              >
                <Icon name="download" size={15} />
                Template
              </button>
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
                Upload Excel File
              </label>
              <label className={cn(
                "flex flex-col items-center justify-center p-8 rounded-xl cursor-pointer transition-all",
                "border-2 border-dashed",
                importFile
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-default)] hover:border-[var(--border-hover)] bg-[var(--bg-base)]"
              )}>
                <Icon name={importFile ? "checkCircle" : "upload"} size={32} className={importFile ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                <p className="mt-2 text-sm font-medium text-[var(--fg-primary)]">
                  {importFile ? importFile.name : "Click to select file"}
                </p>
                <p className="text-xs text-[var(--fg-muted)] mt-1">
                  {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : ".xlsx files up to 5MB"}
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setImportFile(e.target.files[0] || null)}
                />
              </label>
            </div>

            {/* Instructions */}
            <div className="text-xs text-[var(--fg-muted)] space-y-1.5 leading-relaxed">
              <p>Columns: <strong className="text-[var(--fg-secondary)]">Full Name</strong> (required), <strong className="text-[var(--fg-secondary)]">Email</strong> (required), <strong className="text-[var(--fg-secondary)]">Title</strong>, <strong className="text-[var(--fg-secondary)]">Roles</strong></p>
              <p>Roles can be comma-separated: <code className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--fg-secondary)]">admin, agent</code></p>
              <p>Passwords are auto-generated and shown in the results.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Created", value: importResults.summary.created, valueCls: "text-emerald-500", iconCls: "bg-emerald-500/10 text-emerald-500", icon: "checkCircle" },
                { label: "Skipped", value: importResults.summary.skipped, valueCls: "text-amber-500", iconCls: "bg-amber-500/10 text-amber-500", icon: "alertCircle" },
                { label: "Failed", value: importResults.summary.failed, valueCls: "text-rose-500", iconCls: "bg-rose-500/10 text-rose-500", icon: "xCircle" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] p-3.5 text-center">
                  <span className={cn("inline-flex h-8 w-8 rounded-lg items-center justify-center mb-2", s.iconCls)}>
                    <Icon name={s.icon} size={16} />
                  </span>
                  <p className={cn("text-2xl font-semibold tabular-nums", s.valueCls)}>{s.value}</p>
                  <p className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Results table */}
            <div className="rounded-xl overflow-hidden border border-[var(--border-default)] max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-surface)]/80 sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-label">Row</th>
                    <th className="text-left px-3 py-2.5 text-label">Email</th>
                    <th className="text-left px-3 py-2.5 text-label">Status</th>
                    <th className="text-left px-3 py-2.5 text-label">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {importResults.results.map((r) => (
                    <tr key={r.row || r.email} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-3 py-2 text-[var(--fg-secondary)] tabular-nums">{r.row}</td>
                      <td className="px-3 py-2 text-[var(--fg-primary)]">{r.email}</td>
                      <td className="px-3 py-2">
                        <Badge tone={r.status === "created" ? "emerald" : r.status === "skipped" ? "amber" : "red"} size="sm">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.generatedPassword ? (
                          <button
                            onClick={() => { navigator.clipboard.writeText(r.generatedPassword); }}
                            className="font-mono text-xs text-[var(--accent)] hover:underline"
                            title="Click to copy"
                          >
                            {r.generatedPassword}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--fg-muted)]">{r.reason || "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal
        open={showModal && !generatedPassword}
        onClose={() => setShowModal(false)}
        title={customerMode ? (editingUser ? "Edit Corporate Customer" : "New Corporate Customer") : (editingUser ? "Edit User" : "Create User")}
        subtitle={customerMode ? "External customer — they can raise requests only." : (editingUser ? "Update user details and roles" : "Add a new member to the system")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingUser ? "Save Changes" : (customerMode ? "Create Customer" : "Create User")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <div className="space-y-4">
            <p className="text-label">Profile</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                placeholder="John Smith"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
              <Input
                label="Email"
                type="email"
                placeholder="john@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label={editingUser ? "New Password (leave blank to keep)" : "Password (leave blank to auto-generate)"}
                  type="password"
                  placeholder="Min 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                {!editingUser && (
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    <Icon name="refresh" size={13} />
                    Generate Random Password
                  </button>
                )}
              </div>
              <Input
                label="Title / Position"
                placeholder="Support Engineer"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            {customerMode && (
              <Input
                label="Company"
                placeholder="e.g. Pacific Trade Fiji"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
              />
            )}
            <Input
              label="Phone"
              placeholder="+1 555-0123"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          {/* Active Status Toggle (only shown when editing) */}
          {editingUser && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] px-4 py-3.5">
              <div className="min-w-0">
                <label className="block text-sm font-medium text-[var(--fg-primary)]">
                  Account Status
                </label>
                <p className="text-xs text-[var(--fg-secondary)] mt-0.5">
                  {formData.is_active ? "User can log in and access the system" : "User is deactivated and cannot log in"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0",
                  formData.is_active
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--bg-surface)] border border-[var(--border-default)]"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                    formData.is_active ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          )}

          {/* Org-only: assignments + roles (hidden for corporate customers) */}
          {!customerMode && (
          <>
          {/* Assignments */}
          <div className="space-y-4">
            <p className="text-label">Assignments</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Manager (Optional)"
                value={formData.manager_id}
                onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
              >
                <option value="">No manager</option>
                {users.filter(u => u.is_active && (!editingUser || u.id !== editingUser.id)).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </Select>

              <Select
                label="Team (Optional)"
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
          </div>

          {/* Roles */}
          <div className="space-y-3">
            <div>
              <p className="text-label">Roles</p>
              <p className="text-xs text-[var(--fg-secondary)] mt-1">Select one or more roles for this user</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["admin", "agent", "requester"].map((role) => {
                const selected = formData.roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                      selected
                        ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                        : cn(
                            "bg-[var(--bg-base)] text-[var(--fg-secondary)]",
                            "border border-[var(--border-default)]",
                            "hover:border-[var(--border-hover)] hover:text-[var(--fg-primary)]"
                          )
                    )}
                  >
                    <Icon
                      name={role === "admin" ? "shield" : role === "agent" ? "userCheck" : "user"}
                      size={16}
                      className={selected ? "text-white" : "text-[var(--fg-muted)]"}
                    />
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
          </>
          )}
        </form>
      </Modal>

      {confirmDialog}
    </>
  );
}
