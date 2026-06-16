/**
 * Organizational Chart Component — Vodafone Service Desk
 *
 * Visual tree-based hierarchy (react-organizational-chart) inside a pan/zoom
 * canvas so large org charts stay navigable: drag to pan, scroll/buttons to
 * zoom, fit-to-screen, reset, and a fullscreen mode. Per-node expand/collapse
 * and expand/collapse-all are preserved.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Tree, TreeNode } from "react-organizational-chart";
import Icon from "./ui/Icon";
import Badge from "./ui/Badge";
import EmptyState from "./ui/EmptyState";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Movement (px) tolerated before a press is treated as a pan rather than a tap.
// Generous enough that ordinary click jitter (esp. trackpads) still toggles.
const TAP_SLOP = 10;

// Inline glyphs for controls the icon set doesn't cover (minus / fit / fullscreen)
const Glyph = {
  minus: (p) => (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <line x1="3.5" y1="8" x2="12.5" y2="8" />
    </svg>
  ),
  fit: (p) => (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M14 5.5V3a1 1 0 0 0-1-1h-2.5M2 10.5V13a1 1 0 0 0 1 1h2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5" />
    </svg>
  ),
  expand: (p) => (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9.5 2H14v4.5M14 2l-4.5 4.5M6.5 14H2V9.5M2 14l4.5-4.5" />
    </svg>
  ),
  shrink: (p) => (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 6.5h4.5V2M6.5 6.5 2 2M14 9.5H9.5V14M9.5 9.5 14 14" />
    </svg>
  ),
};

// Role → static class strings (no dynamic Tailwind) for the avatar tile + badge tone
const ROLE_META = {
  admin: {
    label: "Admin",
    tone: "violet",
    avatar: "bg-violet-500/15 text-violet-500 ring-violet-500/20",
    accent: "var(--accent)",
  },
  agent: {
    label: "Agent",
    tone: "blue",
    avatar: "bg-blue-500/15 text-blue-500 ring-blue-500/20",
    accent: "#3B82F6",
  },
  requester: {
    label: "Requester",
    tone: "slate",
    avatar: "bg-slate-500/15 text-slate-400 ring-slate-500/20",
    accent: "#94A3B8",
  },
};

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Employee Node Component
function EmployeeNode({ employee, onEdit, hasReports, isExpanded, dimmed, highlighted }) {
  const primaryRole = employee.roles?.[0] || "requester";
  const role = ROLE_META[primaryRole] || ROLE_META.requester;
  const displayName = employee.full_name || employee.email;

  return (
    <div className="relative inline-block text-left">
      {/* Employee Card — compact, premium, type-tinted. The whole card toggles
          expand/collapse when it has reports (large, reliable hit target). */}
      <div
        data-node-id={hasReports ? employee.id : undefined}
        role={hasReports ? "button" : undefined}
        aria-expanded={hasReports ? isExpanded : undefined}
        title={hasReports ? (isExpanded ? "Collapse" : "Expand") : undefined}
        className={cn(
          "group/node relative w-56 rounded-2xl p-3.5 pb-4",
          "bg-[var(--bg-elevated)] border shadow-[var(--shadow-card)]",
          "transition-[box-shadow,border-color] duration-200",
          "hover:shadow-[var(--shadow-card-hover)]",
          hasReports && "cursor-pointer",
          highlighted
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
            : "border-[var(--border-default)] hover:border-[var(--border-hover)]",
          dimmed && "opacity-40"
        )}
      >
        {/* Top accent hairline tinted by role */}
        <span
          className="pointer-events-none absolute inset-x-5 top-0 h-px rounded-full opacity-70"
          style={{ background: `linear-gradient(90deg, transparent, ${role.accent}, transparent)` }}
        />

        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center",
              "font-semibold text-[11px] tracking-wide ring-1",
              role.avatar
            )}
          >
            {initials(displayName)}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-[var(--fg-primary)] leading-tight line-clamp-1">
              {displayName}
            </h3>
            <p className="text-[11px] text-[var(--fg-muted)] leading-tight line-clamp-1 mt-0.5">
              {employee.title || "No title"}
            </p>
          </div>

          {onEdit && (
            <button
              data-stop-toggle
              onClick={(e) => { e.stopPropagation(); onEdit(employee); }}
              title="Edit user"
              className={cn(
                "shrink-0 p-1.5 rounded-lg transition-all duration-150",
                "opacity-0 group-hover/node:opacity-100",
                "text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]"
              )}
            >
              <Icon name="pencil" size={13} />
            </button>
          )}
        </div>

        {/* Meta row: team + role + reports count */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {employee.team_name && (
            <Badge tone="emerald" size="sm" className="max-w-full">
              <Icon name="teams" size={10} className="shrink-0" />
              <span className="truncate">{employee.team_name}</span>
            </Badge>
          )}

          <Badge tone={role.tone} size="sm">
            {role.label}
          </Badge>

          {hasReports && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--fg-secondary)] tabular-nums">
              <Icon name="users" size={11} className="text-[var(--fg-muted)]" />
              {employee.report_count}
            </span>
          )}
        </div>

        {/* Expand / Collapse — only when the node has reports */}
        {hasReports && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 z-10",
              "h-6 w-6 rounded-full flex items-center justify-center",
              "bg-[var(--accent)] text-white",
              "ring-2 ring-[var(--bg-elevated)]",
              "shadow-[0_2px_8px_rgba(230,0,0,0.35)]"
            )}
          >
            <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={12} />
          </span>
        )}
      </div>
    </div>
  );
}

