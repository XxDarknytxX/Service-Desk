/**
 * Ticket Detail Page — Vodafone Service Desk
 *
 * Premium workspace experience: a branded ticket header (mono ticket number,
 * subject, status/priority badges, key actions), a two-column layout with a
 * tabbed conversation/activity/SLA/approvals timeline and a sticky properties
 * sidebar of clean labeled panels. Fully token-driven (dark & light), with
 * skeleton loading and EmptyState surfaces.
 *
 * All state, effects, handlers, API calls, modals, and features are preserved
 * exactly — this is a visual / layout redesign only.
 */

import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, approvalsApi, ticketsApi, templatesApi, slaApi, csatApi, formsApi } from "../services/api";
import { useMeta } from "../contexts/meta";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";
import Modal from "../components/ui/Modal";
import Icon from "../components/ui/Icon";
import Badge, { TagBadge } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Tabs from "../components/ui/Tabs";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import TemplateRenderer from "../components/templates/TemplateRenderer";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const STATUS_COLORS = {
  new: "blue", open: "indigo", pending: "amber", on_hold: "slate", solved: "emerald", closed: "slate",
};
const PRIORITY_COLORS = {
  urgent: "rose", high: "orange", normal: "blue", low: "slate",
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { meta } = useMeta();
  const toast = useToast();
  const statuses = meta?.statuses || [];
  const priorities = meta?.priorities || [];
  const teams = meta?.teams || [];
  // Reassign/triage targets: exactly the 4 corporate-flow teams, for everyone
  // (NOC members + admins). NOC/Corporate/EXCO/ICT/IT are intentionally excluded.
  const REASSIGN_TEAMS = ["Cloud", "Transmission", "MTX", "Security Operations"];
  const reassignTeams = teams.filter((t) => REASSIGN_TEAMS.includes(t.name));

  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [auditTrail, setAuditTrail] = useState([]);
  const [tags, setTags] = useState([]);
  const [slaData, setSlaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("comments");
  const [actionLoading, setActionLoading] = useState(null);

  const [commentBody, setCommentBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  // @mentions
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mention, setMention] = useState({ open: false, query: "", start: 0 });
  const [mentions, setMentions] = useState([]); // [{ id, name }]
  const commentRef = useRef(null);
  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [approvalData, setApprovalData] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [sendingForApproval, setSendingForApproval] = useState(false);
  const [showDescription, setShowDescription] = useState(true);

  // History & SLA Analysis tab state
  const [historyFilter, setHistoryFilter] = useState("");
  const [slaHistory, setSlaHistory] = useState([]);
  const [slaHistoryLoaded, setSlaHistoryLoaded] = useState(false);

  // Approval modal state
  const [approvalMode, setApprovalMode] = useState("auto"); // "auto" or "manual"
  const [availableApprovers, setAvailableApprovers] = useState([]);
  const [selectedApprovers, setSelectedApprovers] = useState([]); // [{user_id, level, name}]
  const [requireAllApprovers, setRequireAllApprovers] = useState(false);
  const [returnToAgent, setReturnToAgent] = useState("");
  const [returnToQueue, setReturnToQueue] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approverSearch, setApproverSearch] = useState("");
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);

  // Reassign modal state
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTeamId, setReassignTeamId] = useState("");
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignTeamMembers, setReassignTeamMembers] = useState([]);

  // Multi-team state
  const [ticketTeams, setTicketTeams] = useState([]);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");
  const [newTeamNotes, setNewTeamNotes] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);
  // NOC triage: only NOC members (+ admins) may reassign across teams; others flag back to NOC.
  const [isNocMember, setIsNocMember] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);

  // Template response state
  const [templateResponse, setTemplateResponse] = useState(null);
  const [showTemplateData, setShowTemplateData] = useState(true);

  // Customer forms linked to this ticket
  const [ticketForms, setTicketForms] = useState([]);
  const [showSendFormModal, setShowSendFormModal] = useState(false);
  const [availableForms, setAvailableForms] = useState([]);
  const [sendFormId, setSendFormId] = useState("");
  const [sendFormEmail, setSendFormEmail] = useState("");
  const [sendFormName, setSendFormName] = useState("");
  const [sendingFormInvite, setSendingFormInvite] = useState(false);
  const [sentFormLink, setSentFormLink] = useState(null);
  const [viewFormInvite, setViewFormInvite] = useState(null);

  // CSAT state
  const [csatRating, setCsatRating] = useState(null);
  const [csatHover, setCsatHover] = useState(0);
  const [csatComment, setCsatComment] = useState("");
  const [csatSubmitting, setCsatSubmitting] = useState(false);
  const [csatExisting, setCsatExisting] = useState(null);

  const isAgent = user?.roles?.includes("admin") || user?.roles?.includes("agent");

  useEffect(() => { loadTicketData(); }, [id]);

  // Load the directory once for @mentions (agents only).
  useEffect(() => {
    if (isAgent) api("/users").then((d) => setMentionUsers(d.items || d.users || [])).catch(() => {});
  }, [isAgent]);

  // Is the current agent on the NOC team? Controls reassign vs flag-to-NOC.
  useEffect(() => {
    if (isAgent && user?.id) {
      api(`/teams?userId=${user.id}`)
        .then((d) => {
          const teams = d.teams || d.items || [];
          setIsNocMember(teams.some((t) => (t.name || "").toUpperCase() === "NOC"));
        })
        .catch(() => {});
    }
  }, [isAgent, user?.id]);

  // Lazy-load SLA history when SLA Analysis tab is selected
  useEffect(() => {
    if (activeTab === "sla" && !slaHistoryLoaded && id) {
      slaApi.getTicketSlaHistory(id)
        .then((res) => { setSlaHistory(res.items || []); setSlaHistoryLoaded(true); })
        .catch(() => setSlaHistoryLoaded(true));
    }
  }, [activeTab, id, slaHistoryLoaded]);

  const loadTicketData = async () => {
    try {
      setLoading(true);
      const ticketRes = await api(`/tickets/${id}`);
      if (!ticketRes.ticket) {
        setTicket(null);
        return;
      }
      setTicket(ticketRes.ticket);

      if (ticketRes.ticket.team_id) {
        loadTeamMembers(ticketRes.ticket.team_id);
      }

      const requests = [
        api(`/tickets/${id}/comments`),
        api(`/tickets/${id}/audit`),
        api(`/tickets/${id}/tags`),
        api(`/tickets/${id}/sla`),
        approvalsApi.getTicketApprovals(id),
        ticketsApi.getTeams(id),
      ];

      // Fetch template response if ticket was created from a template
      if (ticketRes.ticket.template_id) {
        requests.push(templatesApi.getTicketResponse(id));
      }

      const [commentsRes, auditRes, tagsRes, slaRes, approvalsRes, teamsRes, templateRes] = await Promise.allSettled(requests);

      setComments(commentsRes.status === "fulfilled" ? commentsRes.value.items || [] : []);
      setAuditTrail(auditRes.status === "fulfilled" ? auditRes.value.items || [] : []);
      setTags(tagsRes.status === "fulfilled" ? tagsRes.value.items || [] : []);
      setSlaData(slaRes.status === "fulfilled" && slaRes.value.sla ? slaRes.value.sla : null);
      setApprovalData(approvalsRes.status === "fulfilled" ? approvalsRes.value.approvals || [] : []);
      setTicketTeams(teamsRes.status === "fulfilled" ? teamsRes.value.teams || [] : []);
      setTemplateResponse(
        templateRes?.status === "fulfilled" && templateRes.value?.response
          ? templateRes.value.response
          : null
      );

      // Load customer forms linked to this ticket (agent view only)
      if (user?.roles?.includes("admin") || user?.roles?.includes("agent")) {
        formsApi
          .ticketInvites(id)
          .then((d) => setTicketForms(d.invites || []))
          .catch(() => setTicketForms([]));
      }

      // Load CSAT if ticket is solved/closed
      const sk = ticketRes.ticket.status_key;
      if (sk === "solved" || sk === "closed") {
        try {
          const csatRes = await csatApi.getRating(id);
          if (csatRes.rating) {
            setCsatExisting(csatRes.rating);
            setCsatRating(csatRes.rating.rating);
            setCsatComment(csatRes.rating.comment || "");
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error("Failed to load ticket:", err);
      setTicket(null);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async (teamId) => {
    try {
      const data = await api(`/teams/${teamId}/members`);
      setTeamMembers(data.members || []);
    } catch (err) {
      setTeamMembers([]);
    }
  };

  const handleSubmitCsat = async () => {
    if (!csatRating) return;
    setCsatSubmitting(true);
    try {
      await csatApi.submitRating(id, { rating: csatRating, comment: csatComment || null });
      setCsatExisting({ rating: csatRating, comment: csatComment });
    } catch (err) {
      toast.error(err.message || "Failed to submit rating");
    } finally {
      setCsatSubmitting(false);
    }
  };

  const handleUpdateField = async (field, value) => {
    try {
      const payload = { [field]: value };
      if (field === "team_id" && value !== ticket.team_id) {
        payload.assignee_id = null;
      }
      await api(`/tickets/${id}`, { method: "PATCH", body: payload });
      await loadTicketData();
      if (field === "team_id" && value) {
        loadTeamMembers(value);
      }
    } catch (err) {
      console.error(`Failed to update ${field}:`, err);
      toast.error(err.message || `Failed to update ${field}`);
    }
  };

  const handleQuickStatus = async (statusKey) => {
    const status = statuses.find((s) => s.key === statusKey);
    if (!status) return;
    setActionLoading(statusKey);
    try {
      await api(`/tickets/${id}`, { method: "PATCH", body: { status_id: status.id } });
      await loadTicketData();
    } catch (err) {
      console.error("Status update failed:", err);
      toast.error(err.message || "Failed to update status");
    }
    finally { setActionLoading(null); }
  };

  const handleAssignToMe = async () => {
    setActionLoading("assign");
    try {
      await api(`/tickets/${id}/assign`, { method: "POST" });
      await loadTicketData();
    } catch (err) {
      console.error("Assign failed:", err);
      toast.error(err.message || "Failed to assign ticket");
    }
    finally { setActionLoading(null); }
  };

  const handleEscalate = async () => {
    setActionLoading("escalate");
    try {
      const result = await api(`/tickets/${id}/escalate`, { method: "POST" });
      if (result.newPriority) {
        await loadTicketData();
      }
    } catch (err) {
      console.error("Escalate failed:", err);
      toast.error(err.message || "Failed to escalate ticket");
    } finally {
      setActionLoading(null);
    }
  };

  // Detect an "@query" being typed at the cursor and surface the picker.
  const handleCommentChange = (e) => {
    const val = e.target.value;
    setCommentBody(val);
    const pos = e.target.selectionStart ?? val.length;
    const m = val.slice(0, pos).match(/(?:^|\s)@([\w.\-]*)$/);
    if (m) setMention({ open: true, query: m[1], start: pos - m[1].length - 1 });
    else setMention((s) => (s.open ? { ...s, open: false } : s));
  };
  const insertMention = (u) => {
    const name = u.full_name || u.email;
    const before = commentBody.slice(0, mention.start);
    const after = commentBody.slice(mention.start + 1 + mention.query.length);
    const piece = `@${name} `;
    const next = before + piece + after;
    setCommentBody(next);
    setMentions((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, { id: u.id, name }]));
    setMention({ open: false, query: "", start: 0 });
    setTimeout(() => {
      const el = commentRef.current;
      if (el) { const c = before.length + piece.length; el.focus(); el.setSelectionRange(c, c); }
    }, 0);
  };
  const mentionMatches = mention.open
    ? mentionUsers
        .filter((u) => (u.full_name || u.email || "").toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      setSubmittingComment(true);
      const activeMentions = mentions.filter((m) => commentBody.includes("@" + m.name)).map((m) => m.id);
      await api(`/tickets/${id}/comments`, { method: "POST", body: { body: commentBody, isPublic: !isInternalNote, mentions: activeMentions } });
      setCommentBody("");
      setIsInternalNote(false);
      setMentions([]);
      setMention({ open: false, query: "", start: 0 });
      await loadTicketData();
    } catch (err) {
      console.error("Comment failed:", err);
      toast.error(err.message || "Failed to post comment");
    }
    finally { setSubmittingComment(false); }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    try {
      setAddingTag(true);
      await api(`/tickets/${id}/tags`, { method: "POST", body: { name: tagInput.trim() } });
      setTagInput("");
      await loadTicketData();
    } catch (err) {
      console.error("Tag add failed:", err);
      toast.error(err.message || "Failed to add tag");
    }
    finally { setAddingTag(false); }
  };

  const handleRemoveTag = async (tagId) => {
    try {
      await api(`/tickets/${id}/tags/${tagId}`, { method: "DELETE" });
      await loadTicketData();
    } catch (err) {
      console.error("Tag remove failed:", err);
      toast.error(err.message || "Failed to remove tag");
    }
  };

  const handleOpenApprovalModal = async () => {
    setShowApprovalModal(true);
    setApprovalMode("auto");
    setSelectedApprovers([]);
    setRequireAllApprovers(false);
    setReturnToAgent(ticket?.assignee_id?.toString() || "");
    setReturnToQueue(ticket?.team_id?.toString() || "");
    setApprovalNotes("");
    setApproverSearch("");
    setShowApproverDropdown(false);

    // Load available approvers
    try {
      const data = await approvalsApi.getApprovers();
      setAvailableApprovers(data.approvers || []);
    } catch (err) {
      console.error("Failed to load approvers:", err);
    }
  };

  const handleAddApprover = (userId) => {
    const approver = availableApprovers.find(a => a.id === parseInt(userId));
    if (!approver) return;
    if (selectedApprovers.some(a => a.user_id === approver.id)) return;

    const maxLevel = selectedApprovers.length > 0
      ? Math.max(...selectedApprovers.map(a => a.level))
      : 0;

    setSelectedApprovers([
      ...selectedApprovers,
      { user_id: approver.id, level: maxLevel + 1, name: approver.full_name }
    ]);
  };

  const handleRemoveApprover = (userId) => {
    const updated = selectedApprovers.filter(a => a.user_id !== userId);
    // Renumber levels
    const renumbered = updated.map((a, idx) => ({ ...a, level: idx + 1 }));
    setSelectedApprovers(renumbered);
  };

  const handleMoveApprover = (userId, direction) => {
    const idx = selectedApprovers.findIndex(a => a.user_id === userId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === selectedApprovers.length - 1) return;

    const newList = [...selectedApprovers];
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];

    // Renumber levels
    const renumbered = newList.map((a, i) => ({ ...a, level: i + 1 }));
    setSelectedApprovers(renumbered);
  };

  const handleSetSameLevel = (userId, sameAsAbove) => {
    const idx = selectedApprovers.findIndex(a => a.user_id === userId);
    if (idx <= 0) return;

    const newList = [...selectedApprovers];
    if (sameAsAbove) {
      newList[idx].level = newList[idx - 1].level;
    } else {
      // Reset to sequential
      newList[idx].level = newList[idx - 1].level + 1;
    }
    setSelectedApprovers(newList);
  };

  const handleSendForApproval = async () => {
    setSendingForApproval(true);
    try {
      const options = {};

      if (approvalMode === "manual") {
        if (selectedApprovers.length === 0) {
          toast.error("Please select at least one approver");
          setSendingForApproval(false);
          return;
        }
        options.approvers = selectedApprovers.map(a => ({ user_id: a.user_id, level: a.level }));
        options.require_all = requireAllApprovers;
      }

      if (returnToAgent) options.return_to_agent = parseInt(returnToAgent);
      if (returnToQueue) options.return_to_queue = parseInt(returnToQueue);
      if (approvalNotes.trim()) options.notes = approvalNotes.trim();

      await approvalsApi.sendForApproval(id, options);
      setShowApprovalModal(false);
      toast.success("Ticket sent for approval");
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to send for approval");
    } finally {
      setSendingForApproval(false);
    }
  };

  // Reassign handlers
  const handleOpenReassignModal = async () => {
    setShowReassignModal(true);
    setReassignTeamId(ticket?.team_id?.toString() || "");
    setReassignAgentId(ticket?.assignee_id?.toString() || "");
    setReassignReason("");
    // Load team members for current team
    if (ticket?.team_id) {
      try {
        const data = await api(`/teams/${ticket.team_id}/members`);
        setReassignTeamMembers(data.members || []);
      } catch (err) {
        setReassignTeamMembers([]);
      }
    }
  };

  const handleReassignTeamChange = async (teamId) => {
    setReassignTeamId(teamId);
    setReassignAgentId(""); // Reset agent when team changes
    if (teamId) {
      try {
        const data = await api(`/teams/${teamId}/members`);
        setReassignTeamMembers(data.members || []);
      } catch (err) {
        setReassignTeamMembers([]);
      }
    } else {
      setReassignTeamMembers([]);
    }
  };

  const handleReassign = async () => {
    // The requirements note is mandatory only on a team change (triage hand-off),
    // matching the backend. A same-team assignee swap doesn't need one.
    const teamChanging = (reassignTeamId ? parseInt(reassignTeamId) : null) !== (ticket?.team_id ?? null);
    if (teamChanging && !reassignReason.trim()) {
      toast.error("A requirements note is required when reassigning to another team.");
      return;
    }
    setReassigning(true);
    try {
      await ticketsApi.reassign(id, {
        team_id: reassignTeamId ? parseInt(reassignTeamId) : null,
        assignee_id: reassignAgentId ? parseInt(reassignAgentId) : null,
        reason: reassignReason.trim() || null,
      });
      setShowReassignModal(false);
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to reassign ticket");
    } finally {
      setReassigning(false);
    }
  };

  // Flag a misrouted ticket back to the NOC queue for re-routing.
  const submitFlagToNoc = async () => {
    setFlagging(true);
    try {
      await api(`/tickets/${id}/flag-to-noc`, { method: "POST", body: { reason: flagReason.trim() || null } });
      toast.success("Flagged back to the NOC queue for re-routing");
      setShowFlagModal(false);
      setFlagReason("");
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to flag to NOC");
    } finally {
      setFlagging(false);
    }
  };

  // Multi-team handlers
  const handleAddTeam = async () => {
    if (!newTeamId) {
      toast.error("Please select a team");
      return;
    }
    setAddingTeam(true);
    try {
      await ticketsApi.addTeam(id, {
        team_id: parseInt(newTeamId),
        is_primary: ticketTeams.length === 0,
        notes: newTeamNotes.trim() || null,
      });
      setShowAddTeamModal(false);
      setNewTeamId("");
      setNewTeamNotes("");
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to add team");
    } finally {
      setAddingTeam(false);
    }
  };

  const handleRemoveTeam = async (teamId) => {
    try {
      await ticketsApi.removeTeam(id, teamId);
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to remove team");
    }
  };

  const handleSetPrimaryTeam = async (teamId) => {
    try {
      await ticketsApi.updateTeam(id, teamId, { is_primary: true });
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to set primary team");
    }
  };

  const handleCompleteTeamWork = async (teamId) => {
    try {
      const result = await ticketsApi.completeTeamWork(id, teamId, "");
      if (result.allTeamsComplete && result.ticketResolved) {
        toast.success("All teams have completed their work. Ticket has been automatically resolved!");
      }
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to mark team work as complete");
    }
  };

  const handleReopenTeamWork = async (teamId) => {
    try {
      await ticketsApi.reopenTeamWork(id, teamId);
      await loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to reopen team work");
    }
  };

  // ── Customer form handlers ──
  const handleOpenSendForm = async () => {
    setShowSendFormModal(true);
    setSendFormId("");
    setSendFormEmail(ticket?.requester_email || "");
    setSendFormName(ticket?.requester_name || "");
    setSentFormLink(null);
    if (availableForms.length === 0) {
      try {
        const d = await formsApi.list();
        setAvailableForms(d.forms || []);
      } catch (err) {
        toast.error(err.message || "Failed to load forms");
      }
    }
  };

  const handleSendFormInvite = async () => {
    if (!sendFormId) {
      toast.error("Choose a form to send");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendFormEmail.trim())) {
      toast.error("Enter a valid recipient email");
      return;
    }
    setSendingFormInvite(true);
    try {
      const invite = await formsApi.createInvite(sendFormId, {
        email: sendFormEmail.trim(),
        name: sendFormName.trim() || undefined,
        ticket_id: Number(id),
      });
      setSentFormLink(`${window.location.origin}/f/${invite.token}`);
      toast.success("Form linked to this ticket");
      const d = await formsApi.ticketInvites(id).catch(() => null);
      if (d) setTicketForms(d.invites || []);
      loadTicketData();
    } catch (err) {
      toast.error(err.message || "Failed to send form");
    } finally {
      setSendingFormInvite(false);
    }
  };

  const copyFormLink = async (token) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/f/${token}`);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy — copy it manually");
    }
  };

  const formatDate = (d) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getTimeAgo = (d) => {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return formatDate(d);
  };

  /**
   * Get SLA remaining time. If businessMs is provided (from API), use that
   * for accurate business-hours countdown. Otherwise fall back to wall clock.
   */
  const getSlaRemaining = (dueDate, businessMs) => {
    if (!dueDate) return null;
    // Use business-hours milliseconds from API if available
    const diff = businessMs != null ? businessMs : (new Date(dueDate) - Date.now());
    const wallDiff = new Date(dueDate) - Date.now();
    const h = Math.floor(Math.abs(diff) / 3600000);
    const m = Math.floor((Math.abs(diff) % 3600000) / 60000);
    const timeText = h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (wallDiff < 0) return { text: `${timeText} overdue`, tone: "rose", overdue: true };
    if (h < 1) return { text: `${timeText} left`, tone: "rose", overdue: false };
    if (h < 4) return { text: `${timeText} left`, tone: "amber", overdue: false };
    return { text: `${timeText} left`, tone: "emerald", overdue: false };
  };

  // ── History event config ──────────────────────────────────────
  const HISTORY_EVENT_CONFIG = {
    "ticket.created":          { icon: "plus",       label: "Created",            color: "text-emerald-400" },
    "ticket.updated":          { icon: "pencil",     label: "Updated",            color: "text-blue-400" },
    "ticket.commented":        { icon: "message",    label: "Comment Added",      color: "text-sky-400" },
    "ticket.assigned":         { icon: "userPlus",   label: "Assigned",           color: "text-violet-400" },
    "ticket.escalated":        { icon: "arrowUp",    label: "Escalated",          color: "text-orange-400" },
    "ticket.reassigned":       { icon: "users",      label: "Reassigned",         color: "text-amber-400" },
    "ticket.flagged_to_noc":   { icon: "inbox",      label: "Flagged to NOC",     color: "text-orange-400" },
    "ticket.tag_added":        { icon: "tag",        label: "Tag Added",          color: "text-teal-400" },
    "ticket.tag_removed":      { icon: "tag",        label: "Tag Removed",        color: "text-slate-400" },
    "ticket.team_added":       { icon: "teams",      label: "Team Added",         color: "text-indigo-400" },
    "ticket.team_removed":     { icon: "teams",      label: "Team Removed",       color: "text-slate-400" },
    "ticket.team_completed":   { icon: "checkCircle", label: "Team Completed",    color: "text-emerald-400" },
    "ticket.team_reopened":    { icon: "refresh",    label: "Team Reopened",       color: "text-amber-400" },
    "ticket.auto_resolved":    { icon: "check",      label: "Auto Resolved",      color: "text-emerald-400" },
    "ticket.sent_for_approval":{ icon: "shield",     label: "Sent for Approval",  color: "text-violet-400" },
    "approval.delegated":      { icon: "share",      label: "Approval Delegated", color: "text-cyan-400" },
    "approval.approved":       { icon: "checkCircle", label: "Approved",           color: "text-emerald-400" },
    "approval.rejected":       { icon: "close",      label: "Rejected",            color: "text-rose-400" },
    "approval.level_advanced": { icon: "arrowUp",    label: "Level Advanced",      color: "text-blue-400" },
    "approval.post_actions_applied": { icon: "check", label: "Post-Approval Actions", color: "text-emerald-400" },
    "ticket.reopened":         { icon: "refresh",    label: "Reopened",            color: "text-amber-400" },
    "ticket.rated":            { icon: "star",       label: "CSAT Rating",         color: "text-amber-400" },
    "sla.paused":              { icon: "pause",      label: "SLA Paused",          color: "text-amber-400" },
    "sla.resumed":             { icon: "play",       label: "SLA Resumed",         color: "text-emerald-400" },
    "sla.assigned":            { icon: "sla",        label: "SLA Assigned",        color: "text-blue-400" },
    "sla.response_met":        { icon: "check",      label: "Response SLA Met",    color: "text-emerald-400" },
    "sla.extended":            { icon: "clock",      label: "SLA Extended",        color: "text-blue-400" },
    "approval_sla.assigned":   { icon: "clock",      label: "Approval SLA Set",    color: "text-blue-400" },
    "approval_sla.met":        { icon: "check",      label: "Approval SLA Met",    color: "text-emerald-400" },
    "approval_sla.escalated":  { icon: "arrowUp",    label: "Approval Escalated",  color: "text-orange-400" },
    "form.sent":               { icon: "send",       label: "Form Sent",           color: "text-cyan-400" },
    "form.completed":          { icon: "checkCircle", label: "Form Completed",     color: "text-emerald-400" },
    "triage_sla.assigned":     { icon: "clock",      label: "Triage SLA Started",  color: "text-blue-400" },
    "triage_sla.met":          { icon: "check",      label: "Triage SLA Met",      color: "text-emerald-400" },
    "triage_sla.breached":     { icon: "alertTriangle", label: "Triage SLA Breached", color: "text-rose-400" },
  };

  const groupEventsByDate = (events) => {
    const groups = {};
    events.forEach((event) => {
      const dateKey = new Date(event.created_at).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    });
    return Object.entries(groups).sort(
      (a, b) => new Date(b[1][0].created_at) - new Date(a[1][0].created_at)
    );
  };

  const getEventIcon = (type) => (HISTORY_EVENT_CONFIG[type]?.icon || "info");

  const getEventDescription = (event) => {
    const p = event.payload || {};
    switch (event.event_type) {
      case "ticket.created": return event.routed_team ? `created this ticket — routed to ${event.routed_team}` : "created this ticket";
      case "ticket.updated": {
        if (event.resolved_changes?.length) {
          return `updated ${event.resolved_changes.map((c) => c.label).join(", ")}`;
        }
        if (p.field_name) return `changed ${p.field_name.replace(/_/g, " ")}`;
        const fields = Object.keys(p.changes || p).filter((k) => !["updated_at","old_value","new_value","field_name","changes"].includes(k));
        return `updated ${fields.join(", ") || "ticket"}`;
      }
      case "ticket.commented": return p.is_public === false || p.isPublic === false ? "added an internal note" : "added a comment";
      case "ticket.tag_added": return `added tag "${p.tag_name || p.tag || ""}"`;
      case "ticket.tag_removed": return `removed tag "${p.tag_name || p.tag || ""}"`;
      case "ticket.assigned": return "assigned this ticket";
      case "ticket.escalated": return "escalated this ticket";
      case "ticket.reassigned": return "reassigned this ticket";
      case "ticket.flagged_to_noc": return `flagged back to NOC${event.from_team_name ? ` from ${event.from_team_name}` : ""}${p.reason ? ` — "${p.reason}"` : ""}`;
      case "ticket.team_added": return `added team "${p.team_name || ""}"`;
      case "ticket.team_removed": return `removed team "${p.team_name || ""}"`;
      case "ticket.team_completed": return `marked team work complete`;
      case "ticket.team_reopened": return `reopened team work`;
      case "ticket.auto_resolved": return "auto-resolved (all teams complete)";
      case "ticket.sent_for_approval": return `sent for approval (${p.mode || "auto"})`;
      case "approval.delegated": return `delegated Level ${p.approval_level || "?"} approval to ${p.delegated_to_name || "another user"}${p.reason ? ` — "${p.reason}"` : ""}`;
      case "ticket.reopened": return "reopened this ticket";
      case "sla.paused": return "paused the SLA timer";
      case "sla.resumed": return "resumed the SLA timer";
      case "sla.assigned": return event.routed_team ? `set the SLA target for ${event.routed_team}` : "set the SLA target";
      case "sla.extended": return "extended the SLA target";
      case "form.sent": return `sent customer form "${p.form_name || ""}" to ${p.recipient_email || "the recipient"}`;
      case "form.completed": return `customer completed form "${p.form_name || ""}"${p.auto_reopened ? " — ticket reopened automatically" : ""}`;
      default: return event.event_type.replace("ticket.", "").replace(/[._]/g, " ");
    }
  };

  const getInitial = (name) => (name || "?")[0].toUpperCase();

  if (loading) {
    return (
      <div className="space-y-5 animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" rounded="rounded-md" />
          <Skeleton className="h-4 w-24" rounded="rounded-md" />
        </div>
        {/* Header */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20" rounded="rounded-full" />
            <Skeleton className="h-5 w-20" rounded="rounded-full" />
            <Skeleton className="h-5 w-16" rounded="rounded-full" />
          </div>
          <Skeleton className="h-7 w-2/3" rounded="rounded-lg" />
          <Skeleton className="h-9 w-72" rounded="rounded-lg" />
        </div>
        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-32" rounded="rounded-2xl" />
            <Skeleton className="h-64" rounded="rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-72" rounded="rounded-2xl" />
            <Skeleton className="h-40" rounded="rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] animate-fade-in">
        <EmptyState
          icon="alertTriangle"
          tone="rose"
          title="Ticket not found"
          description="The ticket doesn't exist or you don't have access to it."
          action={
            <Button variant="secondary" onClick={() => navigate("/tickets")} icon={<Icon name="arrowLeft" size={15} />}>
              Back to Tickets
            </Button>
          }
        />
      </div>
    );
  }

  const canSendForApproval = !ticket.approval_status || ticket.approval_status === "not_required" || ticket.approval_status === "rejected";

  return (
    <div className="space-y-5">
      {/* ── Branded Ticket Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] animate-fade-up">
        {/* decorative brand accents */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[var(--accent)] opacity-[0.08] blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-40" />

        <div className="relative p-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-4">
            <button
              onClick={() => navigate("/tickets")}
              className="flex items-center gap-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors"
            >
              <Icon name="arrowLeft" size={14} />
              Tickets
            </button>
            <Icon name="chevronRight" size={13} className="text-[var(--fg-subtle)]" />
            <span className="text-[12px] font-mono font-semibold px-2 py-0.5 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)]">
              {ticket.ticket_number}
            </span>
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge tone={STATUS_COLORS[ticket.status_key] || "slate"} size="sm" dot>
                  {ticket.status_label}
                </Badge>
                <Badge tone={PRIORITY_COLORS[ticket.priority_key] || "slate"} size="sm" dot>
                  {ticket.priority_label}
                </Badge>
                {ticket.type_label && (
                  <Badge tone="slate" size="sm">{ticket.type_label}</Badge>
                )}
                <span className="text-xs text-[var(--fg-muted)] ml-1">
                  Opened {getTimeAgo(ticket.created_at)} by{" "}
                  <span className="text-[var(--fg-secondary)] font-medium">{ticket.requester_name}</span>
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-[var(--fg-primary)] leading-snug tracking-tight">
                {ticket.subject}
              </h1>
            </div>

            {/* Quick Actions — one cohesive toolbar */}
            {isAgent && (
              <div className="inline-flex items-center flex-wrap rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] p-1 gap-0.5 shrink-0">
                {/* NOC is a triage role — their job is to reassign, so the
                    work-the-ticket actions (assign/approval/escalate) are hidden. */}
                {ticket.assignee_id !== user?.id && !isNocMember && (
                  <ToolbarAction
                    icon="userPlus"
                    label="Assign to me"
                    onClick={handleAssignToMe}
                    loading={actionLoading === "assign"}
                  />
                )}
                {canSendForApproval && !isNocMember && (
                  <ToolbarAction
                    icon="shield"
                    label="Send for Approval"
                    onClick={handleOpenApprovalModal}
                  />
                )}
                {!isNocMember && (
                  <ToolbarAction
                    icon="arrowUp"
                    label="Escalate"
                    onClick={handleEscalate}
                    loading={actionLoading === "escalate"}
                  />
                )}
                {/* NOC can only triage while the ticket is in the NOC queue;
                    once triaged out it can't be triaged again. Admins can always reassign. */}
                {(user?.roles?.includes("admin") || (isNocMember && ticket.team_name === "NOC")) && (
                  <ToolbarAction
                    icon="users"
                    label={isNocMember && ticket.team_name === "NOC" ? "Triage" : "Reassign"}
                    onClick={handleOpenReassignModal}
                    tone={isNocMember && ticket.team_name === "NOC" ? "accent" : undefined}
                  />
                )}
                {isAgent && !isNocMember && !user?.roles?.includes("admin") && ticket.team_name !== "NOC" && (
                  <ToolbarAction
                    icon="inbox"
                    label="Flag to NOC"
                    onClick={() => setShowFlagModal(true)}
                  />
                )}
                {["new", "open", "pending", "on_hold"].includes(ticket.status_key) && ticket.team_name !== "NOC" && (
                  <>
                    <span className="w-px h-5 bg-[var(--border-default)] mx-1" />
                    <ToolbarAction
                      icon="checkCircle"
                      label="Resolve"
                      onClick={() => handleQuickStatus("solved")}
                      loading={actionLoading === "solved"}
                      tone="success"
                    />
                  </>
                )}
                {ticket.status_key === "solved" && (
                  <>
                    <span className="w-px h-5 bg-[var(--border-default)] mx-1" />
                    <ToolbarAction
                      icon="check"
                      label="Close"
                      onClick={() => handleQuickStatus("closed")}
                      loading={actionLoading === "closed"}
                      tone="success"
                    />
                    <ToolbarAction
                      icon="refresh"
                      label="Reopen"
                      onClick={() => handleQuickStatus("open")}
                      loading={actionLoading === "open"}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column workspace ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left / main: conversation + timeline */}
        <div className="lg:col-span-2 min-w-0 space-y-5">
          {/* Description Section */}
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "60ms" }}>
            <button
              onClick={() => setShowDescription(!showDescription)}
              className="w-full flex items-center gap-2.5 px-5 py-4 hover:bg-[var(--bg-surface)] transition-colors"
            >
              <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <Icon name="fileText" size={16} />
              </span>
              <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Description</h2>
              <Icon
                name="chevronDown"
                size={16}
                className={cn("ml-auto text-[var(--fg-muted)] transition-transform duration-200", !showDescription && "-rotate-90")}
              />
            </button>
            {showDescription && (
              <div className="px-5 pb-5 -mt-1 text-sm text-[var(--fg-secondary)] leading-relaxed whitespace-pre-wrap">
                {ticket.description || <span className="text-[var(--fg-muted)] italic">No description provided</span>}
              </div>
            )}
          </div>

          {/* Template Response Data */}
          {templateResponse && (
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "90ms" }}>
              <button
                onClick={() => setShowTemplateData(!showTemplateData)}
                className="w-full flex items-center gap-2.5 px-5 py-4 hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <Icon name={ticket.template_icon || "clipboard"} size={16} />
                </span>
                <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
                  {ticket.template_name ? `${ticket.template_name} Data` : "Template Data"}
                </h2>
                <Icon
                  name="chevronDown"
                  size={16}
                  className={cn("ml-auto text-[var(--fg-muted)] transition-transform duration-200", !showTemplateData && "-rotate-90")}
                />
              </button>
              {showTemplateData && (
                <div className="px-5 pb-5 -mt-1">
                  <TemplateRenderer
                    schema={templateResponse.schema_snapshot || []}
                    values={templateResponse.response_data || {}}
                    readOnly={true}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {(tags.length > 0 || isAgent) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)]">
                <Icon name="tag" size={13} />
                Tags
              </span>
              {tags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tone="violet"
                  onRemove={isAgent ? () => handleRemoveTag(tag.id) : undefined}
                >
                  {tag.name}
                </TagBadge>
              ))}
              {isAgent && (
                <form onSubmit={handleAddTag} className="inline-flex">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="+ Add label"
                    className="text-xs bg-transparent border-none outline-none text-[var(--fg-muted)] placeholder:text-[var(--fg-muted)] w-20 focus:w-32 transition-all"
                  />
                </form>
              )}
            </div>
          )}

          {/* Activity / Conversation Section */}
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "120ms" }}>
            {/* Tabs */}
            <div className="px-2 sm:px-3">
              <Tabs
                variant="underline"
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { value: "comments", label: "Conversation", icon: "messageCircle", count: comments.length || null },
                  { value: "history", label: "Activity", icon: "activity", count: auditTrail.length || null },
                  { value: "sla", label: "SLA", icon: "sla" },
                  ...(ticket.approval_status && ticket.approval_status !== "not_required"
                    ? [{ value: "approvals", label: "Approvals", icon: "shield", count: approvalData?.length || null }]
                    : []),
                  { value: "all", label: "All", icon: "list" },
                ]}
              />
            </div>

            <div className="p-5">
            {/* Comment Input */}
            <form onSubmit={handleSubmitComment} className="mb-6">
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)] flex-shrink-0">
                  {getInitial(user?.fullName || user?.full_name || user?.email)}
                </div>
                <div className="flex-1 relative">
                  <textarea
                    ref={commentRef}
                    value={commentBody}
                    onChange={handleCommentChange}
                    placeholder={isAgent ? "Add a comment… type @ to mention a teammate" : "Add a comment…"}
                    rows={2}
                    className={cn(
                      "w-full px-3.5 py-2.5 rounded-xl text-sm resize-none transition-all",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "placeholder:text-[var(--fg-muted)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    )}
                  />
                  {mention.open && mentionMatches.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto p-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-elevated)] animate-slide-down">
                      {mentionMatches.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
                        >
                          <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold flex items-center justify-center shrink-0">
                            {getInitial(u.full_name || u.email)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm text-[var(--fg-primary)] truncate">{u.full_name || u.email}</span>
                            {u.title && <span className="block text-[11px] text-[var(--fg-muted)] truncate">{u.title}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {commentBody.trim() && (
                    <div className="flex items-center justify-between mt-2">
                      {isAgent && (
                        <label className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInternalNote}
                            onChange={(e) => setIsInternalNote(e.target.checked)}
                            className="rounded border-[var(--border-default)] text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-[var(--bg-base)] w-3.5 h-3.5"
                          />
                          Internal note
                        </label>
                      )}
                      <div className="flex items-center gap-2 ml-auto">
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setCommentBody(""); setIsInternalNote(false); }}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" loading={submittingComment} icon={<Icon name={isInternalNote ? "lock" : "send"} size={14} />}>
                          {isInternalNote ? "Save Note" : "Send"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* ═══ COMMENTS TAB ═══ */}
            {(activeTab === "comments" || activeTab === "all") && (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={`comment-${c.id}`} className="flex gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                      c.is_public ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-amber-500/10 text-amber-400"
                    )}>
                      {getInitial(c.author_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--fg-primary)]">{c.author_name}</span>
                        {!c.is_public && <Badge tone="amber" size="sm" icon={<Icon name="lock" size={10} />}>Internal</Badge>}
                        <span className="text-xs text-[var(--fg-muted)]">{getTimeAgo(c.created_at)}</span>
                      </div>
                      <div className={cn(
                        "text-sm whitespace-pre-wrap rounded-xl px-3.5 py-3 border",
                        c.is_public
                          ? "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-secondary)]"
                          : "bg-amber-500/5 border-amber-500/15 text-[var(--fg-secondary)]"
                      )}>
                        {c.body}
                      </div>
                    </div>
                  </div>
                ))}
                {activeTab === "comments" && comments.length === 0 && (
                  <EmptyState
                    icon="messageCircle"
                    title="No comments yet"
                    description="Start the conversation by adding the first comment above."
                    compact
                  />
                )}
              </div>
            )}

            {/* ═══ HISTORY TAB (date-grouped timeline) ═══ */}
            {(activeTab === "history" || activeTab === "all") && (() => {
              const filteredTrail = historyFilter.trim()
                ? auditTrail.filter((event) => {
                    const q = historyFilter.toLowerCase();
                    if ((event.actor_name || "").toLowerCase().includes(q)) return true;
                    if (event.event_type.toLowerCase().includes(q)) return true;
                    if (HISTORY_EVENT_CONFIG[event.event_type]?.label.toLowerCase().includes(q)) return true;
                    if ((event.resolved_changes || []).some((c) =>
                      c.label.toLowerCase().includes(q) ||
                      String(c.from_value).toLowerCase().includes(q) ||
                      String(c.to_value).toLowerCase().includes(q)
                    )) return true;
                    return false;
                  })
                : auditTrail;

              const dateGroups = groupEventsByDate(filteredTrail);

              return (
                <div className={cn(activeTab === "all" && comments.length > 0 && "mt-8 pt-6 border-t border-[var(--border-default)]")}>
                  {/* Section label when combined with comments in the All tab */}
                  {activeTab === "all" && (
                    <p className="text-label mb-4">Activity timeline</p>
                  )}
                  {/* Filter Input */}
                  {activeTab === "history" && (
                    <div className="relative mb-4">
                      <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
                      <input
                        type="text"
                        value={historyFilter}
                        onChange={(e) => setHistoryFilter(e.target.value)}
                        placeholder="Filter history..."
                        className={cn(
                          "w-full pl-9 pr-3 py-2 rounded-lg text-sm",
                          "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                          "border border-[var(--border-default)]",
                          "placeholder:text-[var(--fg-muted)]",
                          "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                        )}
                      />
                    </div>
                  )}

                  {/* Date-Grouped Timeline */}
                  {dateGroups.map(([dateLabel, events]) => (
                    <div key={dateLabel} className="mb-6">
                      {/* Date Header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                          <Icon name="calendar" size={12} className="text-[var(--fg-muted)]" />
                          <span className="text-xs font-semibold text-[var(--fg-secondary)]">{dateLabel}</span>
                        </div>
                        <div className="flex-1 h-px bg-[var(--border-default)]" />
                      </div>

                      {/* Events */}
                      <div className="space-y-2 ml-3 border-l-2 border-[var(--border-default)] pl-5">
                        {events.map((event) => {
                          const config = HISTORY_EVENT_CONFIG[event.event_type] || { icon: "info", label: event.event_type.replace(/[._]/g, " "), color: "text-[var(--fg-muted)]" };
                          const time = new Date(event.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

                          return (
                            <div key={`event-${event.id}`} className="relative">
                              {/* Timeline dot */}
                              <div className={cn(
                                "absolute -left-[27px] top-3 w-3 h-3 rounded-full border-2",
                                "bg-[var(--bg-base)] border-[var(--border-default)]"
                              )} />

                              {/* Event Card */}
                              <div className="rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] p-3 hover:border-[var(--border-hover)] transition-colors">
                                {/* Header */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-[var(--fg-muted)] font-mono w-16 flex-shrink-0">{time}</span>
                                  <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", config.color.replace("text-", "bg-").replace("-400", "-500/10"))}>
                                    <Icon name={config.icon} size={12} className={config.color} />
                                  </div>
                                  <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
                                  <span className="text-xs text-[var(--fg-muted)]">by</span>
                                  <span className="text-sm font-medium text-[var(--accent)]">{event.actor_name || "System"}</span>
                                </div>

                                {/* Resolved changes for ticket.updated / ticket.reassigned / ticket.assigned */}
                                {event.resolved_changes && event.resolved_changes.length > 0 && (
                                  <div className="mt-2 ml-[88px] space-y-1">
                                    {event.resolved_changes.map((change, idx) => (
                                      <p key={idx} className="text-sm text-[var(--fg-secondary)]">
                                        <span className="font-medium text-[var(--fg-primary)]">{change.label}</span>
                                        {" changed from "}
                                        <span className="line-through text-[var(--fg-muted)]">{change.from_value}</span>
                                        {" to "}
                                        <span className="font-semibold text-[var(--fg-primary)]">{change.to_value}</span>
                                      </p>
                                    ))}
                                  </div>
                                )}

                                {/* Extra context for specific event types */}
                                {event.event_type === "ticket.reassigned" && event.payload?.reason && (
                                  <p className="text-xs text-[var(--fg-muted)] mt-2 ml-[88px] italic">
                                    Reason: {event.payload.reason}
                                  </p>
                                )}
                                {event.event_type === "ticket.escalated" && event.payload?.from && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    Priority escalated from <span className="line-through text-[var(--fg-muted)]">{event.payload.from}</span> to <span className="font-semibold text-[var(--fg-primary)]">{event.payload.to}</span>
                                  </p>
                                )}
                                {event.event_type === "ticket.sent_for_approval" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    Mode: {event.payload?.mode || "auto"}
                                    {event.payload?.rule_name && <> · Rule: {event.payload.rule_name}</>}
                                    {event.payload?.approvers_count && <> · {event.payload.approvers_count} approver(s)</>}
                                  </p>
                                )}
                                {event.event_type === "sla.paused" && event.payload?.response_remaining_ms != null && (
                                  <p className="text-xs text-[var(--fg-muted)] mt-2 ml-[88px]">
                                    Response remaining: {Math.round(event.payload.response_remaining_ms / 60000)}m
                                    {event.payload.resolve_remaining_ms != null && <> · Resolve remaining: {Math.round(event.payload.resolve_remaining_ms / 60000)}m</>}
                                  </p>
                                )}
                                {/* Initial routing: which team the request landed in on creation. */}
                                {event.event_type === "ticket.created" && event.routed_team && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    Routed to <span className="font-semibold text-[var(--fg-primary)]">{event.routed_team}</span>
                                  </p>
                                )}
                                {/* SLA target set on creation and re-set on every (re)assignment. */}
                                {event.event_type === "sla.assigned" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    SLA target set{event.routed_team && <> for <span className="font-semibold text-[var(--fg-primary)]">{event.routed_team}</span></>}
                                  </p>
                                )}
                                {/* Triage SLA started — the NOC "reassign on time" clock. */}
                                {event.event_type === "triage_sla.assigned" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    NOC must reassign within{event.payload?.target_minutes != null && <> <span className="font-semibold text-[var(--fg-primary)]">{event.payload.target_minutes}m</span></>}
                                  </p>
                                )}
                                {/* Triage SLA met — NOC routed the ticket out of the queue. */}
                                {event.event_type === "triage_sla.met" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    Reassigned out of NOC {event.payload?.on_time === false
                                      ? <span className="font-semibold text-rose-400">(late)</span>
                                      : <span className="font-semibold text-emerald-400">(on time)</span>}
                                  </p>
                                )}
                                {/* Triage SLA breached — not routed out of NOC in time. */}
                                {event.event_type === "triage_sla.breached" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    Not routed out of the NOC queue before the triage target
                                  </p>
                                )}
                                {/* Flagged back to NOC: which team it came from. */}
                                {event.event_type === "ticket.flagged_to_noc" && (
                                  <p className="text-sm text-[var(--fg-secondary)] mt-2 ml-[88px]">
                                    {event.from_team_name ? <>Returned to NOC from <span className="font-semibold text-[var(--fg-primary)]">{event.from_team_name}</span></> : "Returned to the NOC triage queue"}
                                    {event.payload?.reason && <span className="block text-xs text-[var(--fg-muted)] italic mt-1">Reason: {event.payload.reason}</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {filteredTrail.length === 0 && (
                    <EmptyState
                      icon="activity"
                      title={historyFilter ? "No matching history" : "No history recorded"}
                      description={historyFilter ? "Try a different search term." : "Ticket events will appear here as they happen."}
                      compact
                    />
                  )}
                </div>
              );
            })()}

            {/* ═══ SLA ANALYSIS TAB ═══ */}
            {activeTab === "sla" && (
              <div className="space-y-5">
                {!slaData ? (
                  <EmptyState
                    icon="sla"
                    title="No SLA policy assigned"
                    description="This ticket isn't covered by an SLA policy."
                    compact
                  />
                ) : (
                  <>
                    {/* SLA Policy Header */}
                    <div className="rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                          <Icon name="sla" size={20} className="text-[var(--accent)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">{slaData.policy_name || "SLA Policy"}</h3>
                          <p className="text-xs text-[var(--fg-muted)]">
                            Response target: {slaData.response_minutes ?? "N/A"}m · Resolution target: {slaData.resolve_minutes ?? "N/A"}m
                          </p>
                        </div>
                        {slaData.paused_at && (
                          <Badge tone="amber" className="text-xs flex-shrink-0">Paused</Badge>
                        )}
                      </div>
                    </div>

                    {/* Response, Resolution & (NOC) Triage SLA Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Response SLA */}
                      {(() => {
                        const breached = !!slaData.response_breached;
                        const met = !!slaData.response_met_at;
                        const remaining = getSlaRemaining(slaData.response_due_at, slaData.response_remaining_ms);
                        return (
                          <div className={cn(
                            "rounded-xl border p-4",
                            breached ? "border-rose-500/30 bg-rose-500/5"
                              : met ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-[var(--border-default)] bg-[var(--bg-base)]"
                          )}>
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Response SLA</span>
                              <Badge tone={breached ? "rose" : met ? "emerald" : "amber"} className="text-xs">
                                {breached ? "Breached" : met ? "Met" : "Pending"}
                              </Badge>
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--fg-muted)]">Due at</span>
                                <span className="text-[var(--fg-primary)] font-medium">{formatDate(slaData.response_due_at)}</span>
                              </div>
                              {met && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Met at</span>
                                  <span className="text-emerald-400 font-medium">{formatDate(slaData.response_met_at)}</span>
                                </div>
                              )}
                              {!met && !breached && remaining && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Remaining</span>
                                  <span className={cn("font-semibold", remaining.tone === "rose" ? "text-rose-400" : remaining.tone === "amber" ? "text-amber-400" : "text-emerald-400")}>
                                    {remaining.text}
                                  </span>
                                </div>
                              )}
                              {breached && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Breached</span>
                                  <span className="text-rose-400 font-semibold">{remaining ? remaining.text : "Yes"}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Resolution SLA */}
                      {(() => {
                        const breached = !!slaData.resolve_breached;
                        const met = !!slaData.resolve_met_at;
                        const remaining = getSlaRemaining(slaData.resolve_due_at, slaData.resolve_remaining_ms);
                        return (
                          <div className={cn(
                            "rounded-xl border p-4",
                            breached ? "border-rose-500/30 bg-rose-500/5"
                              : met ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-[var(--border-default)] bg-[var(--bg-base)]"
                          )}>
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Resolution SLA</span>
                              <Badge tone={breached ? "rose" : met ? "emerald" : "amber"} className="text-xs">
                                {breached ? "Breached" : met ? "Met" : "Pending"}
                              </Badge>
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--fg-muted)]">Due at</span>
                                <span className="text-[var(--fg-primary)] font-medium">{formatDate(slaData.resolve_due_at)}</span>
                              </div>
                              {met && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Met at</span>
                                  <span className="text-emerald-400 font-medium">{formatDate(slaData.resolve_met_at)}</span>
                                </div>
                              )}
                              {!met && !breached && remaining && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Remaining</span>
                                  <span className={cn("font-semibold", remaining.tone === "rose" ? "text-rose-400" : remaining.tone === "amber" ? "text-amber-400" : "text-emerald-400")}>
                                    {remaining.text}
                                  </span>
                                </div>
                              )}
                              {breached && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Breached</span>
                                  <span className="text-rose-400 font-semibold">{remaining ? remaining.text : "Yes"}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Triage SLA — only for tickets that passed through the NOC queue */}
                      {slaData.triage_present && (() => {
                        const met = !!slaData.triage_met_at;        // reassigned out of NOC
                        const breached = !!slaData.triage_breached; // missed the target
                        const metLate = met && breached;            // reassigned, but after the target
                        const overdue = !met && breached;           // still in NOC, past the target
                        // For an overdue row the server clamps remaining to 0, so derive the
                        // real overdue magnitude from the due date (null → wall-clock fallback).
                        const remaining = getSlaRemaining(slaData.triage_due_at, overdue ? null : slaData.triage_remaining_ms);
                        return (
                          <div className={cn(
                            "rounded-xl border p-4",
                            overdue ? "border-rose-500/30 bg-rose-500/5"
                              : metLate ? "border-amber-500/30 bg-amber-500/5"
                              : met ? "border-emerald-500/30 bg-emerald-500/5"
                              : "border-[var(--border-default)] bg-[var(--bg-base)]"
                          )}>
                            <div className="flex items-center justify-between mb-4">
                              <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Triage SLA</span>
                              <Badge tone={met ? (metLate ? "amber" : "emerald") : breached ? "rose" : "amber"} className="text-xs">
                                {met ? (metLate ? "Met late" : "Met") : breached ? "Breached" : "Pending"}
                              </Badge>
                            </div>
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--fg-muted)]">Target</span>
                                <span className="text-[var(--fg-primary)] font-medium">{slaData.triage_minutes ?? "N/A"}m to reassign</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-[var(--fg-muted)]">Due at</span>
                                <span className="text-[var(--fg-primary)] font-medium">{formatDate(slaData.triage_due_at)}</span>
                              </div>
                              {met && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Reassigned</span>
                                  <span className={cn("font-medium", metLate ? "text-amber-400" : "text-emerald-400")}>{formatDate(slaData.triage_met_at)}</span>
                                </div>
                              )}
                              {!met && !breached && remaining && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Remaining</span>
                                  <span className={cn("font-semibold", remaining.tone === "rose" ? "text-rose-400" : remaining.tone === "amber" ? "text-amber-400" : "text-emerald-400")}>
                                    {remaining.text}
                                  </span>
                                </div>
                              )}
                              {overdue && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-[var(--fg-muted)]">Overdue</span>
                                  <span className="text-rose-400 font-semibold">{remaining ? remaining.text : "Yes"}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* SLA Timeline */}
                    <div className="rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[var(--border-default)]">
                        <h3 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">SLA Timeline</h3>
                      </div>
                      <div className="p-4">
                        {slaHistory.length > 0 ? (
                          <div className="space-y-3">
                            {slaHistory.map((event, idx) => {
                              const isPaused = event.event_type === "sla.paused";
                              return (
                                <div key={idx} className="flex items-start gap-3">
                                  <div className={cn(
                                    "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5",
                                    isPaused ? "bg-amber-500/10" : "bg-emerald-500/10"
                                  )}>
                                    <Icon
                                      name={isPaused ? "pause" : "play"}
                                      size={14}
                                      className={isPaused ? "text-amber-400" : "text-emerald-400"}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-[var(--fg-secondary)]">
                                      <span className={cn("font-medium", isPaused ? "text-amber-400" : "text-emerald-400")}>
                                        {isPaused ? "SLA Paused" : "SLA Resumed"}
                                      </span>
                                      {event.actor_name && (
                                        <> by <span className="font-medium text-[var(--accent)]">{event.actor_name}</span></>
                                      )}
                                    </p>
                                    <p className="text-xs text-[var(--fg-muted)] mt-0.5">{formatDate(event.created_at)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--fg-muted)] text-center py-4">No SLA events recorded</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ═══ APPROVALS TAB ═══ */}
            {activeTab === "approvals" && (
              <div className="space-y-5">
                {!approvalData || approvalData.length === 0 ? (
                  <EmptyState
                    icon="shield"
                    title="No approval data"
                    description="This ticket has no approval workflow records."
                    compact
                  />
                ) : (() => {
                  const sorted = [...approvalData].sort((a, b) => a.approval_level - b.approval_level);
                  const levels = {};
                  sorted.forEach((a) => {
                    if (!levels[a.approval_level]) levels[a.approval_level] = [];
                    levels[a.approval_level].push(a);
                  });
                  const totalLevels = Object.keys(levels).length;
                  const allApproved = sorted.every(a => a.status === "approved" || a.status === "auto_approved");
                  const anyRejected = sorted.some(a => a.status === "rejected");

                  return (
                    <>
                      {/* Overall Status Banner */}
                      <div className={cn(
                        "rounded-xl border p-4 flex items-center gap-3",
                        allApproved ? "border-emerald-500/30 bg-emerald-500/5"
                          : anyRejected ? "border-rose-500/30 bg-rose-500/5"
                          : "border-amber-500/30 bg-amber-500/5"
                      )}>
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                          allApproved ? "bg-emerald-500/10" : anyRejected ? "bg-rose-500/10" : "bg-amber-500/10"
                        )}>
                          <Icon
                            name={allApproved ? "checkCircle" : anyRejected ? "close" : "clock"}
                            size={20}
                            className={allApproved ? "text-emerald-400" : anyRejected ? "text-rose-400" : "text-amber-400"}
                          />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">
                            {allApproved ? "Fully Approved" : anyRejected ? "Rejected" : "Pending Approval"}
                          </h3>
                          <p className="text-xs text-[var(--fg-muted)]">
                            {totalLevels} level{totalLevels > 1 ? "s" : ""} · {sorted.length} approver{sorted.length > 1 ? "s" : ""} · {ticket.approval_status}
                          </p>
                        </div>
                      </div>

                      {/* Approval Levels */}
                      <div className="space-y-3">
                        {Object.entries(levels).map(([level, approvers]) => {
                          const levelApproved = approvers.every(a => a.status === "approved" || a.status === "auto_approved");
                          const levelRejected = approvers.some(a => a.status === "rejected");
                          const levelPending = approvers.some(a => a.status === "pending");
                          return (
                            <div key={level} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden">
                              <div className="px-4 py-3 border-b border-[var(--border-default)] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                                    levelApproved ? "bg-emerald-500/20 text-emerald-400"
                                      : levelRejected ? "bg-rose-500/20 text-rose-400"
                                      : "bg-amber-500/20 text-amber-400"
                                  )}>
                                    {levelApproved ? <Icon name="check" size={12} /> : levelRejected ? <Icon name="close" size={12} /> : level}
                                  </div>
                                  <span className="text-sm font-semibold text-[var(--fg-primary)]">Level {level}</span>
                                  {approvers[0]?.rule_name && (
                                    <span className="text-xs text-[var(--fg-muted)]">· {approvers[0].rule_name}</span>
                                  )}
                                </div>
                                <Badge
                                  tone={levelApproved ? "emerald" : levelRejected ? "rose" : "amber"}
                                  className="text-xs"
                                >
                                  {levelApproved ? "Approved" : levelRejected ? "Rejected" : "Pending"}
                                </Badge>
                              </div>
                              <div className="divide-y divide-[var(--border-default)]">
                                {approvers.map((a) => (
                                  <div key={a.id} className="px-4 py-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent)]">
                                          {(a.approver_name || "?")[0].toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium text-[var(--fg-primary)]">{a.approver_name}</p>
                                          <p className="text-[10px] text-[var(--fg-muted)]">
                                            Sent {a.created_at ? new Date(a.created_at).toLocaleString("en-FJ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <Badge
                                          tone={(a.status === "approved" || a.status === "auto_approved") ? "emerald" : a.status === "rejected" ? "rose" : "amber"}
                                          className="text-xs capitalize"
                                        >
                                          {a.status === "auto_approved" ? "Auto Approved" : a.status}
                                        </Badge>
                                        {a.approved_at && (
                                          <p className="text-[10px] text-[var(--fg-muted)] mt-0.5">
                                            {new Date(a.approved_at).toLocaleString("en-FJ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    {/* Approval SLA info */}
                                    {a.sla_due_at && (
                                      <div className="ml-11 flex items-center gap-3 text-[11px]">
                                        <span className="text-[var(--fg-muted)]">
                                          <Icon name="clock" size={11} className="inline mr-1" />
                                          SLA: {a.sla_target_minutes ? `${a.sla_target_minutes}m target` : ""}
                                        </span>
                                        <span className="text-[var(--fg-muted)]">
                                          Due {new Date(a.sla_due_at).toLocaleString("en-FJ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                                        </span>
                                        {a.sla_met ? (
                                          <Badge tone="emerald" className="text-[10px] py-0">✓ SLA Met</Badge>
                                        ) : a.sla_breached ? (
                                          <Badge tone="rose" className="text-[10px] py-0">SLA Breached</Badge>
                                        ) : (
                                          <Badge tone="amber" className="text-[10px] py-0">SLA Pending</Badge>
                                        )}
                                      </div>
                                    )}
                                    {/* Full approver comment */}
                                    {a.approver_comments && (
                                      <div className="ml-11 rounded-md bg-[var(--bg-sunken)] px-3 py-2">
                                        <p className="text-xs text-[var(--fg-secondary)] italic">"{a.approver_comments}"</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Right: Properties Sidebar */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Details Panel */}
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "150ms" }}>
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                  <Icon name="info" size={16} />
                </span>
                <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Details</h2>
              </div>
              <div className="py-1.5">

              {/* Status */}
              <DetailRow label="Status" icon="activity">
                {isAgent ? (
                  <DetailSelect
                    value={ticket.status_id}
                    onChange={(v) => handleUpdateField("status_id", parseInt(v))}
                    options={statuses.map((s) => ({ value: s.id, label: s.label }))}
                  />
                ) : (
                  <Badge tone={STATUS_COLORS[ticket.status_key]} className="text-xs">{ticket.status_label}</Badge>
                )}
              </DetailRow>

              {/* Priority */}
              <DetailRow label="Priority" icon="flag">
                {isAgent ? (
                  <DetailSelect
                    value={ticket.priority_id}
                    onChange={(v) => handleUpdateField("priority_id", parseInt(v))}
                    options={priorities.map((p) => ({ value: p.id, label: p.label }))}
                  />
                ) : (
                  <Badge tone={PRIORITY_COLORS[ticket.priority_key]} className="text-xs">{ticket.priority_label}</Badge>
                )}
              </DetailRow>

              {/* Assignee */}
              <DetailRow label="Assignee" icon="userCheck">
                {isAgent ? (
                  <DetailSelect
                    value={ticket.assignee_id || ""}
                    onChange={(v) => handleUpdateField("assignee_id", v ? parseInt(v) : null)}
                    options={[{ value: "", label: "Unassigned" }, ...teamMembers.map((m) => ({ value: m.id, label: m.full_name || m.email }))]}
                    placeholder="Unassigned"
                    disabled={!ticket.team_id}
                    muted={!ticket.assignee_id}
                  />
                ) : (
                  <span className="text-sm text-[var(--fg-primary)]">{ticket.assignee_name || <span className="text-[var(--fg-muted)]">Unassigned</span>}</span>
                )}
              </DetailRow>

              {/* Team */}
              <DetailRow label="Team" icon="users">
                {isAgent ? (
                  <DetailSelect
                    value={ticket.team_id || ""}
                    onChange={(v) => handleUpdateField("team_id", v ? parseInt(v) : null)}
                    options={[{ value: "", label: "None" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                    placeholder="None"
                    muted={!ticket.team_id}
                  />
                ) : (
                  <span className="text-sm text-[var(--fg-primary)]">{ticket.team_name || <span className="text-[var(--fg-muted)]">None</span>}</span>
                )}
              </DetailRow>

              {/* Requester */}
              <DetailRow label="Requester" icon="user">
                <div className="flex items-start gap-2 justify-end">
                  <div className="min-w-0 text-right">
                    <span className="block text-sm text-[var(--fg-primary)]">{ticket.requester_name}</span>
                    {(ticket.requester_title || ticket.requester_company) && (
                      <span className="block text-[11px] text-[var(--fg-muted)] leading-tight mt-0.5">
                        {[ticket.requester_title, ticket.requester_company].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                  <div className="h-5 w-5 mt-0.5 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[10px] font-bold text-[var(--accent)] shrink-0">
                    {getInitial(ticket.requester_name)}
                  </div>
                </div>
              </DetailRow>

              {/* Created */}
              <DetailRow label="Created" icon="calendar">
                <span className="text-sm text-[var(--fg-secondary)]">{getTimeAgo(ticket.created_at)}</span>
              </DetailRow>

              {/* Updated */}
              <DetailRow label="Updated" icon="clock">
                <span className="text-sm text-[var(--fg-secondary)]">{getTimeAgo(ticket.updated_at)}</span>
              </DetailRow>
              </div>
            </div>

            {/* SLA Panel */}
            {slaData && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "180ms" }}>
                <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                      <Icon name="sla" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">SLA</h2>
                  </span>
                  <span className="text-[11px] text-[var(--fg-muted)] truncate">{slaData.policy_name}</span>
                </div>
                <div className="p-4 space-y-2.5">
                  {(() => {
                    const r = getSlaRemaining(slaData.response_due_at, slaData.response_remaining_ms);
                    const met = !!slaData.response_met_at;
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--fg-muted)]">Response</span>
                        {slaData.response_breached ? (
                          <Badge tone="rose" className="text-xs">Breached</Badge>
                        ) : met ? (
                          <span className="text-xs font-medium text-emerald-400">✓ Met</span>
                        ) : r ? (
                          <span className={`text-xs font-medium ${r.tone === "rose" ? "text-rose-400" : r.tone === "amber" ? "text-amber-400" : "text-emerald-400"}`}>{r.text}</span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-400">Met</span>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const r = getSlaRemaining(slaData.resolve_due_at, slaData.resolve_remaining_ms);
                    const met = !!slaData.resolve_met_at;
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--fg-muted)]">Resolution</span>
                        {slaData.resolve_breached ? (
                          <Badge tone="rose" className="text-xs">Breached</Badge>
                        ) : met ? (
                          <span className="text-xs font-medium text-emerald-400">✓ Met</span>
                        ) : r ? (
                          <span className={`text-xs font-medium ${r.tone === "rose" ? "text-rose-400" : r.tone === "amber" ? "text-amber-400" : "text-emerald-400"}`}>{r.text}</span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-400">Met</span>
                        )}
                      </div>
                    );
                  })()}
                  {/* NOC triage SLA — only for tickets that passed through the NOC queue */}
                  {slaData.triage_present && (() => {
                    const met = !!slaData.triage_met_at;
                    const breached = !!slaData.triage_breached;
                    const metLate = met && breached;
                    const r = getSlaRemaining(slaData.triage_due_at, (!met && breached) ? null : slaData.triage_remaining_ms);
                    return (
                      <div className="flex items-center justify-between border-t border-[var(--border-default)] pt-2.5">
                        <span className="text-xs text-[var(--fg-muted)]">Triage</span>
                        {met ? (
                          <span className={`text-xs font-medium ${metLate ? "text-amber-400" : "text-emerald-400"}`}>{metLate ? "Met late" : "✓ Met"}</span>
                        ) : breached ? (
                          <Badge tone="rose" className="text-xs">Breached</Badge>
                        ) : r ? (
                          <span className={`text-xs font-medium ${r.tone === "rose" ? "text-rose-400" : r.tone === "amber" ? "text-amber-400" : "text-emerald-400"}`}>{r.text}</span>
                        ) : (
                          <span className="text-xs font-medium text-emerald-400">Met</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Teams Panel */}
            {isAgent && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "210ms" }}>
                <div className={`px-5 py-4 flex items-center justify-between${ticketTeams.length > 0 ? " border-b border-[var(--border-default)]" : ""}`}>
                  <span className="flex items-center gap-2.5">
                    <span className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                      <Icon name="teams" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Teams</h2>
                  </span>
                  <button
                    onClick={() => setShowAddTeamModal(true)}
                    className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    <Icon name="plus" size={11} /> Add
                  </button>
                </div>
                {ticketTeams.length > 0 && (
                <div className="p-3 space-y-2">
                  {ticketTeams.map((tt) => (
                      <div key={tt.team_id} className="p-2 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--fg-primary)] font-medium">{tt.team_name}</span>
                            {tt.is_primary && (
                              <Badge tone="blue" className="text-[10px]">Primary</Badge>
                            )}
                          </div>
                          <Badge
                            tone={tt.status === "completed" ? "emerald" : tt.status === "transferred" ? "slate" : "amber"}
                            className="text-[10px] capitalize"
                          >
                            {tt.status}
                          </Badge>
                        </div>
                        {tt.status === "completed" && tt.completed_at && (
                          <p className="text-[10px] text-[var(--fg-muted)] mt-1">
                            Completed {getTimeAgo(tt.completed_at)}
                            {tt.completion_notes && `: ${tt.completion_notes}`}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-2">
                          {tt.status === "active" ? (
                            <button
                              onClick={() => handleCompleteTeamWork(tt.team_id)}
                              className="flex-1 py-1 px-2 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            >
                              Mark Complete
                            </button>
                          ) : tt.status === "completed" && (
                            <button
                              onClick={() => handleReopenTeamWork(tt.team_id)}
                              className="flex-1 py-1 px-2 text-[10px] font-medium rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                            >
                              Reopen
                            </button>
                          )}
                          {!tt.is_primary && tt.status !== "completed" && (
                            <>
                              <button
                                onClick={() => handleSetPrimaryTeam(tt.team_id)}
                                className="p-1 text-[var(--fg-muted)] hover:text-blue-400"
                                title="Set as primary"
                              >
                                <Icon name="star" size={12} />
                              </button>
                              <button
                                onClick={() => handleRemoveTeam(tt.team_id)}
                                className="p-1 text-[var(--fg-muted)] hover:text-rose-400"
                                title="Remove team"
                              >
                                <Icon name="close" size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  }
                  {ticketTeams.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-default)]">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[var(--fg-muted)]">Progress</span>
                        <span className="text-[var(--fg-primary)] font-medium">
                          {ticketTeams.filter(t => t.status === "completed").length}/{ticketTeams.length} teams complete
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(ticketTeams.filter(t => t.status === "completed").length / ticketTeams.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* Customer Forms Panel */}
            {isAgent && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "240ms" }}>
                <div className={`px-5 py-4 flex items-center justify-between${ticketForms.length > 0 ? " border-b border-[var(--border-default)]" : ""}`}>
                  <span className="flex items-center gap-2.5">
                    <span className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                      <Icon name="send" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Customer Forms</h2>
                  </span>
                  <button
                    onClick={handleOpenSendForm}
                    className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    <Icon name="plus" size={11} /> Send
                  </button>
                </div>
                {ticketForms.length > 0 && (
                  <div className="p-3 space-y-2">
                    {ticketForms.map((fi) => (
                      <div key={fi.id} className="p-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--fg-primary)] font-medium truncate">{fi.form_name}</span>
                          <Badge
                            tone={fi.status === "completed" ? "emerald" : fi.status === "revoked" ? "slate" : "amber"}
                            className="text-[10px] capitalize shrink-0"
                            dot={fi.status === "pending"}
                          >
                            {fi.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-[var(--fg-muted)] mt-1 truncate">
                          {fi.recipient_email}
                          {fi.status === "completed" && fi.submitted_at && ` · ${getTimeAgo(fi.submitted_at)}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          {fi.status === "pending" && (
                            <button
                              onClick={() => copyFormLink(fi.token)}
                              className="flex-1 py-1 px-2 text-[10px] font-medium rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors"
                            >
                              Copy link
                            </button>
                          )}
                          {fi.status === "completed" && (
                            <button
                              onClick={() => setViewFormInvite(fi)}
                              className="flex-1 py-1 px-2 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            >
                              View response
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Approval Panel */}
            {ticket.approval_status && ticket.approval_status !== "not_required" && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "270ms" }}>
                <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center">
                      <Icon name="shield" size={16} />
                    </span>
                    <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Approval</h2>
                  </span>
                  <Badge
                    tone={ticket.approval_status === "approved" ? "emerald" : ticket.approval_status === "rejected" ? "rose" : "amber"}
                    size="sm"
                    className="capitalize"
                  >
                    {ticket.approval_status}
                  </Badge>
                </div>
                {approvalData && approvalData.length > 0 && (
                  <div className="p-4 space-y-2">
                    {[...approvalData].sort((a, b) => a.approval_level - b.approval_level).map((approval, idx, arr) => {
                      const prevApproved = arr.slice(0, idx).every(a => a.status === "approved" || a.status === "auto_approved");
                      const isActive = approval.status === "pending" && prevApproved;
                      return (
                        <div key={approval.id} className={cn(
                          "flex items-center justify-between text-xs rounded-lg px-2.5 py-2",
                          isActive ? "bg-amber-500/10 border border-amber-500/20" : "bg-[var(--bg-base)] border border-[var(--border-default)]"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-semibold",
                              isActive ? "text-amber-400" : "text-[var(--fg-muted)]"
                            )}>L{approval.approval_level}</span>
                            <span className="text-[var(--fg-secondary)] truncate max-w-[100px]">{approval.approver_name}</span>
                            {approval.rule_name && <span className="text-[var(--fg-muted)] italic truncate">{approval.rule_name}</span>}
                          </div>
                          <span className={cn(
                            "capitalize font-medium",
                            (approval.status === "approved" || approval.status === "auto_approved") && "text-emerald-400",
                            approval.status === "rejected" && "text-rose-400",
                            approval.status === "pending" && (isActive ? "text-amber-400" : "text-[var(--fg-muted)]")
                          )}>
                            {approval.status === "auto_approved" ? "auto" : approval.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Customer resolution confirmation — solved tickets awaiting the requester */}
            {ticket.status_key === "solved" && !isAgent && (
              <div className="rounded-2xl border border-emerald-500/30 bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "270ms" }}>
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                  <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Icon name="checkCircle" size={16} />
                  </span>
                  <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Is this resolved?</h2>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                    Your ticket was marked solved. Confirm to close it, or reopen if you still need help.
                    It will close automatically in 3 days if you don't respond.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleQuickStatus("closed")} loading={actionLoading === "closed"} className="flex-1">
                      <Icon name="check" size={14} className="mr-1.5" /> Confirm &amp; close
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleQuickStatus("open")} loading={actionLoading === "open"} className="flex-1">
                      <Icon name="refresh" size={14} className="mr-1.5" /> Reopen
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* CSAT Rating Panel - shown for solved/closed tickets */}
            {(ticket.status_key === "solved" || ticket.status_key === "closed") && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "300ms" }}>
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
                  <span className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Icon name="star" size={16} />
                  </span>
                  <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Satisfaction Rating</h2>
                </div>
                <div className="p-4 space-y-3">
                  {csatExisting && !isAgent ? (
                    <div className="text-center">
                      <div className="flex justify-center gap-1 mb-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star} className={`text-lg ${star <= csatExisting.rating ? "text-amber-400" : "text-[var(--fg-muted)]"}`}>
                            {star <= csatExisting.rating ? "\u2605" : "\u2606"}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--fg-muted)]">You rated {csatExisting.rating}/5</p>
                      {csatExisting.comment && (
                        <p className="text-xs text-[var(--fg-secondary)] mt-1 italic">"{csatExisting.comment}"</p>
                      )}
                    </div>
                  ) : isAgent ? (
                    csatExisting ? (
                      <div className="text-center">
                        <div className="flex justify-center gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={`text-lg ${star <= csatExisting.rating ? "text-amber-400" : "text-[var(--fg-muted)]"}`}>
                              {star <= csatExisting.rating ? "\u2605" : "\u2606"}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-[var(--fg-muted)]">Rated {csatExisting.rating}/5 by {csatExisting.rated_by_name}</p>
                        {csatExisting.comment && (
                          <p className="text-xs text-[var(--fg-secondary)] mt-1 italic">"{csatExisting.comment}"</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--fg-muted)] text-center">Awaiting customer feedback</p>
                    )
                  ) : (
                    <>
                      <div className="flex justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setCsatRating(star)}
                            onMouseEnter={() => setCsatHover(star)}
                            onMouseLeave={() => setCsatHover(0)}
                            className="text-2xl transition-colors"
                          >
                            <span className={(csatHover || csatRating) >= star ? "text-amber-400" : "text-[var(--fg-muted)]"}>
                              {(csatHover || csatRating) >= star ? "\u2605" : "\u2606"}
                            </span>
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={csatComment}
                        onChange={(e) => setCsatComment(e.target.value)}
                        placeholder="Optional feedback..."
                        rows={2}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-sm text-[var(--fg-primary)] p-2 resize-none focus:outline-none focus:border-[var(--accent)]"
                      />
                      <Button
                        size="sm"
                        onClick={handleSubmitCsat}
                        loading={csatSubmitting}
                        disabled={!csatRating}
                        className="w-full"
                      >
                        Submit Rating
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Send for Approval Modal */}
      <Modal
        open={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        title="Send for Approval"
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowApprovalModal(false)}>Cancel</Button>
            <Button onClick={handleSendForApproval} loading={sendingForApproval}>
              Send for Approval
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Mode Selection */}
          <div>
            <label className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2 block">
              Approval Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApprovalMode("auto")}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                  approvalMode === "auto"
                    ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
                    : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-secondary)] hover:border-[var(--border-hover)]"
                )}
              >
                <Icon name="sitemap" size={14} className="inline mr-2" />
                Auto (Hierarchy)
              </button>
              <button
                type="button"
                onClick={() => setApprovalMode("manual")}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all border",
                  approvalMode === "manual"
                    ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
                    : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-secondary)] hover:border-[var(--border-hover)]"
                )}
              >
                <Icon name="userPlus" size={14} className="inline mr-2" />
                Manual Selection
              </button>
            </div>
          </div>

          {approvalMode === "auto" ? (
            <p className="text-sm text-[var(--fg-secondary)] bg-[var(--bg-base)] rounded-lg p-3 border border-[var(--border-default)]">
              <Icon name="info" size={14} className="inline mr-2 text-blue-400" />
              Uses the requester's manager hierarchy based on matching approval rules.
            </p>
          ) : (
            <>
              {/* Manual Approver Selection */}
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2 block">
                  Select Approvers (in order)
                </label>
                {/* Searchable Approver Input */}
                <div className="relative mb-2">
                  <div className="relative">
                    <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
                    <input
                      type="text"
                      placeholder="Search approvers by name or email..."
                      value={approverSearch}
                      onChange={(e) => {
                        setApproverSearch(e.target.value);
                        setShowApproverDropdown(true);
                      }}
                      onFocus={() => setShowApproverDropdown(true)}
                      className={cn(
                        "w-full pl-9 pr-3 py-2 rounded-lg text-sm transition-all",
                        "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                        "placeholder:text-[var(--fg-muted)]",
                        "border border-[var(--border-default)]",
                        "focus:outline-none focus:border-[var(--accent)]"
                      )}
                    />
                  </div>
                  {/* Dropdown Results */}
                  {showApproverDropdown && (
                    <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg">
                      {(() => {
                        const filtered = availableApprovers
                          .filter(a => !selectedApprovers.some(s => s.user_id === a.id))
                          .filter(a => {
                            if (!approverSearch.trim()) return true;
                            const search = approverSearch.toLowerCase();
                            return (
                              a.full_name?.toLowerCase().includes(search) ||
                              a.email?.toLowerCase().includes(search)
                            );
                          });

                        if (filtered.length === 0) {
                          return (
                            <div className="px-3 py-2 text-sm text-[var(--fg-muted)]">
                              {approverSearch.trim() ? "No matching approvers found" : "No approvers available"}
                            </div>
                          );
                        }

                        return filtered.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              handleAddApprover(a.id);
                              setApproverSearch("");
                              setShowApproverDropdown(false);
                            }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-sm transition-colors",
                              "hover:bg-[var(--bg-base)]",
                              "flex items-center gap-2"
                            )}
                          >
                            <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-xs font-medium text-[var(--accent)]">
                              {a.full_name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[var(--fg-primary)] truncate">{a.full_name}</div>
                              <div className="text-xs text-[var(--fg-muted)] truncate">{a.email}</div>
                            </div>
                          </button>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                {/* Click outside to close dropdown */}
                {showApproverDropdown && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowApproverDropdown(false)}
                  />
                )}

                {/* Selected Approvers List */}
                {selectedApprovers.length > 0 && (
                  <div className="space-y-2">
                    {selectedApprovers.map((approver, idx) => {
                      const sameAsAbove = idx > 0 && approver.level === selectedApprovers[idx - 1].level;
                      return (
                        <div
                          key={approver.user_id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border",
                            "bg-[var(--bg-base)] border-[var(--border-default)]"
                          )}
                        >
                          <span className={cn(
                            "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                            sameAsAbove ? "bg-amber-500/10 text-amber-400" : "bg-[var(--accent)]/10 text-[var(--accent)]"
                          )}>
                            {approver.level}
                          </span>
                          <span className="flex-1 text-sm text-[var(--fg-primary)]">{approver.name}</span>
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSetSameLevel(approver.user_id, !sameAsAbove)}
                              className={cn(
                                "text-xs px-2 py-1 rounded transition-colors",
                                sameAsAbove
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)]"
                              )}
                              title={sameAsAbove ? "Requires both to approve" : "Set same level as above"}
                            >
                              {sameAsAbove ? "Parallel" : "Sequential"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleMoveApprover(approver.user_id, "up")}
                            disabled={idx === 0}
                            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] disabled:opacity-30"
                          >
                            <Icon name="chevronUp" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveApprover(approver.user_id, "down")}
                            disabled={idx === selectedApprovers.length - 1}
                            className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] disabled:opacity-30"
                          >
                            <Icon name="chevronDown" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveApprover(approver.user_id)}
                            className="p-1 text-rose-400 hover:text-rose-300"
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedApprovers.length === 0 && (
                  <p className="text-xs text-[var(--fg-muted)] text-center py-4">
                    No approvers selected. Add at least one approver.
                  </p>
                )}
              </div>

              {/* Require All Toggle */}
              {selectedApprovers.some((a, i, arr) => i > 0 && a.level === arr[i-1].level) && (
                <label className="flex items-center gap-2 text-sm text-[var(--fg-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireAllApprovers}
                    onChange={(e) => setRequireAllApprovers(e.target.checked)}
                    className="rounded border-[var(--border-default)] text-[var(--accent)] focus:ring-[var(--accent)] bg-[var(--bg-base)]"
                  />
                  All parallel approvers must approve (otherwise any one can approve)
                </label>
              )}
            </>
          )}

          {/* After Approval Section */}
          <div className="rounded-lg border border-[var(--border-default)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg-base)] border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2">
                <Icon name="arrowRight" size={14} className="text-[var(--fg-muted)]" />
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">After Approval</span>
              </div>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-xs text-[var(--fg-muted)]">Configure what happens after the ticket is approved</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-secondary)] mb-1.5">
                    <Icon name="userPlus" size={12} />
                    Assign to Agent
                  </label>
                  <select
                    value={returnToAgent}
                    onChange={(e) => setReturnToAgent(e.target.value)}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm transition-all",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    )}
                  >
                    <option value="">Stay in queue</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--fg-secondary)] mb-1.5">
                    <Icon name="teams" size={12} />
                    Move to Team
                  </label>
                  <select
                    value={returnToQueue}
                    onChange={(e) => setReturnToQueue(e.target.value)}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-sm transition-all",
                      "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    )}
                  >
                    <option value="">Keep current team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="edit" size={14} className="text-[var(--fg-muted)]" />
              <label className="text-sm font-medium text-[var(--fg-primary)]">Notes for Approvers</label>
              <span className="text-xs text-[var(--fg-muted)]">(optional)</span>
            </div>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Provide context or instructions for the approvers..."
              rows={3}
              className={cn(
                "w-full px-3 py-2.5 rounded-lg text-sm resize-none transition-all",
                "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                "placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            />
          </div>
        </div>
      </Modal>

      {/* Reassign Modal */}
      <Modal
        open={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        title="Flag back to NOC"
        subtitle="Send this misrouted request to the NOC queue — they'll re-route it to the right team."
        size="sm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowFlagModal(false)}>Cancel</Button>
            <Button onClick={submitFlagToNoc} loading={flagging} icon={<Icon name="inbox" size={14} />}>
              Flag to NOC
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <Icon name="alertTriangle" size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--fg-secondary)]">
              This unassigns the ticket and moves it to the NOC queue. As a non-NOC engineer you can't reassign across teams directly — NOC will route it for you.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--fg-primary)] mb-1.5">Reason (optional)</label>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={3}
              placeholder="e.g. This is a Cloud issue, not Transmission"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm resize-none bg-[var(--bg-base)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] border border-[var(--border-default)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        title={isNocMember ? "Triage Ticket" : "Reassign Ticket"}
        size="sm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowReassignModal(false)}>Cancel</Button>
            <Button onClick={handleReassign} loading={reassigning}>
              <Icon name="arrowRight" size={14} className="mr-1.5" />
              {isNocMember ? "Triage Ticket" : "Reassign Ticket"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Current Assignment Info */}
          {(ticket?.team_name || ticket?.assignee_name) && (
            <div className="p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="info" size={14} className="text-blue-400" />
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Current Assignment</span>
              </div>
              <div className="flex items-center gap-3">
                {ticket?.team_name && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                      <Icon name="teams" size={16} className="text-[var(--accent)]" />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--fg-muted)]">Team</p>
                      <p className="text-sm font-medium text-[var(--fg-primary)]">{ticket.team_name}</p>
                    </div>
                  </div>
                )}
                {ticket?.team_name && ticket?.assignee_name && (
                  <Icon name="arrowRight" size={14} className="text-[var(--fg-muted)]" />
                )}
                {ticket?.assignee_name && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-400">
                      {ticket.assignee_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs text-[var(--fg-muted)]">Assignee</p>
                      <p className="text-sm font-medium text-[var(--fg-primary)]">{ticket.assignee_name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* New Assignment Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[var(--border-default)]" />
              <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider px-2">New Assignment</span>
              <div className="h-px flex-1 bg-[var(--border-default)]" />
            </div>

            {/* Team Selection */}
            <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                  <Icon name="teams" size={16} className="text-[var(--accent)]" />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-[var(--fg-primary)]">Team</label>
                  <p className="text-xs text-[var(--fg-muted)]">Select which team should handle this</p>
                </div>
              </div>
              <select
                value={reassignTeamId}
                onChange={(e) => handleReassignTeamChange(e.target.value)}
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                  "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                  "border border-[var(--border-default)]",
                  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                )}
              >
                <option value="">Select a team...</option>
                {reassignTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Assignee Selection */}
            <div className={cn(
              "p-3 rounded-lg border bg-[var(--bg-elevated)] transition-all",
              reassignTeamId ? "border-[var(--border-default)]" : "border-dashed border-[var(--border-default)] opacity-60"
            )}>
              <div className="flex items-center gap-2 mb-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  reassignTeamId ? "bg-emerald-500/10" : "bg-[var(--bg-base)]"
                )}>
                  <Icon name="userPlus" size={16} className={reassignTeamId ? "text-emerald-400" : "text-[var(--fg-muted)]"} />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-[var(--fg-primary)]">Assignee</label>
                  <p className="text-xs text-[var(--fg-muted)]">
                    {reassignTeamId ? "Choose a team member" : "Select a team first"}
                  </p>
                </div>
              </div>
              <select
                value={reassignAgentId}
                onChange={(e) => setReassignAgentId(e.target.value)}
                disabled={!reassignTeamId}
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                  "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                  "border border-[var(--border-default)]",
                  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                  !reassignTeamId && "cursor-not-allowed"
                )}
              >
                <option value="">Leave unassigned</option>
                {reassignTeamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="edit" size={14} className="text-[var(--fg-muted)]" />
              <label className="text-sm font-medium text-[var(--fg-primary)]">Requirements</label>
              {(reassignTeamId ? parseInt(reassignTeamId) : null) !== (ticket?.team_id ?? null)
                ? <span className="text-xs text-rose-400">(required)</span>
                : <span className="text-xs text-[var(--fg-muted)]">(optional)</span>}
            </div>
            <textarea
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Describe the requirements — what the receiving team needs to do..."
              rows={3}
              className={cn(
                "w-full px-3 py-2.5 rounded-lg text-sm resize-none transition-all",
                "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                "placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            />
          </div>
        </div>
      </Modal>

      {/* Add Team Modal */}
      <Modal
        open={showAddTeamModal}
        onClose={() => setShowAddTeamModal(false)}
        title="Add Team to Ticket"
        size="sm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowAddTeamModal(false)}>Cancel</Button>
            <Button onClick={handleAddTeam} loading={addingTeam} disabled={!newTeamId}>
              <Icon name="plus" size={14} className="mr-1.5" />
              Add Team
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Info Banner */}
          <div className="flex gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Icon name="info" size={16} className="text-blue-400" />
            </div>
            <div className="text-sm text-[var(--fg-secondary)]">
              <p>Adding a team allows multiple teams to collaborate on this ticket.</p>
              <p className="text-xs text-[var(--fg-muted)] mt-1">Each team can mark their work as complete independently.</p>
            </div>
          </div>

          {/* Currently Assigned Teams */}
          {ticketTeams.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="teams" size={14} className="text-[var(--fg-muted)]" />
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Currently Assigned</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ticketTeams.map(tt => (
                  <div
                    key={tt.team_id}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                      tt.is_primary
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
                        : "bg-[var(--bg-base)] text-[var(--fg-secondary)] border border-[var(--border-default)]"
                    )}
                  >
                    <span>{tt.team_name}</span>
                    {tt.is_primary && <Badge tone="blue" className="text-[9px] py-0">Primary</Badge>}
                    {tt.status === "completed" && <Icon name="checkCircle" size={12} className="text-emerald-400" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Selection */}
          <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <Icon name="plus" size={20} className="text-[var(--accent)]" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-[var(--fg-primary)]">Select Team</label>
                <p className="text-xs text-[var(--fg-muted)]">Choose a team to add to this ticket</p>
              </div>
            </div>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className={cn(
                "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            >
              <option value="">Select a team...</option>
              {teams
                .filter(t => !ticketTeams.some(tt => tt.team_id === t.id) && t.id !== ticket?.team_id)
                .map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))
              }
            </select>
            {teams.filter(t => !ticketTeams.some(tt => tt.team_id === t.id) && t.id !== ticket?.team_id).length === 0 && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                <Icon name="alertTriangle" size={12} />
                All teams are already assigned to this ticket
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon name="edit" size={14} className="text-[var(--fg-muted)]" />
              <label className="text-sm font-medium text-[var(--fg-primary)]">Notes</label>
              <span className="text-xs text-[var(--fg-muted)]">(optional)</span>
            </div>
            <textarea
              value={newTeamNotes}
              onChange={(e) => setNewTeamNotes(e.target.value)}
              placeholder="Describe what this team will be responsible for..."
              rows={3}
              className={cn(
                "w-full px-3 py-2.5 rounded-lg text-sm resize-none transition-all",
                "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                "placeholder:text-[var(--fg-muted)]",
                "border border-[var(--border-default)]",
                "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              )}
            />
          </div>
        </div>
      </Modal>
      {/* Send Customer Form Modal */}
      <Modal
        open={showSendFormModal}
        onClose={() => setShowSendFormModal(false)}
        title="Send a customer form"
        subtitle="The response attaches to this ticket automatically"
        size="md"
        actions={
          sentFormLink ? (
            <Button variant="secondary" onClick={() => setShowSendFormModal(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowSendFormModal(false)}>Cancel</Button>
              <Button onClick={handleSendFormInvite} loading={sendingFormInvite} icon={<Icon name="send" size={14} />}>
                Create form link
              </Button>
            </>
          )
        }
      >
        {sentFormLink ? (
          <div className="text-center py-3 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto animate-scale-in">
              <Icon name="checkCircle" size={26} />
            </div>
            <p className="text-sm text-[var(--fg-secondary)]">
              Share this one-time link with{" "}
              <strong className="text-[var(--fg-primary)]">{sendFormEmail}</strong>
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)]">
              <Icon name="link" size={14} className="text-[var(--fg-muted)] shrink-0" />
              <code className="flex-1 text-[12px] text-[var(--fg-secondary)] truncate text-left">{sentFormLink}</code>
              <Button
                size="xs"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sentFormLink);
                    toast.success("Link copied");
                  } catch {
                    toast.error("Copy manually");
                  }
                }}
                icon={<Icon name="copy" size={12} />}
              >
                Copy
              </Button>
            </div>
            <p className="text-[11px] text-[var(--fg-muted)] flex items-center justify-center gap-1.5">
              <Icon name="info" size={11} />
              Set the ticket to Pending while you wait — it reopens automatically on submission
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Form</label>
              <select
                value={sendFormId}
                onChange={(e) => setSendFormId(e.target.value)}
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                  "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                  "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                )}
              >
                <option value="">Choose a form…</option>
                {availableForms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Send to (email)</label>
                <input
                  type="email"
                  value={sendFormEmail}
                  onChange={(e) => setSendFormEmail(e.target.value)}
                  placeholder="customer@company.com"
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                    "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                    "placeholder:text-[var(--fg-muted)]",
                    "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Name (optional)</label>
                <input
                  type="text"
                  value={sendFormName}
                  onChange={(e) => setSendFormName(e.target.value)}
                  placeholder="Recipient name"
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                    "bg-[var(--bg-base)] text-[var(--fg-primary)]",
                    "placeholder:text-[var(--fg-muted)]",
                    "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  )}
                />
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Icon name="info" size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-[var(--fg-secondary)] leading-relaxed">
                The recipient gets a one-time link. When they submit, their response is
                attached here, the activity log records it, and a Pending ticket reopens
                automatically.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* View Form Response Modal */}
      <Modal
        open={!!viewFormInvite}
        onClose={() => setViewFormInvite(null)}
        title={`Response — ${viewFormInvite?.form_name || ""}`}
        subtitle={
          viewFormInvite &&
          `${viewFormInvite.recipient_name || viewFormInvite.recipient_email} · submitted ${formatDate(viewFormInvite.submitted_at)}`
        }
        size="lg"
        actions={<Button variant="secondary" onClick={() => setViewFormInvite(null)}>Close</Button>}
      >
        {viewFormInvite && (
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4">
            <TemplateRenderer
              schema={viewFormInvite.fields_schema || []}
              values={viewFormInvite.response_data || {}}
              readOnly
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ToolbarAction({ icon, label, onClick, loading, tone }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium",
        "transition-all duration-150 whitespace-nowrap",
        "disabled:opacity-60",
        tone === "success"
          ? "text-emerald-500 hover:bg-emerald-500/10"
          : tone === "accent"
          ? "text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/15"
          : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-elevated)] hover:shadow-[var(--shadow-sm)]"
      )}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <Icon name={icon} size={14} />
      )}
      {label}
    </button>
  );
}

