/**
 * Organizations Page
 * Linear/Modern Design System
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Organizations() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({ name: "", domain: "", industry: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => { loadOrganizations(); }, []);

  async function loadOrganizations() {
    try {
      const data = await api("/organizations");
      setItems(data.items || []);
    } catch (error) {
      toast.error(error.message || "Failed to load organizations");
    } finally { setLoading(false); }
  }

  function openCreateModal() {
    setEditingOrg(null);
    setFormData({ name: "", domain: "", industry: "", notes: "" });
    setShowModal(true);
  }

  function openEditModal(org) {
    setEditingOrg(org);
    setFormData({ name: org.name || "", domain: org.domain || "", industry: org.industry || "", notes: org.notes || "" });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingOrg) {
        await api(`/organizations/${editingOrg.id}`, { method: "PATCH", body: formData });
        toast.success("Organization updated");
      } else {
        await api("/organizations", { method: "POST", body: formData });
        toast.success("Organization created");
      }
      setShowModal(false);
      loadOrganizations();
    } catch (error) { toast.error(error.message); }
    finally { setSubmitting(false); }
  }

  function handleDelete(org) {
    confirm({
      title: "Delete organization?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{org.name}</strong> and
          unlink it from any tickets. This action cannot be undone.
        </>
      ),
      confirmText: "Delete Organization",
      onConfirm: async () => {
        try {
          await api(`/organizations/${org.id}`, { method: "DELETE" });
          toast.success("Organization deleted");
          loadOrganizations();
        } catch (error) { toast.error(error.message); }
      },
    });
  }

  const filtered = items.filter((org) =>
    (org.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.domain || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (org.industry || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Organizations
            </h1>
            <p className="text-[var(--fg-secondary)] mt-1 text-sm">Manage customer accounts and companies</p>
          </div>
          {isAdmin && (
            <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>Add Organization</Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1 max-w-sm">
          <Input icon="search" placeholder="Search organizations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Badge tone="slate">{filtered.length} organizations</Badge>
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
            <p className="text-sm font-medium text-[var(--fg-secondary)]">Loading organizations...</p>
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
            <Icon name="organization" size={36} className="text-[var(--fg-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
            No organizations found
          </h3>
          <p className="text-sm text-[var(--fg-secondary)]">
            {searchQuery ? "Try a different search term" : "Add your first organization to get started"}
          </p>
        </div>
      ) : (
        <Card tint="cyan" padding={false} hover={false}>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Organization</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Domain</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Industry</th>
                <th className="text-left px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Created</th>
                {isAdmin && (
                  <th className="text-right px-6 py-4 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {filtered.map((org) => (
                <tr key={org.id} className="hover:bg-[var(--bg-base)] transition-all duration-200 group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0",
                        "bg-cyan-500/10 text-cyan-400"
                      )}>
                        {(org.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                          {org.name}
                        </p>
                        {org.notes && (
                          <p className="text-xs text-[var(--fg-muted)] truncate max-w-[250px]">{org.notes}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {org.domain ? (
                      <div className="flex items-center gap-2">
                        <Icon name="link" size={14} className="text-[var(--fg-muted)]" />
                        <span className="text-sm text-[var(--fg-secondary)] font-mono">{org.domain}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--fg-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {org.industry ? (
                      <Badge tone="blue">{org.industry}</Badge>
                    ) : (
                      <span className="text-sm text-[var(--fg-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[var(--fg-secondary)]">
                      {new Date(org.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(org)}
                          className={cn(
                            "inline-flex items-center justify-center p-2.5 rounded-lg transition-all duration-200",
                            "text-[var(--fg-muted)] hover:text-[var(--accent)]",
                            "hover:bg-[var(--bg-base)]"
                          )}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(org)}
                          title="Delete organization"
                          className={cn(
                            "inline-flex items-center justify-center p-2.5 rounded-lg transition-all duration-200",
                            "text-[var(--fg-muted)] hover:text-rose-400",
                            "hover:bg-rose-500/10"
                          )}
                        >
                          <Icon name="trash" size={14} />
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

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingOrg ? "Edit Organization" : "Create Organization"}
        subtitle={editingOrg ? "Update organization details" : "Add a new customer organization"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {editingOrg ? "Save Changes" : "Create Organization"}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Organization Name"
            placeholder="Acme Corporation"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            icon="organization"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Domain"
              placeholder="acme.com"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              icon="link"
            />
            <Input
              label="Industry"
              placeholder="Technology"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              icon="tag"
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Additional notes about this organization..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={4}
          />
        </form>
      </Modal>

      {confirmDialog}
    </div>
  );
}
