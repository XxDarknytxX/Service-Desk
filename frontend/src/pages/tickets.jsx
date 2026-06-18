/**
 * Tickets Page — Vodafone Service Desk
 *
 * Premium queue experience: branded header, segmented queue switcher, a clean
 * filter toolbar, and an elevated data table with refined badges, SLA pills,
 * per-row quick actions, bulk actions, and column controls. All data flows,
 * filters, column visibility, compact mode, and bulk operations are preserved.
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "../services/api"
import { useMeta } from "../contexts/meta"
import { useAuth } from "../contexts/auth"
import { useToast } from "../contexts/toast"
import Badge from "../components/ui/Badge"
import Button from "../components/ui/Button"
import Icon from "../components/ui/Icon"
import PageHeader from "../components/ui/PageHeader"
import EmptyState from "../components/ui/EmptyState"
import { SkeletonTable } from "../components/ui/Skeleton"
import { Select } from "../components/ui/Input"
import TicketCreateModal from "../components/tickets/TicketCreateModal"

function cn(...parts) {
  return parts.filter(Boolean).join(" ")
}

/* ---------- column definitions ---------- */
const ALL_COLUMNS = [
  { key: "ticket_number", label: "#", alwaysVisible: true },
  { key: "subject", label: "Subject", alwaysVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "priority", label: "Priority", defaultVisible: true },
  { key: "sla", label: "SLA", defaultVisible: true, hideBelow: "xl" },
  { key: "due_at", label: "Due By", defaultVisible: true, hideBelow: "lg" },
  { key: "requester", label: "Requester", defaultVisible: true, hideBelow: "lg" },
  { key: "assignee", label: "Assigned To", defaultVisible: true, hideBelow: "lg" },
  { key: "organization", label: "Site", defaultVisible: false, hideBelow: "lg" },
  { key: "type", label: "Type", defaultVisible: false, hideBelow: "lg" },
  { key: "created_at", label: "Created", defaultVisible: true },
]

function getDefaultVisibleCols() {
  return ALL_COLUMNS.filter(c => c.alwaysVisible || c.defaultVisible).map(c => c.key)
}

function loadVisibleCols() {
  try {
    const saved = localStorage.getItem("tickets_visible_columns")
    if (saved) return JSON.parse(saved)
  } catch (_) {}
  return getDefaultVisibleCols()
}

