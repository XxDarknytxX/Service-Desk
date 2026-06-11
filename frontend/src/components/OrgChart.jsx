/**
 * Organizational Chart Component
 * Visual tree-based hierarchy view using react-organizational-chart
 */

import { useState } from "react";
import { Tree, TreeNode } from "react-organizational-chart";
import Icon from "./ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Employee Node Component
function EmployeeNode({ employee, onEdit, hasReports, isExpanded, onToggle }) {
  const roleColors = {
    admin: "bg-purple-500/20 text-purple-300 border-purple-400/50",
    agent: "bg-blue-500/20 text-blue-300 border-blue-400/50",
    requester: "bg-slate-500/20 text-slate-300 border-slate-400/50",
  };

  const primaryRole = employee.roles?.[0] || "requester";
  const roleColor = roleColors[primaryRole] || roleColors.requester;

  return (
    <div className="relative inline-block">
      {/* Employee Card - Compact & Well-fitted */}
      <div
        className={cn(
          "group relative rounded-lg p-3",
          "bg-[var(--bg-elevated)] border-2",
          "shadow-lg hover:shadow-xl transition-all duration-200",
          "hover:border-[var(--accent)]",
          "w-56" // Fixed width, auto height
        )}
        style={{ borderColor: "rgba(148, 163, 184, 0.5)" }}
      >
        {/* Header - Compact */}
        <div className="flex items-center gap-2 mb-2.5">
          {/* Avatar */}
          <div
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0",
              "bg-[var(--accent)]/20 text-[var(--accent)]",
              "font-semibold text-xs"
            )}
          >
            {(employee.full_name || employee.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>

          {/* Name & Title */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)] line-clamp-1">
              {employee.full_name || employee.email}
            </h3>
            <p className="text-[11px] text-[var(--fg-secondary)] line-clamp-1">
              {employee.title || "No title"}
            </p>
          </div>

          {/* Edit Button */}
          <button
            onClick={() => onEdit(employee)}
            className={cn(
              "p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
              "text-[var(--fg-muted)] hover:text-[var(--accent)]",
              "hover:bg-[var(--bg-base)]"
            )}
          >
            <Icon name="pencil" size={12} />
          </button>
        </div>

        {/* Info - Compact */}
        <div className="space-y-2">
          {/* Team Badge, Role Badge & Reports - all on same line */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Team Badge - comes first */}
            {employee.team_name && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                <Icon name="teams" size={9} />
                <span className="line-clamp-1">{employee.team_name}</span>
              </div>
            )}

            {/* Role Badge */}
            <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border", roleColor)}>
              <Icon name="user" size={9} />
              <span className="capitalize">{primaryRole}</span>
            </div>

            {hasReports ? (
              <div className="flex items-center gap-1 text-[11px] text-[var(--fg-secondary)]">
                <Icon name="users" size={11} className="text-[var(--fg-muted)]" />
                <span>{employee.report_count}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Expand/Collapse Button - Only show when has reports */}
        {hasReports ? (
          <button
            onClick={() => onToggle(employee.id)}
            className={cn(
              "absolute -bottom-2.5 left-1/2 -translate-x-1/2",
              "w-5 h-5 rounded-full flex items-center justify-center",
              "bg-[var(--accent)] text-white",
              "hover:scale-110 transition-transform",
              "shadow-lg z-10"
            )}
          >
            <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={10} />
          </button>
        ) : null}
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
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 rounded-xl bg-[var(--bg-elevated)] border-2 border-[var(--border-default)] flex items-center justify-center mx-auto mb-4">
            <Icon name="organization" size={32} className="text-[var(--fg-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
            No hierarchy defined
          </h3>
          <p className="text-sm text-[var(--fg-secondary)]">
            Assign managers to users to build the organizational chart
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={expandAll}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "text-[var(--fg-primary)] hover:border-[var(--accent)]",
            "flex items-center gap-2"
          )}
        >
          <Icon name="chevron-down" size={14} />
          Expand All
        </button>

        <button
          onClick={collapseAll}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
            "text-[var(--fg-primary)] hover:border-[var(--accent)]",
            "flex items-center gap-2"
          )}
        >
          <Icon name="chevron-up" size={14} />
          Collapse All
        </button>
      </div>

      {/* Org Chart - Scrollable with custom line styling */}
      <div className="overflow-x-auto pb-8">
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
                lineWidth="2px"
                lineColor="rgba(148, 163, 184, 0.6)"
                lineBorderRadius="10px"
                nodePadding="16px"
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
