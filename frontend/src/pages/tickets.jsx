/**
 * Tickets Page
 * Enhanced with Vodafone ServiceDesk-inspired features:
 * - Column visibility toggle
 * - Due By date column, Site/Org column, Type column
 * - Attachment indicator (paperclip)
 * - Per-row quick actions (copy ticket#, email)
 * - Refresh button
 * - Compact/Comfortable view toggle
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "../services/api"
import { useMeta } from "../contexts/meta"
import { useAuth } from "../contexts/auth"
import { useToast } from "../contexts/toast"
import Badge from "../components/ui/Badge"
import Button from "../components/ui/Button"
import Icon from "../components/ui/Icon"
import Card from "../components/ui/Card"
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
  const [queueView, setQueueView] = useState(searchParams.get("queue") || "my-tickets")

  const [selectedTickets, setSelectedTickets] = useState([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get("create") === "1")

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
      } else if (queueView === "team-queue") {
        if (user.team_id) {
          params.set("teamId", user.team_id)
          params.set("assignee", "unassigned")
          params.set("excludeResolved", "true")
        }
      } else if (queueView === "my-requests") {
        params.set("requesterId", user.id)
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
  }

  const handleTicketCreated = () => {
    handleCloseModal()
    fetchTickets()
  }

  const handleRowClick = (ticketId) => {
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
    try {
      setBulkActionLoading(true)
      await api("/tickets/bulk", {
        method: "PATCH",
        body: { ticketIds: selectedTickets, updates: { status: statusKey } }
      })
      setSelectedTickets([])
      fetchTickets()
    } catch (error) {
      console.error("Failed to update tickets:", error)
      toast.error("Failed to update tickets. Please try again.")
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkPriorityChange = async (priorityKey) => {
    if (!selectedTickets.length) return
    try {
      setBulkActionLoading(true)
      await api("/tickets/bulk", {
        method: "PATCH",
        body: { ticketIds: selectedTickets, updates: { priority: priorityKey } }
      })
      setSelectedTickets([])
      fetchTickets()
    } catch (error) {
      console.error("Failed to update tickets:", error)
      toast.error("Failed to update tickets. Please try again.")
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
      case "new": case "open": return "blue"
      case "pending": return "amber"
      case "on_hold": return "slate"
      case "solved": return "emerald"
      case "closed": return "slate"
      default: return "slate"
    }
  }

  const getPriorityColor = (priorityKey) => {
    switch (priorityKey) {
      case "urgent": return "red"
      case "high": return "orange"
      case "normal": return "blue"
      case "low": return "emerald"
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

  const selectStyle = cn(
    "px-3 py-2.5 rounded-lg text-sm",
    "bg-[var(--bg-elevated)]",
    "text-[var(--fg-primary)]",
    "border border-[var(--border-default)]",
    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
    "transition-all duration-200 cursor-pointer"
  )

  const cellPad = compactView ? "px-4 py-2" : "px-4 py-3.5"

  if (loading && tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          "bg-[var(--accent)]/10 border border-[var(--accent)]/20"
        )}>
          <svg className="animate-spin h-5 w-5 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <p className="text-sm text-[var(--fg-secondary)]">Loading tickets...</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
                Tickets
              </h1>
              <p className="text-[var(--fg-secondary)] mt-1 text-sm">
                {total} {total === 1 ? "ticket" : "tickets"} total
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Refresh */}
              <button
                onClick={() => fetchTickets()}
                className={cn(
                  "p-2.5 rounded-lg transition-all duration-200",
                  "bg-[var(--bg-base)] border border-[var(--border-default)]",
                  "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]",
                  loading && "animate-spin"
                )}
                title="Refresh"
              >
                <Icon name="refresh" size={16} />
              </button>

              {/* Column visibility toggle */}
              <div className="relative" ref={colPickerRef}>
                <button
                  onClick={() => setShowColPicker(!showColPicker)}
                  className={cn(
                    "p-2.5 rounded-lg transition-all duration-200",
                    "bg-[var(--bg-base)] border border-[var(--border-default)]",
                    "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]",
                    showColPicker && "border-[var(--accent)] text-[var(--accent)]"
                  )}
                  title="Column visibility"
                >
                  <Icon name="columns" size={16} />
                </button>
                {showColPicker && (
                  <div className={cn(
                    "absolute right-0 top-full mt-2 z-50 w-56",
                    "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                    "rounded-xl shadow-[var(--shadow-elevated)]",
                    "p-2"
                  )}>
                    <p className="text-xs font-semibold text-[var(--fg-muted)] px-2 py-1.5 uppercase tracking-wider">Columns</p>
                    {ALL_COLUMNS.map(col => (
                      <label
                        key={col.key}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm",
                          "hover:bg-[var(--bg-surface)] transition-colors",
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

              {/* Compact / Comfortable toggle */}
              <button
                onClick={toggleCompactView}
                className={cn(
                  "p-2.5 rounded-lg transition-all duration-200",
                  "bg-[var(--bg-base)] border border-[var(--border-default)]",
                  "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
                )}
                title={compactView ? "Switch to comfortable view" : "Switch to compact view"}
              >
                <Icon name={compactView ? "list" : "table"} size={16} />
              </button>

              <Button onClick={handleCreateTicket} icon={<Icon name="plus" size={16} />}>
                New Ticket
              </Button>
            </div>
          </div>
        </div>

        {/* Queue Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { key: "my-tickets", label: "My Tickets", icon: "user", desc: "Tickets assigned to me to work on" },
            { key: "team-queue", label: "Team Queue", icon: "inbox", desc: "Unclaimed tickets in my team's queue" },
            { key: "my-requests", label: "My Requests", icon: "fileText", desc: "Tickets I raised as requester" },
            { key: "resolved", label: "Resolved", icon: "checkCircle", desc: "Completed tickets" },
            { key: "all", label: "All Tickets", icon: "list", desc: "All tickets in system", adminOnly: true },
          ].filter(tab => !tab.adminOnly || user?.roles?.includes('admin')).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setQueueView(tab.key)
                setPage(1)
                setStatusFilter("")
                updateSearchParams({ queue: tab.key, status: "" })
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap",
                "flex items-center gap-2",
                "transition-all duration-200",
                queueView === tab.key
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
              )}
              title={tab.desc}
            >
              <Icon name={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <Card padding={true} hover={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchInput}
                onChange={handleSearchChange}
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm",
                  "bg-[var(--bg-elevated)]",
                  "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                  "border border-[var(--border-default)]",
                  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                  "transition-all duration-200"
                )}
              />
            </div>
            <select value={statusFilter} onChange={handleStatusChange} className={selectStyle}>
              <option value="">All Statuses</option>
              {meta?.statuses?.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
            </select>
            <select value={priorityFilter} onChange={handlePriorityChange} className={selectStyle}>
              <option value="">All Priorities</option>
              {meta?.priorities?.map((p) => <option key={p.id} value={p.key}>{p.label}</option>)}
            </select>
            <select value={assigneeFilter} onChange={handleAssigneeChange} className={selectStyle} disabled={queueView !== "all"}>
              <option value="">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {meta?.agents?.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
            </select>
          </div>
        </Card>

        {/* Table */}
        {tickets.length === 0 ? (
          <Card hover={false}>
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-surface)]">
                <Icon name="tickets" className="w-6 h-6 text-[var(--fg-muted)]" />
              </div>
              <h3 className="text-base font-semibold text-[var(--fg-primary)] mb-1">
                No tickets found
              </h3>
              <p className="text-sm text-[var(--fg-secondary)] mb-6">
                {search || statusFilter || priorityFilter || assigneeFilter
                  ? "Try adjusting your filters."
                  : "Get started by creating your first ticket."}
              </p>
              {!search && !statusFilter && !priorityFilter && !assigneeFilter && (
                <Button onClick={handleCreateTicket} icon={<Icon name="plus" size={16} />}>
                  Create Ticket
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card hover={false} padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-default)]">
                    {/* Checkbox */}
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedTickets.length === tickets.length && tickets.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer"
                      />
                    </th>
                    {/* Quick actions header */}
                    <th className="w-16 px-1 py-3" />
                    {/* Dynamic columns */}
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
                      className="hover:bg-[var(--bg-surface)] transition-all duration-150 cursor-pointer group"
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
                          {/* Copy ticket number */}
                          <button
                            onClick={(e) => copyTicketNumber(ticket.ticket_number, e)}
                            className={cn(
                              "p-1 rounded transition-colors",
                              copiedId === ticket.ticket_number
                                ? "text-emerald-500"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
                            )}
                            title={copiedId === ticket.ticket_number ? "Copied!" : `Copy ${ticket.ticket_number}`}
                          >
                            <Icon name={copiedId === ticket.ticket_number ? "check" : "copy"} size={14} />
                          </button>
                          {/* Email requester */}
                          {ticket.requester_email && (
                            <a
                              href={`mailto:${ticket.requester_email}?subject=Re: ${ticket.ticket_number} - ${ticket.subject}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-colors"
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
                            <span className="text-xs font-mono font-medium text-[var(--accent)]">
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
                        <td className={cn(cellPad, "max-w-[300px]")}>
                          <span className={cn(
                            "font-medium text-[var(--fg-primary)] line-clamp-1",
                            compactView ? "text-xs" : "text-sm"
                          )}>
                            {ticket.subject}
                          </span>
                        </td>
                      )}

                      {/* Status */}
                      {isColVisible("status") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <Badge tone={getStatusColor(ticket.status_key)} size="sm">{ticket.status_label}</Badge>
                        </td>
                      )}

                      {/* Priority */}
                      {isColVisible("priority") && (
                        <td className={cn(cellPad, "whitespace-nowrap")}>
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2.5 h-2.5 rounded-sm", getPrioritySquareColor(ticket.priority_key))} />
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
                            if (!sla) return <span className="text-xs text-[var(--fg-muted)]">-</span>
                            return (
                              <div className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
                                sla.breached
                                  ? "bg-red-500/10 text-red-600"
                                  : sla.urgent
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-emerald-500/10 text-emerald-600"
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
                            <span className="text-xs text-[var(--fg-muted)]">-</span>
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
                            <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                              {ticket.assignee_name}
                            </span>
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
                            {ticket.organization_name || ticket.department_name || "-"}
                          </span>
                        </td>
                      )}

                      {/* Type */}
                      {isColVisible("type") && (
                        <td className={cn("hidden lg:table-cell", cellPad, "whitespace-nowrap")}>
                          <span className={cn("text-[var(--fg-secondary)]", compactView ? "text-xs" : "text-sm")}>
                            {ticket.type_label || "-"}
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
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)]">
              <span className="text-xs text-[var(--fg-muted)]">
                {total === 0 ? "0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)}`} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className={cn(
                    "p-2 rounded-lg text-[var(--fg-muted)] transition-all duration-150",
                    "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)]",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <Icon name="arrowLeft" size={16} />
                </button>
                <span className="text-xs text-[var(--fg-primary)] px-3 font-medium">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className={cn(
                    "p-2 rounded-lg text-[var(--fg-muted)] transition-all duration-150",
                    "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)]",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedTickets.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up">
          <div className={cn(
            "bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-xl",
            "border border-[var(--border-default)]",
            "shadow-[var(--shadow-elevated)]",
            "px-5 py-3.5"
          )}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5 text-sm">
                <span className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-lg",
                  "bg-[var(--accent)] text-white",
                  "text-xs font-semibold"
                )}>
                  {selectedTickets.length}
                </span>
                <span className="font-medium">selected</span>
              </div>

              <div className="h-5 w-px bg-[var(--border-default)]" />

              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => { if (e.target.value) { handleBulkStatusChange(e.target.value); e.target.value = "" } }}
                  disabled={bulkActionLoading}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all",
                    "bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)]",
                    "disabled:opacity-50"
                  )}
                >
                  <option value="">Status</option>
                  {meta?.statuses?.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
                </select>

                <select
                  onChange={(e) => { if (e.target.value) { handleBulkPriorityChange(e.target.value); e.target.value = "" } }}
                  disabled={bulkActionLoading}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all",
                    "bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)]",
                    "disabled:opacity-50"
                  )}
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
                  className="p-2 hover:bg-[var(--bg-surface)] rounded-lg transition-all"
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
      />
    </>
  )
}