export default function Tickets() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { meta } = useMeta()
  const { user } = useAuth()
  const toast = useToast()
  const isAgent = user?.roles?.includes("admin") || user?.roles?.includes("agent")
  const isCorporate = !isAgent && user?.roles?.includes("corporate_customer")

  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)

  // searchInput = what the user sees in the box (immediate)
  // search = debounced value that actually triggers fetches + URL sync
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "")
  const [search, setSearch] = useState(searchParams.get("search") || "")
  const searchDebounceRef = useRef(null)
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "")
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get("priority") || "")
  const [assigneeFilter, setAssigneeFilter] = useState(searchParams.get("assignee") || "")
  const [queueView, setQueueView] = useState(searchParams.get("queue") || (isCorporate ? "open-requests" : "my-tickets"))

  const [selectedTickets, setSelectedTickets] = useState([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get("create") === "1")
  const [resumeTicket, setResumeTicket] = useState(null)

  // New: column visibility & view mode
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols)
  const [showColPicker, setShowColPicker] = useState(false)
  const [compactView, setCompactView] = useState(() => localStorage.getItem("tickets_compact") === "1")
  const [copiedId, setCopiedId] = useState(null)
  const colPickerRef = useRef(null)

  // Close column picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target)) {
        setShowColPicker(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    fetchTickets()
  }, [page, search, statusFilter, priorityFilter, assigneeFilter, queueView])

  useEffect(() => {
    setShowCreateModal(searchParams.get("create") === "1")
  }, [searchParams])

  useEffect(() => {
    setSelectedTickets([])
  }, [tickets])

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set("page", page)
      params.set("pageSize", pageSize)
      if (search) params.set("search", search)
      if (statusFilter) params.set("status", statusFilter)
      if (priorityFilter) params.set("priority", priorityFilter)

      // Handle queue views
      if (queueView === "my-tickets") {
        params.set("assignee", user.id)
        params.set("excludeResolved", "true")
        params.set("excludeDrafts", "true")
      } else if (queueView === "team-queue") {
        if (user.team_id) {
          params.set("teamId", user.team_id)
          params.set("assignee", "unassigned")
          params.set("excludeResolved", "true")
          params.set("excludeDrafts", "true")
        }
      } else if (queueView === "my-requests") {
        params.set("requesterId", user.id)
        params.set("excludeDrafts", "true")
      } else if (queueView === "open-requests") {
        params.set("requesterId", user.id)
        params.set("excludeResolved", "true")
        params.set("excludeDrafts", "true")
      } else if (queueView === "drafts") {
        params.set("requesterId", user.id)
        params.set("status", "draft")
      } else if (queueView === "closed-requests") {
        params.set("requesterId", user.id)
        params.set("status", "solved,closed")
      } else if (queueView === "resolved") {
        params.set("status", "solved,closed")
        if (user.team_id) {
          params.set("teamId", user.team_id)
        }
      } else if (queueView === "all") {
        if (assigneeFilter) {
          params.set("assignee", assigneeFilter)
        }
      } else if (assigneeFilter) {
        params.set("assignee", assigneeFilter)
      }

      const data = await api(`/tickets?${params.toString()}`)
      setTickets(data.items || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error("Failed to fetch tickets:", error)
      toast.error(error.message || "Failed to load tickets")
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    // Update the input immediately so typing/backspace is never interrupted
    setSearchInput(value)
    // Debounce the actual search + URL update to avoid React Router re-mount stealing focus
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearch(value)
      setPage(1)
      updateSearchParams({ search: value })
    }, 300)
  }

  const handleStatusChange = (e) => {
    const value = e.target.value
    setStatusFilter(value)
    setPage(1)
    updateSearchParams({ status: value })
  }

  const handlePriorityChange = (e) => {
    const value = e.target.value
    setPriorityFilter(value)
    setPage(1)
    updateSearchParams({ priority: value })
  }

  const handleAssigneeChange = (e) => {
    const value = e.target.value
    setAssigneeFilter(value)
    setPage(1)
    updateSearchParams({ assignee: value })
  }

  const updateSearchParams = (params) => {
    const newParams = new URLSearchParams(searchParams)
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    setSearchParams(newParams)
  }

  const handleCreateTicket = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set("create", "1")
    setSearchParams(newParams)
  }

  const handleCloseModal = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.delete("create")
    setSearchParams(newParams)
    setShowCreateModal(false)
    setResumeTicket(null)
  }

  const handleTicketCreated = (_id, opts) => {
    if (!opts?.keepOpen) handleCloseModal()
    fetchTickets()
  }

  const handleRowClick = (ticketId) => {
    // A draft re-opens the create modal in resume mode — but only for its owner
    // (drafts are private; no one else should be able to resume/submit them).
    const t = tickets.find((x) => x.id === ticketId)
    if (t?.status_key === "draft" && t.requester_id === user.id) {
      setResumeTicket(t)
      setShowCreateModal(true)
      return
    }
    navigate(`/tickets/${ticketId}`)
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTickets(tickets.map(t => t.id))
    } else {
      setSelectedTickets([])
    }
  }

  const handleSelectTicket = (ticketId, e) => {
    e.stopPropagation()
    setSelectedTickets(prev => {
      if (prev.includes(ticketId)) {
        return prev.filter(id => id !== ticketId)
      } else {
        return [...prev, ticketId]
      }
    })
  }

  const handleBulkStatusChange = async (statusKey) => {
    if (!selectedTickets.length) return
    // The backend whitelists status_id (not the key), so resolve it here — sending
    // the raw key was silently rejected and updated nothing.
    const status_id = meta?.statuses?.find((s) => s.key === statusKey)?.id
    if (!status_id) return
    try {
      setBulkActionLoading(true)
      await api("/tickets/bulk", {
        method: "PATCH",
        body: { ticketIds: selectedTickets, updates: { status_id } }
      })
      setSelectedTickets([])
      fetchTickets()
    } catch (error) {
      console.error("Failed to update tickets:", error)
      toast.error(error.message || "Failed to update tickets. Please try again.")
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkPriorityChange = async (priorityKey) => {
    if (!selectedTickets.length) return
    const priority_id = meta?.priorities?.find((p) => p.key === priorityKey)?.id
    if (!priority_id) return
    try {
      setBulkActionLoading(true)
      await api("/tickets/bulk", {
        method: "PATCH",
        body: { ticketIds: selectedTickets, updates: { priority_id } }
      })
      setSelectedTickets([])
      fetchTickets()
    } catch (error) {
      console.error("Failed to update tickets:", error)
      toast.error(error.message || "Failed to update tickets. Please try again.")
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkAssignToMe = async () => {
    if (!selectedTickets.length) return
    try {
      setBulkActionLoading(true)
      await api("/tickets/bulk", {
        method: "PATCH",
        body: { ticketIds: selectedTickets, updates: { assignee_id: user.id } }
      })
      setSelectedTickets([])
      fetchTickets()
    } catch (error) {
      console.error("Failed to assign tickets:", error)
      toast.error("Failed to assign tickets. Please try again.")
    } finally {
      setBulkActionLoading(false)
    }
  }

  /* ---------- column visibility ---------- */
  const toggleColumn = (key) => {
    const col = ALL_COLUMNS.find(c => c.key === key)
    if (col?.alwaysVisible) return
    setVisibleCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem("tickets_visible_columns", JSON.stringify(next))
      return next
    })
  }

  const toggleCompactView = () => {
    setCompactView(prev => {
      const next = !prev
      localStorage.setItem("tickets_compact", next ? "1" : "0")
      return next
    })
  }

  /* ---------- copy ticket number ---------- */
  const copyTicketNumber = useCallback((ticketNumber, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(ticketNumber).then(() => {
      setCopiedId(ticketNumber)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  /* ---------- helpers ---------- */
  const getStatusColor = (statusKey) => {
    switch (statusKey) {
      case "draft": return "slate"
      case "open": return "blue"
      case "pending": return "amber"
      case "in_progress": return "indigo"
      case "on_hold": return "violet"
      case "solved": return "emerald"
      case "closed": return "slate"
      default: return "slate"
    }
  }

  const getPrioritySquareColor = (priorityKey) => {
    switch (priorityKey) {
      case "urgent": return "bg-red-500"
      case "high": return "bg-orange-500"
      case "normal": return "bg-blue-500"
      case "low": return "bg-emerald-500"
      default: return "bg-slate-500"
    }
  }

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return null
    const d = new Date(dateString)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  const formatSlaTime = (seconds) => {
    if (seconds === null || seconds === undefined) return null

    const absSeconds = Math.abs(seconds)
    const hours = Math.floor(absSeconds / 3600)
    const mins = Math.floor((absSeconds % 3600) / 60)

    if (seconds < 0) {
      return { text: `${hours}h ${mins}m overdue`, breached: true, urgent: true }
    } else if (seconds < 3600) {
      return { text: `${mins}m left`, breached: false, urgent: true }
    } else if (seconds < 7200) {
      return { text: `${hours}h ${mins}m left`, breached: false, urgent: true }
    } else {
      return { text: `${hours}h ${mins}m left`, breached: false, urgent: false }
    }
  }

  const isDueOverdue = (dueAt) => {
    if (!dueAt) return false
    return new Date(dueAt) < new Date()
  }

  const isColVisible = (key) => visibleCols.includes(key)

  const totalPages = Math.ceil(total / pageSize)

  const cellPad = compactView ? "px-4 py-2.5" : "px-4 py-3.5"

  const hasFilters = search || statusFilter || priorityFilter || assigneeFilter

  const QUEUES = isCorporate
    ? [
        { key: "open-requests", label: "Open Requests", icon: "inbox", desc: "Your active requests" },
        { key: "drafts", label: "Drafts", icon: "edit", desc: "Requests you saved but haven't submitted" },
        { key: "closed-requests", label: "Closed Requests", icon: "checkCircle", desc: "Your completed requests" },
      ]
    : [
        { key: "my-tickets", label: "My Tickets", icon: "user", desc: "Tickets assigned to me to work on" },
        { key: "team-queue", label: "Team Queue", icon: "inbox", desc: "Unclaimed tickets in my team's queue" },
        { key: "my-requests", label: "My Requests", icon: "fileText", desc: "Tickets I raised as requester" },
        { key: "resolved", label: "Resolved", icon: "checkCircle", desc: "Completed tickets" },
        { key: "all", label: "All Tickets", icon: "list", desc: "All tickets in system", adminOnly: true },
      ].filter(tab => !tab.adminOnly || user?.roles?.includes('admin'))

  // Reusable header control button
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
  )

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <PageHeader
          icon="tickets"
          title="Tickets"
          subtitle={`${total} ${total === 1 ? "ticket" : "tickets"} in this view`}
          actions={
            <>
              <ControlButton title="Refresh" onClick={() => fetchTickets()}>
                <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
              </ControlButton>

              <div className="relative" ref={colPickerRef}>
                <ControlButton
                  active={showColPicker}
                  title="Column visibility"
                  onClick={() => setShowColPicker(!showColPicker)}
                >
                  <Icon name="columns" size={16} />
                </ControlButton>
                {showColPicker && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-56 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-elevated)] p-2 animate-slide-down">
                    <p className="text-label px-2 py-1.5">Columns</p>
                    {ALL_COLUMNS.map(col => (
                      <label
                        key={col.key}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm hover:bg-[var(--bg-surface)] transition-colors",
                          col.alwaysVisible && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          disabled={col.alwaysVisible}
                          className="w-3.5 h-3.5 rounded border-[var(--border-default)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                        />
                        <span className="text-[var(--fg-primary)]">{col.label}</span>
                      </label>
                    ))}
                    <div className="border-t border-[var(--border-default)] mt-1 pt-1">
                      <button
                        onClick={() => {
                          const defaults = getDefaultVisibleCols()
                          setVisibleCols(defaults)
                          localStorage.setItem("tickets_visible_columns", JSON.stringify(defaults))
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors"
                      >
                        Reset to defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <ControlButton
                title={compactView ? "Switch to comfortable view" : "Switch to compact view"}
                onClick={toggleCompactView}
              >
                <Icon name={compactView ? "list" : "table"} size={16} />
              </ControlButton>

              <Button onClick={handleCreateTicket} icon={<Icon name="plus" size={16} />}>
                New Ticket
              </Button>
            </>
          }
        />

        {/* Queue switcher (segmented) */}
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
            {QUEUES.map((tab) => {
              const active = queueView === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setQueueView(tab.key)
                    setPage(1)
                    setStatusFilter("")
                    updateSearchParams({ queue: tab.key, status: "" })
                  }}
                  title={tab.desc}
                  className={cn(
                    "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200",
                    active
                      ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                  )}
                >
                  <Icon
                    name={tab.icon}
                    size={15}
                    className={active ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"}
                  />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchInput}
                onChange={handleSearchChange}
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
            <Select value={statusFilter} onChange={handleStatusChange}>
              <option value="">All Statuses</option>
              {meta?.statuses?.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
            </Select>
            <Select value={priorityFilter} onChange={handlePriorityChange}>
              <option value="">All Priorities</option>
              {meta?.priorities?.map((p) => <option key={p.id} value={p.key}>{p.label}</option>)}
            </Select>
            <Select
              value={assigneeFilter}
              onChange={handleAssigneeChange}
              disabled={queueView !== "all"}
              title={queueView !== "all" ? "Switch to All Tickets to filter by assignee" : undefined}
            >
              <option value="">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {meta?.agents?.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
            </Select>
          </div>
        </div>

        {/* Table / states */}
        {loading && tickets.length === 0 ? (
          <SkeletonTable rows={8} cols={6} />
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <EmptyState
              icon="tickets"
              title="No tickets found"
              description={
                hasFilters
                  ? "Try adjusting your filters or switching queues."
                  : "Get started by creating your first ticket."
              }
              action={
                !hasFilters && (
                  <Button onClick={handleCreateTicket} icon={<Icon name="plus" size={16} />}>
                    Create Ticket
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
            <div className={cn("overflow-x-auto transition-opacity duration-200", loading && "opacity-60")}>
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedTickets.length === tickets.length && tickets.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
                      />
                    </th>
                    <th className="w-16 px-1 py-3" />
                    {ALL_COLUMNS.filter(c => isColVisible(c.key)).map(col => (
                      <th
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-left text-label",
                          col.hideBelow === "lg" && "hidden lg:table-cell",
                          col.hideBelow === "xl" && "hidden xl:table-cell"
                        )}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => handleRowClick(ticket.id)}
                      className="hover:bg-[var(--bg-surface)] transition-colors duration-150 cursor-pointer group"
                    >
                      {/* Checkbox */}
                      <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedTickets.includes(ticket.id)}
                          onChange={(e) => handleSelectTicket(ticket.id, e)}
                          className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
                        />
                      </td>

                      {/* Quick actions */}
                      <td className={cn(cellPad, "px-1")} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => copyTicketNumber(ticket.ticket_number, e)}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              copiedId === ticket.ticket_number
                                ? "text-emerald-500"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)]"
                            )}
                            title={copiedId === ticket.ticket_number ? "Copied!" : `Copy ${ticket.ticket_number}`}
                          >
                            <Icon name={copiedId === ticket.ticket_number ? "check" : "copy"} size={14} />
                          </button>
                          {ticket.requester_email && (
                            <a
                              href={`mailto:${ticket.requester_email}?subject=Re: ${ticket.ticket_number} - ${ticket.subject}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                              title={`Email ${ticket.requester_name}`}
                            >
                              <Icon name="mail" size={14} />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Ticket # */}
                      {isColVisible("ticket_number") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-[var(--accent)]">
                              {ticket.ticket_number}
                            </span>
                            {ticket.attachment_count > 0 && (
                              <span className="text-[var(--fg-muted)]" title={`${ticket.attachment_count} attachment${ticket.attachment_count > 1 ? 's' : ''}`}>
                                <Icon name="paperclip" size={13} />
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Subject */}
                      {isColVisible("subject") && (
                        <td className={cn(cellPad, "max-w-[320px]")}>
                          <span className={cn(
                            "font-medium text-[var(--fg-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors",
                            compactView ? "text-xs" : "text-sm"
                          )}>
                            {ticket.subject}
                          </span>
                        </td>
                      )}

                      {/* Status */}
                      {isColVisible("status") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <Badge tone={getStatusColor(ticket.status_key)} size="sm" dot>{ticket.status_label}</Badge>
                        </td>
                      )}

                      {/* Priority */}
                      {isColVisible("priority") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2.5 h-2.5 rounded-[3px]", getPrioritySquareColor(ticket.priority_key))} />
                            <span className={cn(
                              "text-[var(--fg-primary)]",
                              compactView ? "text-xs" : "text-sm"
                            )}>
                              {ticket.priority_label}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* SLA */}
                      {isColVisible("sla") && (
                        <td className={cn("hidden xl:table-cell", cellPad, "whitespace-nowrap")}>
                          {(() => {
                            const sla = formatSlaTime(ticket.resolve_time_remaining_seconds)
                            if (!sla) return <span className="text-xs text-[var(--fg-muted)]">—</span>
                            return (
                              <div className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
                                sla.breached
                                  ? "bg-red-500/10 text-red-500"
                                  : sla.urgent
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-emerald-500/10 text-emerald-500"
                              )}>
                                <Icon name={sla.breached ? "alertCircle" : "clock"} size={12} />
                                {sla.text}
                              </div>
                            )
                          })()}
                        </td>
                      )}

                      {/* Due By */}
                      {isColVisible("due_at") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          {ticket.resolve_due_at ? (
                            <span className={cn(
                              "text-xs",
                              isDueOverdue(ticket.resolve_due_at) && !ticket.status_is_closed
                                ? "text-red-500 font-medium"
                                : "text-[var(--fg-secondary)]"
                            )}>
                              {formatDateTime(ticket.resolve_due_at)}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--fg-muted)]">—</span>
                          )}
                        </td>
                      )}

                      {/* Requester */}
                      {isColVisible("requester") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                            {ticket.requester_name}
                          </span>
                        </td>
                      )}

                      {/* Assigned To */}
                      {isColVisible("assignee") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          {ticket.assignee_name ? (
                            <div className="flex items-center gap-2">
                              <span className="h-6 w-6 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold flex items-center justify-center shrink-0">
                                {ticket.assignee_name.charAt(0).toUpperCase()}
                              </span>
                              <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                                {ticket.assignee_name}
                              </span>
                            </div>
                          ) : (
                            <span className={cn("text-[var(--fg-muted)] italic", compactView ? "text-xs" : "text-sm")}>
                              Unassigned
                            </span>
                          )}
                        </td>
                      )}

                      {/* Site (Organization) */}
                      {isColVisible("organization") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                            {ticket.organization_name || ticket.department_name || "—"}
                          </span>
                        </td>
                      )}

                      {/* Type */}
                      {isColVisible("type") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                            {ticket.type_label || "—"}
                          </span>
                        </td>
                      )}

                      {/* Created */}
                      {isColVisible("created_at") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <span className={cn("text-[var(--fg-muted)]", compactView ? "text-[10px]" : "text-xs")}>
                            {formatRelativeTime(ticket.created_at)}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)]/40">
              <span className="text-xs text-[var(--fg-muted)] tabular-nums">
                {total === 0 ? "0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)}`} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-[var(--fg-muted)] transition-all duration-150 hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="arrowLeft" size={16} />
                </button>
                <span className="text-xs text-[var(--fg-primary)] px-3 font-medium tabular-nums">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="p-2 rounded-lg text-[var(--fg-muted)] transition-all duration-150 hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedTickets.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up w-[calc(100%-2rem)] sm:w-auto">
          <div className="surface-glass rounded-2xl border border-[var(--border-strong)] shadow-[var(--shadow-elevated)] px-4 sm:px-5 py-3.5">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold">
                  {selectedTickets.length}
                </span>
                <span className="font-medium text-[var(--fg-primary)]">selected</span>
              </div>

              <div className="h-5 w-px bg-[var(--border-default)] hidden sm:block" />

              <div className="flex items-center gap-2 flex-wrap justify-center">
                <select
                  onChange={(e) => { if (e.target.value) { handleBulkStatusChange(e.target.value); e.target.value = "" } }}
                  disabled={bulkActionLoading}
                  className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)] text-[var(--fg-primary)] disabled:opacity-50"
                >
                  <option value="">Status</option>
                  {meta?.statuses?.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
                </select>

                <select
                  onChange={(e) => { if (e.target.value) { handleBulkPriorityChange(e.target.value); e.target.value = "" } }}
                  disabled={bulkActionLoading}
                  className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)] text-[var(--fg-primary)] disabled:opacity-50"
                >
                  <option value="">Priority</option>
                  {meta?.priorities?.map((p) => <option key={p.id} value={p.key}>{p.label}</option>)}
                </select>

                <Button
                  size="sm"
                  onClick={handleBulkAssignToMe}
                  disabled={bulkActionLoading}
                  icon={<Icon name="userPlus" size={14} />}
                >
                  Assign to me
                </Button>

                <button
                  onClick={() => setSelectedTickets([])}
                  className="p-2 hover:bg-[var(--bg-surface)] rounded-lg transition-all text-[var(--fg-secondary)]"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TicketCreateModal
        open={showCreateModal}
        onClose={handleCloseModal}
        meta={meta}
        user={user}
        onCreated={handleTicketCreated}
        resumeTicket={resumeTicket}
      />
    </>
  )
}
