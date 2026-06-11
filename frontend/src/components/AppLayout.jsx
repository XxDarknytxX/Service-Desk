/**
 * App Layout Component
 * Linear/Modern Design System
 *
 * Features:
 * - Dark sidebar with subtle accent glow
 * - Glass-morphic header
 * - Floating ambient blobs
 * - Collapsible sidebar
 * - Mobile responsive with slide-out menu
 */

import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import Icon from "./ui/Icon";
import FloatingBlobs from "./ui/FloatingBlobs";
import FaqChatBar from "./FaqChatBar";
import { useState, useEffect, useRef } from "react";

const navSections = [
  {
    title: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "dashboard", moduleKey: "dashboard" },
      { to: "/tickets", label: "Tickets", icon: "tickets", moduleKey: "tickets" },
      { to: "/approvals", label: "Approvals", icon: "checkCircle", moduleKey: "approvals" },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/users", label: "Users", icon: "users", roles: ["admin", "agent"], moduleKey: "users" },
      { to: "/teams", label: "Teams", icon: "teams", roles: ["admin"], moduleKey: "teams" },
      { to: "/organizations", label: "Organizations", icon: "building", roles: ["admin"], moduleKey: "organizations" },
      { to: "/departments", label: "Departments", icon: "organization", roles: ["admin"], moduleKey: "departments" },
      { to: "/hierarchy", label: "Org Hierarchy", icon: "sitemap", roles: ["admin", "agent"], moduleKey: "hierarchy" },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/approval-rules", label: "Approval Rules", icon: "settings", roles: ["admin"], moduleKey: "approval-rules" },
      { to: "/templates", label: "Ticket Templates", icon: "clipboard", roles: ["admin"], moduleKey: "templates" },
      { to: "/assets", label: "Assets", icon: "assets", roles: ["admin", "agent"], moduleKey: "assets" },
      { to: "/sla", label: "SLA Policies", icon: "sla", roles: ["admin"], moduleKey: "sla" },
      { to: "/knowledge-base", label: "Knowledge Base", icon: "knowledgeBase", moduleKey: "knowledge-base" },
      { to: "/reports", label: "Reports", icon: "reports", roles: ["admin", "agent"], moduleKey: "reports" },
    ],
  },
];

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);

  const userRoles = user?.roles || [];
  const SIDEBAR_WIDTH_EXPANDED = 260;
  const SIDEBAR_WIDTH_COLLAPSED = 72;
  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  function isVisible(item) {
    // 1. Role check (existing)
    const roleOk = item.roles ? item.roles.some((role) => userRoles.includes(role)) : true;
    if (!roleOk) return false;

    // 2. Admins bypass team module restrictions
    if (userRoles.includes("admin")) return true;

    // 3. Team module check: null/undefined = unrestricted, array = restricted
    const teamModules = user?.teamModules;
    if (!teamModules || !item.moduleKey) return true;
    return teamModules.includes(item.moduleKey);
  }

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(isVisible),
    }))
    .filter((section) => section.items.length > 0);

  const roleLabel = userRoles.includes("admin")
    ? "Administrator"
    : userRoles.includes("agent")
    ? "Support Agent"
    : "User";

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Handle click outside dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }

    if (showUserMenu || showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserMenu, showNotifications]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
      {/* Floating background blobs */}
      <FloatingBlobs variant="minimal" />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ===== SIDEBAR ===== */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300",
          "sidebar-bg border-r border-[var(--border-default)]",
          "lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: mobileOpen ? SIDEBAR_WIDTH_EXPANDED : sidebarWidth }}
      >
        {/* Accent glow line at top */}
        <div className={cn(
          "absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent",
          isLight ? "opacity-20" : "opacity-40"
        )} />

        {/* Logo row */}
        <div className="h-16 flex items-center gap-3 px-4 flex-shrink-0 border-b border-[var(--border-default)]">
          <div
            className={cn(
              "h-9 w-9 min-w-[2.25rem] rounded-lg flex items-center justify-center flex-shrink-0",
              "bg-[var(--accent)] text-white",
              "shadow-[0_0_20px_rgba(230,0,0,0.3)]"
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.9" />
              <path
                d="M2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {(!collapsed || mobileOpen) && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-[var(--fg-primary)] tracking-tight leading-tight truncate">
                Service Desk
              </h1>
              <p className="text-[10px] text-[var(--fg-muted)] truncate">
                Vodafone ITSM
              </p>
            </div>
          )}

          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-colors"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto overflow-x-hidden">
          <div className="space-y-6">
            {visibleSections.map((section) => (
              <div key={section.title}>
                {(!collapsed || mobileOpen) && (
                  <p className="px-3 mb-2 text-label truncate">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/dashboard"}
                      title={collapsed && !mobileOpen ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "group flex items-center gap-3 rounded-lg font-medium transition-all duration-150",
                          collapsed && !mobileOpen ? "justify-center px-3 py-2" : "px-3 py-2",
                          isActive
                            ? "bg-[var(--bg-surface-hover)] text-[var(--fg-primary)]"
                            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div
                            className={cn(
                              "flex items-center justify-center w-8 h-8 min-w-[2rem] rounded-lg transition-all duration-150",
                              isActive
                                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"
                            )}
                          >
                            <Icon name={item.icon} size={18} />
                          </div>
                          {(!collapsed || mobileOpen) && (
                            <span className="truncate text-sm leading-8">
                              {item.label}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Sidebar footer - User info */}
        <div className="border-t border-[var(--border-default)] flex-shrink-0 mb-4">
          {collapsed && !mobileOpen ? (
            <div className="flex justify-center py-4">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center",
                  "bg-[var(--accent)]/10 text-[var(--accent)]",
                  "text-sm font-semibold"
                )}
                title={user?.fullName || user?.full_name || user?.email || "User"}
              >
                {(user?.fullName || user?.full_name || user?.email || "U")[0].toUpperCase()}
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  "bg-[var(--accent)]/10 text-[var(--accent)]",
                  "text-sm font-semibold"
                )}
              >
                {(user?.fullName || user?.full_name || user?.email || "U")[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--fg-primary)] truncate">
                  {user?.fullName || user?.full_name || user?.email}
                </p>
                <p className="text-[11px] text-[var(--fg-muted)] truncate">{roleLabel}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ===== MAIN CONTENT AREA ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header
          className={cn(
            "h-16 flex-shrink-0 z-20",
            "bg-[var(--bg-base)]/80 backdrop-blur-xl",
            "border-b border-[var(--border-default)]"
          )}
        >
          <div className="h-full flex items-center justify-between gap-4 px-4 sm:px-6">
            {/* Left: hamburger + search */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen(true)}
                className={cn(
                  "lg:hidden p-2.5 rounded-lg",
                  "text-[var(--fg-muted)]",
                  "bg-[var(--bg-surface)]",
                  "border border-[var(--border-default)]",
                  "hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)]",
                  "transition-all duration-150"
                )}
                aria-label="Open menu"
              >
                <Icon name="menu" size={18} />
              </button>

              {/* Desktop collapse toggle */}
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={cn(
                  "hidden lg:flex p-2.5 rounded-lg",
                  "text-[var(--fg-muted)]",
                  "bg-[var(--bg-surface)]",
                  "border border-[var(--border-default)]",
                  "hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)]",
                  "transition-all duration-150"
                )}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Icon name="menu" size={18} />
              </button>

              {/* Search */}
              <div className="flex-1 max-w-md hidden sm:block">
                <div className="relative">
                  <Icon
                    name="search"
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Search tickets, users..."
                    className={cn(
                      "w-full pl-10 pr-4 py-2",
                      "bg-[var(--bg-elevated)] rounded-lg",
                      "text-[var(--fg-primary)] text-sm",
                      "placeholder:text-[var(--fg-muted)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                      "transition-all duration-150"
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Notifications */}
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setShowUserMenu(false);
                  }}
                  className={cn(
                    "relative p-2.5 rounded-lg",
                    "text-[var(--fg-muted)]",
                    "bg-[var(--bg-surface)]",
                    "border border-[var(--border-default)]",
                    "hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)]",
                    "transition-all duration-150"
                  )}
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                >
                  <Icon name="bell" size={18} />
                </button>

                {showNotifications && (
                  <div
                    className={cn(
                      "absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)]",
                      "bg-[var(--bg-elevated)]",
                      "rounded-xl overflow-hidden",
                      "border border-[var(--border-default)]",
                      "shadow-[var(--shadow-elevated)]",
                      "animate-slide-down"
                    )}
                  >
                    <div className="px-4 py-3 border-b border-[var(--border-default)]">
                      <p className="text-sm font-semibold text-[var(--fg-primary)]">
                        Notifications
                      </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      <div className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
                        No new notifications
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-px h-6 bg-[var(--border-default)] mx-1 hidden sm:block" />

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setShowNotifications(false);
                  }}
                  className={cn(
                    "flex items-center gap-2.5 p-1.5 pr-3 rounded-lg",
                    "bg-[var(--bg-surface)]",
                    "border border-[var(--border-default)]",
                    "hover:border-[var(--border-hover)]",
                    "transition-all duration-150"
                  )}
                  aria-expanded={showUserMenu}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      "bg-[var(--accent)]/10 text-[var(--accent)]",
                      "text-sm font-semibold"
                    )}
                  >
                    {(user?.fullName || user?.full_name || user?.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-[var(--fg-primary)] truncate max-w-[100px]">
                    {user?.fullName || user?.full_name || user?.email?.split("@")[0]}
                  </span>
                  <Icon name="chevronDown" size={14} className="text-[var(--fg-muted)] hidden md:block" />
                </button>

                {showUserMenu && (
                  <div
                    className={cn(
                      "absolute right-0 mt-2 w-56",
                      "bg-[var(--bg-elevated)]",
                      "rounded-xl overflow-hidden",
                      "border border-[var(--border-default)]",
                      "shadow-[var(--shadow-elevated)]",
                      "animate-slide-down"
                    )}
                  >
                    <div className="px-4 py-3 border-b border-[var(--border-default)]">
                      <p className="text-sm font-semibold text-[var(--fg-primary)] truncate">
                        {user?.fullName || user?.full_name || "User"}
                      </p>
                      <p className="text-xs text-[var(--fg-muted)] mt-0.5 truncate">
                        {user?.email}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center mt-2 px-2 py-0.5 rounded-full",
                          "text-[10px] font-medium",
                          "bg-[var(--accent)]/10 text-[var(--accent)]"
                        )}
                      >
                        {roleLabel}
                      </span>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          navigate("/profile");
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 py-2.5",
                          "text-sm font-medium text-[var(--fg-secondary)]",
                          "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]",
                          "transition-colors duration-150"
                        )}
                      >
                        <Icon name="user" size={16} />
                        Profile
                      </button>
                      <div className="mx-3 my-1 h-px bg-[var(--border-default)]" />
                      <button
                        onClick={() => {
                          logout();
                          navigate("/login");
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 py-2.5",
                          "text-sm font-medium text-red-400",
                          "hover:bg-red-500/10",
                          "transition-colors duration-150"
                        )}
                      >
                        <Icon name="logout" size={16} />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6 lg:p-8 min-h-full">
            <div className="animate-fade-up">{children}</div>
          </div>
        </main>
      </div>

      {/* FAQ Chat Bar */}
      <FaqChatBar />
    </div>
  );
}