function DetailRow({ label, icon, children }) {
  return (
    <div className="px-4 py-2 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface)] transition-colors group">
      <div className="flex items-center gap-2 text-[var(--fg-muted)] shrink-0 w-[88px]">
        <Icon name={icon} size={13} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex-1 min-w-0 flex justify-end">{children}</div>
    </div>
  );
}

function DetailSelect({ value, onChange, options, placeholder, disabled, muted }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className="relative w-full max-w-[164px]">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-1.5 pl-2.5 pr-2 py-1.5 text-[13px] rounded-lg border transition-all",
          "bg-[var(--bg-base)] border-[var(--border-default)]",
          open && "border-[var(--accent)] ring-2 ring-[var(--accent)]/15",
          !open && "hover:border-[var(--border-hover)]",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer",
          selected && !muted ? "text-[var(--fg-primary)]" : "text-[var(--fg-muted)]"
        )}
      >
        <span className="truncate font-medium">{selected ? selected.label : (placeholder || "Select...")}</span>
        <Icon name="chevronDown" size={12} className={cn("shrink-0 text-[var(--fg-muted)] transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-full min-w-[164px] max-h-[220px] overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-elevated)] py-1 animate-slide-down">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-left transition-colors",
                  String(opt.value) === String(value)
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] font-medium"
                    : "text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {String(opt.value) === String(value) && (
                  <Icon name="check" size={12} className="shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
