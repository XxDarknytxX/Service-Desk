/**
 * App Layout Component
 * Linear/Modern Design System
 *
 * Features:
 * - Unified chrome: sidebar and header share the same elevated surface + border
 * - Buttery sidebar collapse: fixed 40px icon column that never moves,
 *   labels fade/slide out, width animates with the expo ease
 * - Collapse control lives ON the sidebar edge (desktop); hamburger is mobile-only
 * - Active nav item gets an accent bar + tinted icon
 * - Collapse state persists across sessions
 * - Mobile responsive with slide-out menu
 */

import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/auth";
import Icon from "./ui/Icon";
import VodafoneLogo from "./ui/VodafoneLogo";
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
      { to: "/forms", label: "Customer Forms", icon: "send", roles: ["admin", "agent"], moduleKey: "forms" },
      { to: "/knowledge-base", label: "Knowledge Base", icon: "knowledgeBase", moduleKey: "knowledge-base" },
      { to: "/reports", label: "Reports", icon: "reports", roles: ["admin", "agent"], moduleKey: "reports" },
    ],
  },
];

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sd-sidebar-collapsed") === "1"
  );
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const userMenuRef = useRef(null);
  const notificationsRef = useRef(null);

  const userRoles = user?.roles || [];
  // Mobile overlay always shows the expanded layout
  const expanded = !collapsed || mobileOpen;
  const sidebarWidth = mobileOpen
    ? SIDEBAR_EXPANDED
    : collapsed
    ? SIDEBAR_COLLAPSED
    : SIDEBAR_EXPANDED;

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("sd-sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  }

  function isVisible(item) {
    const roleOk = item.roles ? item.roles.some((role) => userRoles.includes(role)) : true;
    if (!roleOk) return false;
    if (userRoles.includes("admin")) return true;
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

  const displayName = user?.fullName || user?.full_name || user?.email || "User";
  const initial = displayName[0].toUpperCase();

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

  /* Fade/slide treatment shared by every label that disappears on collapse */
  const labelCls = (extra) =>
    cn(
      "transition-[opacity,transform] duration-200 ease-out whitespace-nowrap",
      expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none",
      extra
    );

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
          "fixed inset-y-0 left-0 z-50 flex flex-col",
          "bg-[var(--bg-elevated)] border-r border-[var(--border-default)]",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: sidebarWidth }}
      >
        {/* Accent glow line at top */}
        <div className="absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-30 pointer-events-none" />

        {/* Collapse toggle — floats on the sidebar edge (desktop only) */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "hidden lg:flex absolute -right-3 top-[42px] z-10",
            "h-6 w-6 items-center justify-center rounded-full",
            "bg-[var(--bg-elevated)] border border-[var(--border-strong)]",
            "text-[var(--fg-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.25)]",
            "hover:text-[var(--accent)] hover:border-[var(--accent)]/50 hover:scale-110",
            "active:scale-95",
            "transition-all duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={13} />
        </button>

        {/* Logo row — h-16 with bottom border lines up with the header */}
        <div className="h-16 flex items-center gap-3 px-[18px] border-b border-[var(--border-default)] shrink-0 overflow-hidden">
          <VodafoneLogo
            size={36}
            className="shrink-0 drop-shadow-[0_0_14px_rgba(230,0,0,0.4)]"
          />

          <div className={labelCls("min-w-0 flex-1")} aria-hidden={!expanded}>
            <h1 className="text-sm font-semibold text-[var(--fg-primary)] tracking-tight leading-tight truncate">
              Service Desk
            </h1>
            <p className="text-[10px] text-[var(--fg-muted)] truncate">Vodafone Fiji</p>
          </div>

          {/* Mobile close */}
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-2 rounded-lg shrink-0 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-colors"
              aria-label="Close menu"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto overflow-x-hidden scrollbar-none">
          <div className="space-y-5">
            {visibleSections.map((section) => (
              <div key={section.title}>
                {/* Section header: title when expanded, small divider when collapsed */}
                <div className="relative h-6 mb-1 flex items-center overflow-visible">
                  <p
                    className={cn(
                      "px-1 text-label whitespace-nowrap transition-opacity duration-200",
                      expanded ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden={!expanded}
                  >
                    {section.title}
                  </p>
                  <div
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 w-5 h-px bg-[var(--border-strong)]",
                      "transition-opacity duration-200",
                      expanded ? "opacity-0" : "opacity-100"
                    )}
                  />
                </div>

                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/dashboard"}
                      title={!expanded ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center h-10 rounded-lg overflow-hidden",
                          "transition-colors duration-150",
                          isActive
                            ? "bg-[var(--accent)]/[0.08] text-[var(--fg-primary)]"
                            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active accent bar */}
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--accent)]",
                              "transition-all duration-200",
                              isActive ? "h-5 opacity-100" : "h-0 opacity-0"
                            )}
                          />
                          {/* Fixed icon slot — identical position expanded & collapsed */}
                          <span
                            className={cn(
                              "w-10 shrink-0 flex items-center justify-center transition-colors duration-150",
                              isActive
                                ? "text-[var(--accent)]"
                                : "text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"
                            )}
                          >
                            <Icon name={item.icon} size={18} />
                          </span>
                          <span
                            className={labelCls("text-sm font-medium")}
                            aria-hidden={!expanded}
                          >
                            {item.label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Sidebar footer — user identity (click → profile) */}
        <div className="border-t border-[var(--border-default)] shrink-0 px-4 py-4">
          <button
            onClick={() => navigate("/profile")}
            title={!expanded ? `${displayName} — view profile` : "View profile"}
            className={cn(
              "w-full flex items-center h-12 rounded-xl text-left",
              expanded && "overflow-hidden",
              "hover:bg-[var(--bg-surface)] transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            )}
          >
            <div className="w-10 shrink-0 flex items-center justify-center">
              <div
                className={cn(
                  "relative h-10 w-10 rounded-xl flex items-center justify-center",
                  "bg-[var(--accent)]/10 text-[var(--accent)]",
                  "border border-[var(--accent)]/15",
                  "text-sm font-semibold"
                )}
              >
                {initial}
                {/* Online indicator — kept inside the avatar bounds so it never clips */}
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[var(--bg-elevated)]" />
              </div>
            </div>
            {expanded && (
              <>
                <div className="min-w-0 flex-1 ml-3 animate-fade-in">
                  <p className="text-sm font-semibold text-[var(--fg-primary)] truncate leading-snug">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-[var(--fg-muted)] truncate mt-0.5">{roleLabel}</p>
                </div>
                <span className="shrink-0 pr-1 text-[var(--fg-muted)] animate-fade-in">
                  <Icon name="chevronRight" size={14} />
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT AREA ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — same surface + border as the sidebar so the chrome is one piece */}
        <header
          className={cn(
            "relative h-16 flex-shrink-0 z-20",
            "bg-[var(--bg-elevated)]",
            "border-b border-[var(--border-default)]"
          )}
        >
          {/* Flowing Vodafone-red accent line — gentle pulse along the header edge */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 w-full h-[2px] z-10 animate-header-wave"
            style={{
              background:
                "linear-gradient(90deg, rgba(230,0,0,0.04) 0%, rgba(230,0,0,0.55) 25%, #E60000 50%, rgba(230,0,0,0.55) 75%, rgba(230,0,0,0.04) 100%)",
              backgroundSize: "200% 100%",
            }}
          />
          <div className="h-full flex items-center justify-between gap-4 px-4 sm:px-6">
            {/* Left: hamburger (mobile) + search */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className={cn(
                  "lg:hidden p-2.5 rounded-lg",
                  "text-[var(--fg-muted)]",
                  "border border-[var(--border-default)]",
                  "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]",
                  "transition-all duration-150"
                )}
                aria-label="Open menu"
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
                      "bg-[var(--bg-base)] rounded-lg",
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
                    "border border-[var(--border-default)]",
                    "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]",
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
                    "border border-[var(--border-default)]",
                    "hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]",
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
                    {initial}
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
