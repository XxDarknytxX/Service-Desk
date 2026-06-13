/**
 * Approvals Page
 * View and manage pending approvals assigned to current user
 * Includes approval delegation management
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { approvalsApi, api } from "../services/api";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import Input, { Textarea } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const cardTints = ["violet", "blue", "cyan", "teal", "indigo", "emerald"];

export default function Approvals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState("pending");
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [comments, setComments] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delegation state
  const [delegations, setDelegations] = useState([]);
  const [delegationsLoading, setDelegationsLoading] = useState(false);
  const [showNewDelegationModal, setShowNewDelegationModal] = useState(false);
  const [showDelegateApprovalModal, setShowDelegateApprovalModal] = useState(false);
  const [delegateApprovalTarget, setDelegateApprovalTarget] = useState(null);

  // User picker state (shared between modals)
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedDelegateId, setSelectedDelegateId] = useState(null);
  const [delegationType, setDelegationType] = useState("temporary");
  const [delegationStartDate, setDelegationStartDate] = useState("");
  const [delegationEndDate, setDelegationEndDate] = useState("");
  const [delegationReason, setDelegationReason] = useState("");
  const [showDelegationBlockedModal, setShowDelegationBlockedModal] = useState(false);
  const [delegationBlockedMessage, setDelegationBlockedMessage] = useState("");

  useEffect(() => {
    loadApprovals();
  }, []);

  useEffect(() => {
    if (activeTab === "delegations") {
      loadDelegations();
    }
  }, [activeTab]);

  async function loadApprovals() {
    try {
      setLoading(true);
      const data = await approvalsApi.getPendingApprovals();
      setApprovals(data.approvals || []);
    } catch (error) {
      console.error("Failed to load approvals:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadDelegations() {
    try {
      setDelegationsLoading(true);
      const data = await approvalsApi.getDelegations();
      setDelegations(data.delegations || []);
    } catch (error) {
      console.error("Failed to load delegations:", error);
    } finally {
      setDelegationsLoading(false);
    }
  }

  async function loadUsers() {
    if (allUsers.length > 0) return;
    try {
      const data = await api("/users");
      setAllUsers(data.items || []);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return [];
    const q = userSearch.toLowerCase();
    return allUsers
      .filter(u => u.id !== user?.id && (
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [userSearch, allUsers, user]);

  function openApproveModal(approval) {
    setSelectedApproval(approval);
    setComments("");
    setShowApproveModal(true);
  }

  function openRejectModal(approval) {
    setSelectedApproval(approval);
    setRejectReason("");
    setComments("");
    setShowRejectModal(true);
  }

  function openDelegateApprovalModal(approval) {
    setDelegateApprovalTarget(approval);
    setSelectedDelegateId(null);
    setUserSearch("");
    setDelegationReason("");
    loadUsers();
    setShowDelegateApprovalModal(true);
  }

  function openNewDelegationModal() {
    setSelectedDelegateId(null);
    setUserSearch("");
    setDelegationType("temporary");
    setDelegationStartDate("");
    setDelegationEndDate("");
    setDelegationReason("");
    loadUsers();
    setShowNewDelegationModal(true);
  }

  async function handleApprove() {
    if (!selectedApproval) return;
    setSubmitting(true);
    try {
      await approvalsApi.approve(selectedApproval.id, comments);
      setShowApproveModal(false);
      toast.success("Approval submitted successfully");
      loadApprovals();
    } catch (error) {
      toast.error(error.message || "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!selectedApproval || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setSubmitting(true);
    try {
      await approvalsApi.reject(selectedApproval.id, rejectReason, comments);
      setShowRejectModal(false);
      toast.success("Ticket rejected");
      loadApprovals();
    } catch (error) {
      toast.error(error.message || "Failed to reject");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateDelegation() {
    if (!selectedDelegateId) {
      toast.error("Please select a delegate user");
      return;
    }
    if (delegationType === "temporary" && (!delegationStartDate || !delegationEndDate)) {
      toast.error("Start and end dates are required for temporary delegations");
      return;
    }
    if (delegationType === "temporary" && new Date(delegationEndDate) <= new Date(delegationStartDate)) {
      toast.error("End date must be after the start date");
      return;
    }
    if (delegationType === "temporary" && new Date(delegationEndDate) <= new Date()) {
      toast.error("End date must be in the future");
      return;
    }
    setSubmitting(true);
    try {
      await approvalsApi.createDelegation({
        delegate_id: selectedDelegateId,
        delegation_type: delegationType,
        start_date: delegationType === "temporary" ? delegationStartDate : null,
        end_date: delegationType === "temporary" ? delegationEndDate : null,
        reason: delegationReason || null,
      });
      setShowNewDelegationModal(false);
      toast.success("Delegation created successfully");
      loadDelegations();
    } catch (error) {
      toast.error(error.message || "Failed to create delegation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelegateApproval() {
    if (!delegateApprovalTarget || !selectedDelegateId) {
      toast.error("Please select a delegate user");
      return;
    }
    setSubmitting(true);
    try {
      await approvalsApi.delegateApproval(delegateApprovalTarget.id, {
        delegate_id: selectedDelegateId,
        reason: delegationReason || null,
      });
      setShowDelegateApprovalModal(false);
      toast.success("Approval delegated successfully");
      loadApprovals();
    } catch (error) {
      console.error("Delegate approval error:", error);
      setShowDelegateApprovalModal(false);
      if (error.code === "DELEGATION_NOT_ALLOWED") {
        setDelegationBlockedMessage(
          error.detail || "This approval step does not allow delegation. The template configuration restricts delegation for this level."
        );
        setShowDelegationBlockedModal(true);
      } else {
        toast.error(error.message || "Failed to delegate approval");
        loadApprovals();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleRevokeDelegation(d) {
    confirm({
      title: "Revoke delegation?",
      message: (
        <>
          This ends the delegation to{" "}
          <strong className="text-[var(--fg-primary)]">
            {d.delegate_name || "the delegate"}
          </strong>
          . Pending approvals will return to you.
        </>
      ),
      confirmText: "Revoke",
      onConfirm: async () => {
        try {
          await approvalsApi.revokeDelegation(d.id);
          toast.success("Delegation revoked");
          loadDelegations();
        } catch (error) {
          toast.error(error.message || "Failed to revoke delegation");
        }
      },
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHrs < 1) return "Just now";
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  }

  function getPriorityBadge(priority) {
    const tones = {
      low: "slate",
      normal: "blue",
      high: "amber",
      urgent: "rose",
    };
    return <Badge tone={tones[priority] || "slate"}>{priority}</Badge>;
  }

  // User picker - rendered inline (NOT as a sub-component) to prevent focus loss on re-render
  const selectedDelegateUser = allUsers.find(u => u.id === selectedDelegateId);
  const userPickerJSX = (
    <div className="w-full">
      <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
        Select User
      </label>
      {selectedDelegateUser ? (
        <div className={cn(
          "flex items-center justify-between gap-2 p-3 rounded-lg",
          "bg-[var(--bg-base)] border border-[var(--border-default)]"
        )}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-semibold text-[var(--accent)]">
              {(selectedDelegateUser.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--fg-primary)]">{selectedDelegateUser.full_name}</p>
              <p className="text-xs text-[var(--fg-muted)]">{selectedDelegateUser.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setSelectedDelegateId(null); setUserSearch(""); }}
            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className={cn(
              "w-full pl-9 pr-3 py-2.5 rounded-lg text-sm",
              "bg-[var(--bg-base)] text-[var(--fg-primary)]",
              "border border-[var(--border-default)]",
              "placeholder:text-[var(--fg-muted)]",
              "focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30",
              "transition-colors"
            )}
          />
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
          {filteredUsers.length > 0 && (
            <div className={cn(
              "absolute z-50 w-full mt-1 rounded-lg overflow-hidden",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
              "shadow-lg max-h-60 overflow-y-auto"
            )}>
              {filteredUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-left",
                    "hover:bg-[var(--bg-base)] transition-colors"
                  )}
                  onClick={() => {
                    setSelectedDelegateId(u.id);
                    setUserSearch("");
                  }}
                >
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-semibold text-[var(--accent)]">
                    {(u.full_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-[var(--fg-primary)]">{u.full_name}</p>
                    <p className="text-xs text-[var(--fg-muted)]">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const tabs = [
    { key: "pending", label: "Pending Approvals", count: approvals.length },
    { key: "delegations", label: "My Delegations" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
              Approvals
            </h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">
              Manage approvals and delegations
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "delegations" && (
              <Button onClick={openNewDelegationModal} icon={<Icon name="plus" size={16} />}>
                New Delegation
              </Button>
            )}
            <Button variant="secondary" onClick={() => { loadApprovals(); if (activeTab === "delegations") loadDelegations(); }} icon={<Icon name="refreshCw" size={16} />}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-base)]"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "ml-2 px-1.5 py-0.5 rounded text-xs",
                activeTab === tab.key ? "bg-white/20" : "bg-[var(--bg-base)]"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ====== PENDING APPROVALS TAB ====== */}
      {activeTab === "pending" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={cn(
              "rounded-xl p-5",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]"
            )}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Icon name="clock" size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--fg-primary)]">{approvals.length}</p>
                  <p className="text-xs text-[var(--fg-muted)]">Pending Approvals</p>
                </div>
              </div>
            </div>
          </div>

          {/* Approvals List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
                <p className="text-sm text-[var(--fg-secondary)]">Loading approvals...</p>
              </div>
            </div>
          ) : approvals.length === 0 ? (
            <div className={cn(
              "text-center py-20 rounded-xl",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]",
              "shadow-[var(--shadow-card)]"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
                "bg-emerald-500/10 border border-emerald-500/20"
              )}>
                <Icon name="check" size={32} className="text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">All caught up!</p>
              <p className="text-sm text-[var(--fg-secondary)]">
                You have no pending approvals at the moment
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((approval, idx) => (
                <Card
                  key={approval.id}
                  tint={cardTints[idx % cardTints.length]}
                  spotlight
                  hover
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Ticket Info */}
                      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                        <span className={cn(
                          "text-xs font-mono font-medium px-2 py-1 rounded",
                          "bg-[var(--bg-base)] text-[var(--fg-muted)]"
                        )}>
                          {approval.ticket_number}
                        </span>
                        {getPriorityBadge(approval.priority_key)}
                        <Badge tone="violet">Level {approval.approval_level}/{approval.total_levels}</Badge>
                        {approval.rule_name && (
                          <Badge tone="slate">{approval.rule_name}</Badge>
                        )}
                        {approval.is_delegated === 1 && (
                          <Badge tone="cyan">Delegated from {approval.delegator_name}</Badge>
                        )}
                      </div>

                      <h3
                        className="text-base font-semibold text-[var(--fg-primary)] mb-2 cursor-pointer hover:text-[var(--accent)] transition-colors"
                        onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                      >
                        {approval.subject}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-[var(--fg-muted)]">
                        <span className="flex items-center gap-1.5">
                          <Icon name="user" size={12} />
                          Requested by {approval.requester_name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Icon name="clock" size={12} />
                          {formatDate(approval.ticket_created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                      >
                        View
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDelegateApprovalModal(approval)}
                        title="Delegate this approval"
                      >
                        <Icon name="share" size={14} className="mr-1.5" />
                        Delegate
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openApproveModal(approval)}
                        className="bg-emerald-600 hover:bg-emerald-500"
                      >
                        <Icon name="check" size={14} className="mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openRejectModal(approval)}
                        className="text-rose-400 hover:bg-rose-500/10"
                      >
                        <Icon name="close" size={14} className="mr-1.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== DELEGATIONS TAB ====== */}
      {activeTab === "delegations" && (
        <>
          {delegationsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
                <p className="text-sm text-[var(--fg-secondary)]">Loading delegations...</p>
              </div>
            </div>
          ) : delegations.length === 0 ? (
            <div className={cn(
              "text-center py-20 rounded-xl",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]",
              "shadow-[var(--shadow-card)]"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
                "bg-blue-500/10 border border-blue-500/20"
              )}>
                <Icon name="share" size={32} className="text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No delegations yet</p>
              <p className="text-sm text-[var(--fg-secondary)] mb-4">
                Create a delegation to let someone else handle your approvals
              </p>
              <Button onClick={openNewDelegationModal} icon={<Icon name="plus" size={16} />}>
                New Delegation
              </Button>
            </div>
          ) : (
            <div className={cn(
              "rounded-xl overflow-hidden overflow-x-auto",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]"
            )}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Direction</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Date Range</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {delegations.map(d => {
                    const isGiven = d.delegator_id === user?.id;
                    return (
                      <tr key={d.id} className="hover:bg-[var(--bg-base)] transition-colors">
                        <td className="px-4 py-3">
                          <Badge tone={isGiven ? "amber" : "cyan"}>
                            {isGiven ? "Given" : "Received"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-[var(--fg-primary)]">
                              {isGiven ? d.delegate_name : d.delegator_name}
                            </p>
                            <p className="text-xs text-[var(--fg-muted)]">
                              {isGiven ? d.delegate_email : d.delegator_email}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={d.delegation_type === "permanent" ? "violet" : d.delegation_type === "temporary" ? "blue" : "teal"}>
                            {d.delegation_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--fg-secondary)]">
                          {d.delegation_type === "temporary"
                            ? `${formatDateShort(d.start_date)} - ${formatDateShort(d.end_date)}`
                            : d.delegation_type === "specific_ticket"
                              ? `Ticket #${d.ticket_id}`
                              : "Always"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={d.is_active ? "emerald" : "slate"}>
                            {d.is_active ? "Active" : "Revoked"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--fg-secondary)] max-w-[200px] truncate">
                          {d.reason || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isGiven && d.is_active ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRevokeDelegation(d)}
                              className="text-rose-400 hover:bg-rose-500/10"
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Approve Modal */}
      <Modal
        open={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title="Approve Request"
        subtitle={selectedApproval ? `Ticket: ${selectedApproval.ticket_number}` : ""}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowApproveModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              loading={submitting}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              <Icon name="check" size={14} className="mr-1.5" />
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg p-4",
            "bg-emerald-500/10 border border-emerald-500/20"
          )}>
            <div className="flex items-start gap-3">
              <Icon name="checkCircle" size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">
                  You are about to approve this request
                </p>
                <p className="text-xs text-[var(--fg-secondary)] mt-1">
                  {selectedApproval?.approval_level < selectedApproval?.total_levels
                    ? "The request will proceed to the next approval level."
                    : "This is the final approval. The ticket will be marked as approved."}
                </p>
              </div>
            </div>
          </div>

          <Textarea
            label="Comments (optional)"
            placeholder="Add any comments for this approval..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Request"
        subtitle={selectedApproval ? `Ticket: ${selectedApproval.ticket_number}` : ""}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              loading={submitting}
              className="bg-rose-600 hover:bg-rose-500"
            >
              <Icon name="close" size={14} className="mr-1.5" />
              Reject
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg p-4",
            "bg-rose-500/10 border border-rose-500/20"
          )}>
            <div className="flex items-start gap-3">
              <Icon name="flag" size={20} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">
                  You are about to reject this request
                </p>
                <p className="text-xs text-[var(--fg-secondary)] mt-1">
                  The requester will be notified and the ticket will be marked as rejected.
                </p>
              </div>
            </div>
          </div>

          <Textarea
            label="Rejection Reason"
            placeholder="Please explain why this request is being rejected..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            error={!rejectReason.trim() ? "" : undefined}
            required
          />

          <Textarea
            label="Additional Comments (optional)"
            placeholder="Any additional comments..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={2}
          />
        </div>
      </Modal>

      {/* New Delegation Modal */}
      <Modal
        open={showNewDelegationModal}
        onClose={() => setShowNewDelegationModal(false)}
        title="Create Delegation"
        subtitle="Allow another user to handle your approvals"
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowNewDelegationModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDelegation}
              loading={submitting}
            >
              <Icon name="share" size={14} className="mr-1.5" />
              Create Delegation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {userPickerJSX}

          <div className="w-full">
            <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
              Delegation Type
            </label>
            <div className="flex gap-2">
              {[
                { key: "permanent", label: "Permanent" },
                { key: "temporary", label: "Temporary" },
                { key: "specific_ticket", label: "Per-Ticket" },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDelegationType(opt.key)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                    delegationType === opt.key
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg-base)] text-[var(--fg-secondary)] border-[var(--border-default)] hover:border-[var(--fg-muted)]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {delegationType === "temporary" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Start Date</label>
                <input
                  type="datetime-local"
                  value={delegationStartDate}
                  onChange={e => setDelegationStartDate(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg text-sm",
                    "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                    "border border-[var(--border-default)]",
                    "focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">End Date</label>
                <input
                  type="datetime-local"
                  value={delegationEndDate}
                  onChange={e => setDelegationEndDate(e.target.value)}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg text-sm",
                    "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                    "border border-[var(--border-default)]",
                    "focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
                  )}
                />
              </div>
            </div>
          )}

          <Textarea
            label="Reason (optional)"
            placeholder="Why are you delegating? e.g., Out of office, on vacation..."
            value={delegationReason}
            onChange={(e) => setDelegationReason(e.target.value)}
            rows={2}
          />
        </div>
      </Modal>

      {/* Delegate Specific Approval Modal */}
      <Modal
        open={showDelegateApprovalModal}
        onClose={() => setShowDelegateApprovalModal(false)}
        title="Delegate Approval"
        subtitle={delegateApprovalTarget ? `Ticket: ${delegateApprovalTarget.ticket_number}` : ""}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowDelegateApprovalModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelegateApproval}
              loading={submitting}
            >
              <Icon name="share" size={14} className="mr-1.5" />
              Delegate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg p-4",
            "bg-blue-500/10 border border-blue-500/20"
          )}>
            <div className="flex items-start gap-3">
              <Icon name="share" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">
                  Delegate this approval to another user
                </p>
                <p className="text-xs text-[var(--fg-secondary)] mt-1">
                  The selected user will be able to approve or reject this request on your behalf.
                </p>
              </div>
            </div>
          </div>

          {userPickerJSX}

          <Textarea
            label="Reason (optional)"
            placeholder="Why are you delegating this approval?"
            value={delegationReason}
            onChange={(e) => setDelegationReason(e.target.value)}
            rows={2}
          />
        </div>
      </Modal>

      {/* Delegation Blocked Warning Modal */}
      <Modal
        open={showDelegationBlockedModal}
        onClose={() => setShowDelegationBlockedModal(false)}
        title="Delegation Not Allowed"
        size="sm"
        actions={
          <Button onClick={() => setShowDelegationBlockedModal(false)}>
            Understood
          </Button>
        }
      >
        <div className="space-y-4">
          <div className={cn(
            "rounded-lg p-4",
            "bg-amber-500/10 border border-amber-500/20"
          )}>
            <div className="flex items-start gap-3">
              <Icon name="flag" size={24} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">
                  Delegation is restricted for this approval
                </p>
                <p className="text-sm text-[var(--fg-secondary)]">
                  {delegationBlockedMessage}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--fg-muted)]">
            If you believe this is incorrect, please contact your administrator to update the template approval flow settings.
          </p>
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
