/**
 * Departments Page
 * Linear/Modern Design System
 * Hierarchical Department Management
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea, Select } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

// Rotating tints for department cards
const deptTints = ["violet", "blue", "cyan", "teal", "emerald", "indigo", "purple", "pink"];

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Departments
            </h1>
            <p className="text-[var(--fg-secondary)] mt-1 text-sm">Organize teams and users by department hierarchy</p>
          </div>
          {isAdmin && (
            <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>Create Department</Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 max-w-sm">
          <Input
            icon="search"
            placeholder="Search departments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Badge tone="slate">{filtered.length} departments</Badge>
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
            <p className="text-sm font-medium text-[var(--fg-secondary)]">Loading departments...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
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
            <Icon name="building" size={36} className="text-[var(--fg-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
            No departments found
          </h3>
          <p className="text-sm text-[var(--fg-secondary)]">
            {searchQuery ? "Try a different search term" : "Create your first department to get started"}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((dept, idx) => {
            const tint = deptTints[idx % deptTints.length];
            const iconColors = {
              violet: "bg-violet-500/10 text-violet-400",
              blue: "bg-blue-500/10 text-blue-400",
              cyan: "bg-cyan-500/10 text-cyan-400",
              teal: "bg-teal-500/10 text-teal-400",
              emerald: "bg-emerald-500/10 text-emerald-400",
              indigo: "bg-indigo-500/10 text-indigo-400",
              purple: "bg-purple-500/10 text-purple-400",
              pink: "bg-pink-500/10 text-pink-400",
            };

            const parentDept = dept.parent_department_id ? deptMap[dept.parent_department_id] : null;
            const headUser = users.find(u => u.id === dept.head_user_id);

            return (
              <Card key={dept.id} tint={tint} spotlight hover className="group">
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center",
                    iconColors[tint]
                  )}>
                    <Icon name="building" size={24} />
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <button
                        onClick={() => openEditModal(dept)}
                        className={cn(
                          "p-2 rounded-lg transition-all duration-200",
                          "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                          "hover:bg-[var(--bg-base)]"
                        )}
                      >
                        <Icon name="pencil" size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(dept)}
                        title="Delete department"
                        className={cn(
                          "p-2 rounded-lg transition-all duration-200",
                          "text-[var(--fg-muted)] hover:text-rose-400",
                          "hover:bg-rose-500/10"
                        )}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-base font-semibold text-[var(--fg-primary)] mb-2 line-clamp-1">
                  {dept.name}
                </h3>
                <p className="text-sm text-[var(--fg-secondary)] line-clamp-2 mb-4 min-h-[40px]">
                  {dept.description || "No description provided"}
                </p>

                {/* Department Info */}
                <div className="space-y-2 mb-4">
                  {parentDept && (
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <Icon name="folder" size={12} />
                      <span>Parent: {parentDept.name}</span>
                    </div>
                  )}
                  {headUser && (
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                      <Icon name="user" size={12} />
                      <span>Head: {headUser.full_name || headUser.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <Icon name="teams" size={12} />
                    <span>{dept.team_count || 0} teams</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <Icon name="users" size={12} />
                    <span>{dept.user_count || 0} users</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-default)] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <Icon name="hash" size={12} />
                    <span className="font-mono">{dept.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                    <Icon name="calendar" size={12} />
                    <span>{new Date(dept.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
        <form onSubmit={handleSubmit} className="space-y-5">
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
          <Select
            label="Parent Department"
            value={formData.parent_department_id}
            onChange={(e) => setFormData({ ...formData, parent_department_id: e.target.value })}
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
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
