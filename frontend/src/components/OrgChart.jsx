/**
 * Organizational Chart Component — Vodafone Service Desk
 *
 * Visual tree-based hierarchy view using react-organizational-chart.
 * Premium node cards (avatar/initials, name, role/title, type tint, soft shadow,
 * hover lift) with refined connector lines and clean expand/collapse controls.
 *
 * Visual redesign only — the tree-building logic, root detection, expand/collapse
 * state, and all props (onEdit / hasReports / isExpanded / onToggle) are preserved.
 */

import { useState } from "react";
import { Tree, TreeNode } from "react-organizational-chart";
import Icon from "./ui/Icon";
import Badge from "./ui/Badge";
import EmptyState from "./ui/EmptyState";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

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
function EmployeeNode({ employee, onEdit, hasReports, isExpanded, onToggle }) {
  const primaryRole = employee.roles?.[0] || "requester";
  const role = ROLE_META[primaryRole] || ROLE_META.requester;
  const displayName = employee.full_name || employee.email;

  return (
    <div className="relative inline-block text-left">
      {/* Employee Card — compact, premium, type-tinted */}
      <div
        className={cn(
          "group/node relative w-56 rounded-2xl p-3.5 pb-4",
          "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
          "shadow-[var(--shadow-card)]",
          "transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]"
        )}
      >
        {/* Top accent hairline tinted by role */}
        <span
          className="pointer-events-none absolute inset-x-5 top-0 h-px rounded-full opacity-70"
          style={{
            background: `linear-gradient(90deg, transparent, ${role.accent}, transparent)`,
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-2.5">
          {/* Avatar / initials */}
          <div
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center",
              "font-semibold text-[11px] tracking-wide ring-1",
              role.avatar
            )}
          >
            {initials(displayName)}
          </div>

          {/* Name & Title */}
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-[var(--fg-primary)] leading-tight line-clamp-1">
              {displayName}
            </h3>
            <p className="text-[11px] text-[var(--fg-muted)] leading-tight line-clamp-1 mt-0.5">
              {employee.title || "No title"}
            </p>
          </div>

          {/* Edit Button — reveals on hover */}
          <button
            onClick={() => onEdit(employee)}
            title="Edit user"
            className={cn(
              "shrink-0 p-1.5 rounded-lg transition-all duration-150",
              "opacity-0 group-hover/node:opacity-100",
              "text-[var(--fg-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)]"
            )}
          >
            <Icon name="pencil" size={13} />
          </button>
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
          <button
            onClick={() => onToggle(employee.id)}
            title={isExpanded ? "Collapse" : "Expand"}
            className={cn(
              "absolute -bottom-3 left-1/2 -translate-x-1/2 z-10",
              "h-6 w-6 rounded-full flex items-center justify-center",
              "bg-[var(--accent)] text-white",
              "ring-2 ring-[var(--bg-elevated)]",
              "shadow-[0_2px_8px_rgba(230,0,0,0.35)]",
              "transition-transform duration-150 hover:scale-110 active:scale-95"
            )}
          >
            <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// Recursive Tree Builder
function OrgTreeNode({ employee, hierarchy, users, onEdit, expandedNodes, onToggle }) {
  const directReports = hierarchy.filter(
    (h) => h.manager_id === employee.id && h.level === 1
  );

  const reportEmployees = directReports
    .map((h) => users.find((u) => u.id === h.user_id))
    .filter(Boolean);

  const hasReports = reportEmployees.length > 0;
  const isExpanded = expandedNodes.has(employee.id);

  // Render as TreeNode - pass null as children when collapsed to hide lines
  const children = hasReports && isExpanded
    ? reportEmployees.map((report) => (
        <OrgTreeNode
          key={report.id}
          employee={report}
          hierarchy={hierarchy}
          users={users}
          onEdit={onEdit}
          expandedNodes={expandedNodes}
          onToggle={onToggle}
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
          isExpanded={isExpanded}
          onToggle={onToggle}
        />
      }
    >
      {children}
    </TreeNode>
  );
}

export default function OrgChart({ users, hierarchy, onEditUser }) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Find root employees (those who are not in hierarchy as user_id or have no manager)
  const userIdsInHierarchy = new Set(hierarchy.map((h) => h.user_id));
  const rootEmployees = users.filter(
    (u) => !userIdsInHierarchy.has(u.id) && u.is_active !== false
  );

  // Also find top-level managers (those who are managers but not employees in hierarchy)
  const managerIds = new Set(hierarchy.map((h) => h.manager_id));
  const topManagers = users.filter(
    (u) => managerIds.has(u.id) && !userIdsInHierarchy.has(u.id) && u.is_active !== false
  );

  // Combine root employees and top managers, remove duplicates
  const roots = [...new Set([...rootEmployees, ...topManagers])];

  function toggleNode(nodeId) {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  }

  function expandAll() {
    const allIds = new Set(users.map((u) => u.id));
    setExpandedNodes(allIds);
  }

  function collapseAll() {
    setExpandedNodes(new Set());
  }

  if (roots.length === 0) {
    return (
      <EmptyState
        icon="sitemap"
        title="No hierarchy defined"
        description="Assign managers to users to build the organizational chart."
      />
    );
  }

  // Connector line color resolves from CSS variables so it tracks dark/light themes
  const lineColor = "var(--border-strong)";

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={expandAll}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
            "hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
          )}
        >
          <Icon name="chevron-down" size={14} />
          Expand all
        </button>

        <button
          onClick={collapseAll}
          className={cn(
            "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]",
            "hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
          )}
        >
          <Icon name="chevron-up" size={14} />
          Collapse all
        </button>

        {/* Legend */}
        <div className="ml-auto hidden sm:flex items-center gap-3 text-[11px] text-[var(--fg-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Admin
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Agent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400" /> Requester
          </span>
        </div>
      </div>

      {/* Org Chart — scrollable with refined line styling */}
      <div className="overflow-x-auto pb-6 -mx-1 px-1">
        <style>
          {`
            /* Hide the vertical line going down from the root label to children when no children exist */
            /* The library creates: ul (root) > li (with label) > ul (children) */
            /* ul::before draws vertical line down from parent */
            /* We need to hide ul::before when there are no li children inside */
            .org-chart-container ul:not(:has(> li))::before {
              display: none !important;
            }
          `}
        </style>
        <div className="org-chart-container inline-flex min-w-full justify-center py-8 gap-16">
          {roots.map((root) => {
            const rootHasReports = hierarchy.filter(h => h.manager_id === root.id && h.level === 1).length > 0;
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
                    isExpanded={rootIsExpanded}
                    onToggle={toggleNode}
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
                    expandedNodes={expandedNodes}
                    onToggle={toggleNode}
                  />
                ))}
              </Tree>
            );
          })}
        </div>
      </div>
    </div>
  );
}
