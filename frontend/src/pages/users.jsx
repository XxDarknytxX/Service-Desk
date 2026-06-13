/**
 * Users Page
 * Linear/Modern Design System
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Select } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    title: "",
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
    setFormData({
      full_name: "",
      email: "",
      password: "",
      title: "",
      phone: "",
      roles: ["requester"],
      manager_id: "",
      team_id: "",
      is_active: true,
    });
    setGeneratedPassword(null);
    setShowModal(true);
  }

  async function openEditModal(u) {
    setEditingUser(u);

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
    setSubmitting(true);
    try {
      const payload = { ...formData };
      if (editingUser && !payload.password) delete payload.password;

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

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || (u.roles || []).includes(roleFilter);
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Users
            </h1>
            <p className="text-[var(--fg-secondary)] mt-1 text-sm">Manage team members and their roles</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => { setShowImportModal(true); setImportFile(null); setImportResults(null); }} icon={<Icon name="upload" size={16} />}>
                Import
              </Button>
              <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
                Add User
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 max-w-sm">
          <Input
            icon="search"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={cn(
          "flex items-center gap-1 p-1 rounded-lg",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]"
        )}>
          {["", "admin", "agent", "requester"].map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded-md transition-all duration-200",
                roleFilter === role
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
              )}
            >
              {role || "All"}
            </button>
          ))}
        </div>
        <Badge tone="slate">{filteredUsers.length} users</Badge>
      </div>

      {/* Users Table */}
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
            <p className="text-sm font-medium text-[var(--fg-secondary)]">Loading users...</p>
          </div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className={cn(
          "text-center py-20 rounded-xl",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]"
        )}>
          <div className={cn(
            "flex items-center justify-center w-20 h-20 mx-auto mb-5 rounded-xl",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}>
            <Icon name="users" size={36} className="text-[var(--fg-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
            No users found
          </h3>
          <p className="text-sm text-[var(--fg-secondary)]">
            {searchQuery || roleFilter ? "Try adjusting your filters" : "Get started by adding your first user"}
          </p>
        </div>
      ) : (
        <Card tint="indigo" padding={false} hover={false}>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Title</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Roles</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Status</th>
                {isAdmin && (
                  <th className="text-right px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--bg-base)] transition-all duration-200 group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0",
                        "bg-[var(--accent)]/10 text-[var(--accent)]"
                      )}>
                        {(u.full_name || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                          {u.full_name || "Unnamed"}
                        </p>
                        <p className="text-xs text-[var(--fg-muted)] truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--fg-secondary)]">{u.title || "-"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 flex-wrap">
                      {(u.roles || []).map((role) => (
                        <Badge key={role} tone={roleBadgeColors[role] || "slate"}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={u.is_active ? "green" : "slate"}>
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className={cn(
                            "inline-flex items-center justify-center p-2.5 rounded-lg transition-all duration-200",
                            "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                            "hover:bg-[var(--bg-base)]"
                          )}
                          title="Edit user"
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.full_name || u.email)}
                          className={cn(
                            "inline-flex items-center justify-center p-2.5 rounded-lg transition-all duration-200",
                            "text-[var(--fg-muted)] hover:text-rose-400",
                            "hover:bg-rose-500/10"
                          )}
                          title="Delete user"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {/* Generated Password Modal */}
      {generatedPassword && (
        <Modal
          open={true}
          onClose={closePasswordModal}
          title="User Created Successfully"
          subtitle="Save this password - it won't be shown again"
          actions={
            <>
              <Button variant="secondary" onClick={() => copyToClipboard(generatedPassword)}>
                Copy Password
              </Button>
              <Button onClick={closePasswordModal}>Done</Button>
            </>
          }
        >
          <div className={cn(
            "p-6 rounded-lg",
            "bg-[var(--bg-base)]",
            "border border-[var(--border-default)]"
          )}>
            <p className="text-sm text-[var(--fg-secondary)] mb-3">
              The user has been created with the following auto-generated password:
            </p>
            <div className={cn(
              "p-4 rounded-lg font-mono text-lg text-center",
              "bg-[var(--bg-elevated)]",
              "border-2 border-dashed border-[var(--accent)]",
              "text-[var(--accent)]"
            )}>
              {generatedPassword}
            </div>
            <p className="text-xs text-[var(--fg-muted)] mt-3">
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
              <Button onClick={handleImport} loading={importing} disabled={!importFile}>
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
            <div className={cn(
              "p-4 rounded-lg",
              "bg-[var(--bg-base)]",
              "border border-[var(--border-default)]"
            )}>
              <p className="text-sm text-[var(--fg-secondary)] mb-3">
                Download the template, fill in user data, then upload it here.
              </p>
              <button
                onClick={downloadTemplate}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  "text-[var(--accent)] border border-[var(--accent)]/30",
                  "hover:bg-[var(--accent)]/10 transition-colors"
                )}
              >
                <Icon name="download" size={16} />
                Download Template
              </button>
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
                Upload Excel File
              </label>
              <label className={cn(
                "flex flex-col items-center justify-center p-8 rounded-lg cursor-pointer transition-all",
                "border-2 border-dashed",
                importFile
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border-default)] hover:border-[var(--border-hover)] bg-[var(--bg-base)]"
              )}>
                <Icon name={importFile ? "check-circle" : "upload"} size={32} className={importFile ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
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
            <div className="text-xs text-[var(--fg-muted)] space-y-1">
              <p>Columns: <strong>Full Name</strong> (required), <strong>Email</strong> (required), <strong>Title</strong>, <strong>Roles</strong></p>
              <p>Roles can be comma-separated: <code className="px-1 py-0.5 rounded bg-[var(--bg-base)]">admin, agent</code></p>
              <p>Passwords are auto-generated and shown in the results.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Created", value: importResults.summary.created, color: "text-emerald-400" },
                { label: "Skipped", value: importResults.summary.skipped, color: "text-amber-400" },
                { label: "Failed", value: importResults.summary.failed, color: "text-rose-400" },
              ].map((s) => (
                <div key={s.label} className={cn(
                  "text-center p-3 rounded-lg",
                  "bg-[var(--bg-base)] border border-[var(--border-default)]"
                )}>
                  <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Results table */}
            <div className={cn(
              "rounded-lg overflow-hidden border border-[var(--border-default)]",
              "max-h-72 overflow-y-auto"
            )}>
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-base)] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-medium text-[var(--fg-muted)] uppercase">Row</th>
                    <th className="text-left px-3 py-2 text-[11px] font-medium text-[var(--fg-muted)] uppercase">Email</th>
                    <th className="text-left px-3 py-2 text-[11px] font-medium text-[var(--fg-muted)] uppercase">Status</th>
                    <th className="text-left px-3 py-2 text-[11px] font-medium text-[var(--fg-muted)] uppercase">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {importResults.results.map((r) => (
                    <tr key={r.row || r.email} className="hover:bg-[var(--bg-base)]">
                      <td className="px-3 py-2 text-[var(--fg-secondary)]">{r.row}</td>
                      <td className="px-3 py-2 text-[var(--fg-primary)]">{r.email}</td>
                      <td className="px-3 py-2">
                        <Badge tone={r.status === "created" ? "green" : r.status === "skipped" ? "amber" : "red"}>
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
        title={editingUser ? "Edit User" : "Create User"}
        subtitle={editingUser ? "Update user details and roles" : "Add a new member to the system"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingUser ? "Save Changes" : "Create User"}
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
              label="Email"
              type="email"
              placeholder="john@company.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
                  className={cn(
                    "mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
                  )}
                >
                  Generate Random Password
                </button>
              )}
            </div>
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

          {/* Active Status Toggle (only shown when editing) */}
          {editingUser && (
            <div className="flex items-center justify-between">
              <div>
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
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
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

          {/* Manager and Team Selection */}
          <div className="grid grid-cols-2 gap-4">
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
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
