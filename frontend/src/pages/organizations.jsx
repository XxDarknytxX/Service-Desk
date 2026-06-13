/**
 * Organizations Page — Vodafone Service Desk
 * Premium directory of customer accounts: branded header, search toolbar,
 * elevated table with avatar tiles, skeleton loading, empty state.
 * All data flows (load / create / edit / delete) preserved.
 */

import { useEffect, useState } from "react";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonTable } from "../components/ui/Skeleton";
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
    <div className="space-y-5">
      <PageHeader
        icon="building"
        title="Organizations"
        subtitle="Manage customer accounts and companies"
        actions={
          isAdmin && (
            <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>
              Add Organization
            </Button>
          )
        }
      />

      {/* Search toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
        <div className="w-full sm:max-w-sm">
          <Input icon="search" placeholder="Search organizations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Badge tone="slate">{filtered.length} {filtered.length === 1 ? "organization" : "organizations"}</Badge>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="building"
            title="No organizations found"
            description={searchQuery ? "Try a different search term." : "Add your first organization to get started."}
            action={
              isAdmin && !searchQuery && (
                <Button onClick={openCreateModal} icon={<Icon name="plus" size={16} />}>Add Organization</Button>
              )
            }
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                  <th className="text-left px-5 py-3 text-label">Organization</th>
                  <th className="text-left px-5 py-3 text-label">Domain</th>
                  <th className="text-left px-5 py-3 text-label">Industry</th>
                  <th className="text-left px-5 py-3 text-label">Created</th>
                  {isAdmin && <th className="text-right px-5 py-3 text-label">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {filtered.map((org) => (
                  <tr key={org.id} className="hover:bg-[var(--bg-surface)] transition-colors duration-150 group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3.5">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 bg-cyan-500/10 text-cyan-500 border border-cyan-500/15">
                          {(org.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--fg-primary)] truncate">{org.name}</p>
                          {org.notes && (
                            <p className="text-xs text-[var(--fg-muted)] truncate max-w-[250px]">{org.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {org.domain ? (
                        <div className="flex items-center gap-2">
                          <Icon name="link" size={14} className="text-[var(--fg-muted)]" />
                          <span className="text-sm text-[var(--fg-secondary)] font-mono">{org.domain}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--fg-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {org.industry ? <Badge tone="blue">{org.industry}</Badge> : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-[var(--fg-secondary)]">{new Date(org.created_at).toLocaleDateString()}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(org)}
                            title="Edit organization"
                            className="inline-flex items-center justify-center p-2 rounded-lg transition-colors text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface-hover)]"
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(org)}
                            title="Delete organization"
                            className="inline-flex items-center justify-center p-2 rounded-lg transition-colors text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10"
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
        </div>
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
            icon="building"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