// Recursive Tree Builder
function OrgTreeNode({ employee, hierarchy, users, onEdit, expandedNodes, matchIds, hasQuery }) {
  const directReports = hierarchy.filter((h) => h.manager_id === employee.id && h.level === 1);
  const reportEmployees = directReports
    .map((h) => users.find((u) => u.id === h.user_id))
    .filter(Boolean);

  const hasReports = reportEmployees.length > 0;
  const isExpanded = expandedNodes.has(employee.id);

  const children = hasReports && isExpanded
    ? reportEmployees.map((report) => (
        <OrgTreeNode
          key={report.id}
          employee={report}
          hierarchy={hierarchy}
          users={users}
          onEdit={onEdit}
          expandedNodes={expandedNodes}          matchIds={matchIds}
          hasQuery={hasQuery}
        />
      ))
    : null;

  return (
    <TreeNode
      label={
        <EmployeeNode
          employee={employee}
          onEdit={onEdit}
          hasReports={hasReports}
          isExpanded={isExpanded}          highlighted={hasQuery && matchIds.has(employee.id)}
          dimmed={hasQuery && !matchIds.has(employee.id)}
        />
      }
    >
      {children}
    </TreeNode>
  );
}

export default function OrgChart({ users, hierarchy, onEditUser, query = "" }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 24 });
  const [fullscreen, setFullscreen] = useState(false);
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const drag = useRef(null);

  // Root detection (unchanged logic)
  const userIdsInHierarchy = new Set(hierarchy.map((h) => h.user_id));
  const rootEmployees = users.filter((u) => !userIdsInHierarchy.has(u.id) && u.is_active !== false);
  const managerIds = new Set(hierarchy.map((h) => h.manager_id));
  const topManagers = users.filter((u) => managerIds.has(u.id) && !userIdsInHierarchy.has(u.id) && u.is_active !== false);
  const roots = [...new Set([...rootEmployees, ...topManagers])];

  // Search highlight: ids whose name/title/email matches the query
  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const matchIds = new Set(
    hasQuery
      ? users
          .filter(
            (u) =>
              (u.full_name || "").toLowerCase().includes(q) ||
              (u.email || "").toLowerCase().includes(q) ||
              (u.title || "").toLowerCase().includes(q)
          )
          .map((u) => u.id)
      : []
  );

  function toggleNode(nodeId) {
    setExpandedNodes((prev) => {
      const n = new Set(prev);
      n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId);
      return n;
    });
  }
  const expandAll = () => setExpandedNodes(new Set(users.map((u) => u.id)));
  const collapseAll = () => setExpandedNodes(new Set());

  const zoomTo = useCallback((next) => setScale((s) => clamp(typeof next === "function" ? next(s) : next, 0.3, 2.2)), []);
  const reset = useCallback(() => { setScale(1); setPan({ x: 0, y: 24 }); }, []);
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    if (!vp || !ct) return;
    const cw = ct.scrollWidth;
    const ch = ct.scrollHeight;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!cw || !ch) return;
    const s = clamp(Math.min(vw / cw, vh / ch) * 0.9, 0.3, 1.4);
    setScale(s);
    setPan({ x: 0, y: 24 });
  }, []);

  // wheel zoom (native, non-passive so we can preventDefault)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      zoomTo((s) => s * (1 - e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // fit when entering fullscreen; Esc to exit
  useEffect(() => {
    if (fullscreen) {
      const t = setTimeout(fit, 80);
      const onKey = (e) => e.key === "Escape" && setFullscreen(false);
      window.addEventListener("keydown", onKey);
      return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
    }
  }, [fullscreen, fit]);

  // Record the start on every pointer-down, but only begin panning (and capture
  // the pointer) once movement passes a small threshold. This keeps every click
  // — on a node card or its buttons — from being swallowed by an accidental pan,
  // which was the cause of nodes "not closing" and the chart jittering.
  const onPointerDown = (e) => {
    const card = e.target.closest?.("[data-node-id]");
    drag.current = {
      x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, captured: false,
      nodeId: card ? Number(card.getAttribute("data-node-id")) : null,
      onControl: !!e.target.closest?.("[data-stop-toggle]"),
    };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return; // still within tap tolerance
    if (!d.moved) {
      d.moved = true;
      try { viewportRef.current?.setPointerCapture?.(e.pointerId); d.captured = true; } catch { /* capture optional */ }
    }
    setPan({ x: d.px + dx, y: d.py + dy });
  };
  const endDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.captured) { try { viewportRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ } }
    // A tap (no pan) on a node card → toggle it. Decided from the gesture itself —
    // no native click, no suppress flag, no timers — so it can never be "eaten".
    if (!d.moved && !d.onControl && d.nodeId != null) toggleNode(d.nodeId);
    drag.current = null;
  };

  if (roots.length === 0) {
    return (
      <EmptyState
        icon="sitemap"
        title="No hierarchy defined"
        description="Assign managers to users to build the organizational chart."
      />
    );
  }

  const lineColor = "var(--border-strong)";
  const ctrlBtn =
    "inline-flex items-center justify-center h-9 w-9 rounded-lg text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all duration-150";
  const pill =
    "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]";

  const treeContent = (
    <div ref={contentRef} className="org-chart-container inline-flex justify-center gap-16 px-10 py-10">
      <style>
        {`.org-chart-container ul:not(:has(> li))::before { display: none !important; }`}
      </style>
      {roots.map((root) => {
        const rootHasReports = hierarchy.filter((h) => h.manager_id === root.id && h.level === 1).length > 0;
        const rootIsExpanded = expandedNodes.has(root.id);
        const rootChildren = rootIsExpanded
          ? hierarchy
              .filter((h) => h.manager_id === root.id && h.level === 1)
              .map((h) => users.find((u) => u.id === h.user_id))
              .filter(Boolean)
          : [];

        return (
          <Tree
            key={root.id}
            lineWidth="1.5px"
            lineColor={lineColor}
            lineBorderRadius="12px"
            nodePadding="18px"
            label={
              <EmployeeNode
                employee={root}
                onEdit={onEditUser}
                hasReports={rootHasReports}
                isExpanded={rootIsExpanded}                highlighted={hasQuery && matchIds.has(root.id)}
                dimmed={hasQuery && !matchIds.has(root.id)}
              />
            }
          >
            {rootChildren.map((employee) => (
              <OrgTreeNode
                key={employee.id}
                employee={employee}
                hierarchy={hierarchy}
                users={users}
                onEdit={onEditUser}
                expandedNodes={expandedNodes}                matchIds={matchIds}
                hasQuery={hasQuery}
              />
            ))}
          </Tree>
        );
      })}
    </div>
  );

  const inner = (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3 shrink-0">
        <button onClick={expandAll} className={pill}>
          <Icon name="chevron-down" size={14} /> Expand all
        </button>
        <button onClick={collapseAll} className={pill}>
          <Icon name="chevron-up" size={14} /> Collapse all
        </button>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-[var(--fg-muted)] mx-2">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> Admin</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Agent</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" /> Requester</span>
        </div>

        {/* Zoom + view controls */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
            <button className={ctrlBtn} onClick={() => zoomTo((s) => s - 0.15)} title="Zoom out"><Glyph.minus /></button>
            <button
              onClick={reset}
              title="Reset zoom"
              className="px-1 w-12 text-center text-xs font-medium tabular-nums text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors"
            >
              {Math.round(scale * 100)}%
            </button>
            <button className={ctrlBtn} onClick={() => zoomTo((s) => s + 0.15)} title="Zoom in"><Icon name="plus" size={15} /></button>
          </div>
          <button className={cn(ctrlBtn, "border border-[var(--border-default)]")} onClick={fit} title="Fit to screen"><Glyph.fit /></button>
          <button
            className={cn(ctrlBtn, "border border-[var(--border-default)]")}
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Glyph.shrink /> : <Glyph.expand />}
          </button>
        </div>
      </div>

      {/* Pan/zoom viewport */}
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className={cn(
          "relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)]",
          "cursor-grab active:cursor-grabbing select-none touch-none",
          fullscreen ? "flex-1" : "h-[62vh] min-h-[420px]"
        )}
      >
        {/* grid backdrop + brand glow */}
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--accent)] opacity-[0.05] blur-3xl" />

        {/* transformed tree */}
        <div className="absolute inset-0 flex justify-center">
          <div
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "50% 0" }}
            className="will-change-transform"
          >
            {treeContent}
          </div>
        </div>

        {/* hint */}
        <div className="pointer-events-none absolute bottom-2.5 left-3.5 flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
          <Icon name="arrowUpRight" size={12} className="rotate-90" />
          Drag to pan · scroll to zoom
        </div>
      </div>
    </>
  );

  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[90] bg-[var(--bg-base)] flex flex-col p-4 sm:p-5">{inner}</div>,
      document.body
    );
  }
  return <div className="flex flex-col">{inner}</div>;
}
