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
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import EmptyState from "../components/ui/EmptyState";
import Skeleton, { SkeletonTable } from "../components/ui/Skeleton";
import Modal from "../components/ui/Modal";
import { Textarea } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Per-priority accent for the request-card rail (full static classes — no dynamic Tailwind)
const PRIORITY_RAIL = {
  low: "bg-slate-500",
  normal: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
};

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
    { value: "pending", label: "Pending Approvals", icon: "clock", count: approvals.length },
    { value: "delegations", label: "My Delegations", icon: "share" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="checkCircle"
        title="Approvals"
        subtitle={
          activeTab === "pending"
            ? `${approvals.length} ${approvals.length === 1 ? "request" : "requests"} awaiting your decision`
            : "Manage who can act on your approvals"
        }
        actions={
          <>
            <button
              onClick={() => { loadApprovals(); if (activeTab === "delegations") loadDelegations(); }}
              title="Refresh"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
            >
              <Icon
                name="refresh"
                size={16}
                className={cn((loading || delegationsLoading) && "animate-spin")}
              />
            </button>
            {activeTab === "delegations" && (
              <Button onClick={openNewDelegationModal} icon={<Icon name="plus" size={16} />}>
                New Delegation
              </Button>
            )}
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        variant="pills"
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* ====== PENDING APPROVALS TAB ====== */}
      {activeTab === "pending" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={cn(
                "group relative overflow-hidden rounded-2xl p-5",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                "animate-kpi-rise"
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-label">Pending Approvals</span>
                <span className="h-9 w-9 rounded-xl flex items-center justify-center border bg-amber-500/10 text-amber-500 border-amber-500/15 transition-transform duration-200 group-hover:scale-110">
                  <Icon name="clock" size={16} />
                </span>
              </div>
              <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
                {approvals.length}
              </p>
              <p className="mt-3 text-[11px] text-[var(--fg-muted)]">
                Requests awaiting your decision
              </p>
            </div>
          </div>

          {/* Approvals List */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="h-5 w-24" rounded="rounded-md" />
                        <Skeleton className="h-5 w-16" rounded="rounded-full" />
                        <Skeleton className="h-5 w-20" rounded="rounded-full" />
                      </div>
                      <Skeleton className="h-4 w-2/3" rounded="rounded-md" />
                      <Skeleton className="h-3 w-1/3" rounded="rounded-md" />
                    </div>
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <Skeleton className="h-9 w-16" rounded="rounded-lg" />
                      <Skeleton className="h-9 w-24" rounded="rounded-lg" />
                      <Skeleton className="h-9 w-24" rounded="rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <EmptyState
                icon="checkCircle"
                tone="emerald"
                title="All caught up!"
                description="You have no pending approvals at the moment."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((approval, idx) => (
                <div
                  key={approval.id}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl",
                    "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                    "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                    "animate-fade-up"
                  )}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Priority accent rail */}
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      PRIORITY_RAIL[approval.priority_key] || PRIORITY_RAIL.low
                    )}
                  />

                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 p-5 pl-6">
                    <div className="flex-1 min-w-0">
                      {/* Ticket Info */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                          className="text-xs font-mono font-semibold text-[var(--accent)] hover:underline"
                        >
                          {approval.ticket_number}
                        </button>
                        {getPriorityBadge(approval.priority_key)}
                        <Badge tone="violet" size="sm">Level {approval.approval_level}/{approval.total_levels}</Badge>
                        {approval.rule_name && (
                          <Badge tone="slate" size="sm">{approval.rule_name}</Badge>
                        )}
                        {approval.is_delegated === 1 && (
                          <Badge tone="cyan" size="sm" icon={<Icon name="share" size={11} />}>
                            Delegated from {approval.delegator_name}
                          </Badge>
                        )}
                      </div>

                      <h3
                        className="text-base font-semibold text-[var(--fg-primary)] mb-2 cursor-pointer hover:text-[var(--accent)] transition-colors line-clamp-2"
                        onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                      >
                        {approval.subject}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-[var(--fg-muted)] flex-wrap">
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
                    <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/tickets/${approval.ticket_id}`)}
                        icon={<Icon name="eye" size={14} />}
                      >
                        View
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openDelegateApprovalModal(approval)}
                        title="Delegate this approval"
                        icon={<Icon name="share" size={14} />}
                      >
                        Delegate
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => openApproveModal(approval)}
                        icon={<Icon name="check" size={14} />}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => openRejectModal(approval)}
                        icon={<Icon name="close" size={14} />}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== DELEGATIONS TAB ====== */}
      {activeTab === "delegations" && (
        <>
          {delegationsLoading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : delegations.length === 0 ? (
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <EmptyState
                icon="share"
                tone="blue"
                title="No delegations yet"
                description="Create a delegation to let someone else handle your approvals."
                action={
                  <Button onClick={openNewDelegationModal} icon={<Icon name="plus" size={16} />}>
                    New Delegation
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                      <th className="px-4 py-3 text-left text-label">Direction</th>
                      <th className="px-4 py-3 text-left text-label">User</th>
                      <th className="px-4 py-3 text-left text-label">Type</th>
                      <th className="px-4 py-3 text-left text-label">Date Range</th>
                      <th className="px-4 py-3 text-left text-label">Status</th>
                      <th className="px-4 py-3 text-left text-label">Reason</th>
                      <th className="px-4 py-3 text-right text-label">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {delegations.map(d => {
                      const isGiven = d.delegator_id === user?.id;
                      return (
                        <tr key={d.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <Badge tone={isGiven ? "amber" : "cyan"} size="sm" dot>
                              {isGiven ? "Given" : "Received"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="h-8 w-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold flex items-center justify-center shrink-0">
                                {((isGiven ? d.delegate_name : d.delegator_name) || "?").charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                                  {isGiven ? d.delegate_name : d.delegator_name}
                                </p>
                                <p className="text-xs text-[var(--fg-muted)] truncate">
                                  {isGiven ? d.delegate_email : d.delegator_email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <Badge tone={d.delegation_type === "permanent" ? "violet" : d.delegation_type === "temporary" ? "blue" : "teal"} size="sm">
                              {d.delegation_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-[var(--fg-secondary)] whitespace-nowrap">
                            {d.delegation_type === "temporary"
                              ? `${formatDateShort(d.start_date)} - ${formatDateShort(d.end_date)}`
                              : d.delegation_type === "specific_ticket"
                                ? `Ticket #${d.ticket_id}`
                                : "Always"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <Badge tone={d.is_active ? "emerald" : "slate"} size="sm" dot={!!d.is_active}>
                              {d.is_active ? "Active" : "Revoked"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-[var(--fg-secondary)] max-w-[200px] truncate">
                            {d.reason || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isGiven && d.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevokeDelegation(d)}
                                className="text-rose-500 hover:bg-rose-500/10"
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
              variant="success"
              onClick={handleApprove}
              loading={submitting}
              icon={<Icon name="check" size={14} />}
            >
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
              variant="danger"
              onClick={handleReject}
              loading={submitting}
              icon={<Icon name="close" size={14} />}
            >
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
              icon={<Icon name="share" size={14} />}
            >
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
              icon={<Icon name="share" size={14} />}
            >
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
