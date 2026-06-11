/**
 * Profile Page
 * Linear/Modern Design System
 *
 * Features:
 * - User info display (avatar, name, email, role)
 * - Theme switcher (dark/light with live preview cards)
 * - Elegant animated toggle with smooth transitions
 * - Responsive layout
 */

import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import Icon from "../components/ui/Icon";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Profile() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const userRoles = user?.roles || [];
  const roleLabel = userRoles.includes("admin")
    ? "Administrator"
    : userRoles.includes("agent")
    ? "Support Agent"
    : "Requester";

  const roleTone = userRoles.includes("admin")
    ? "violet"
    : userRoles.includes("agent")
    ? "blue"
    : "slate";

  const initials = (user?.fullName || user?.full_name || user?.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader
        title="Profile"
        subtitle="Manage your account settings and preferences"
      />

      {/* ===== USER INFO CARD ===== */}
      <Card hover={false} spotlight={false}>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div
            className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0",
              "bg-[var(--accent)]/10 text-[var(--accent)]",
              "text-2xl font-bold tracking-tight",
              "border border-[var(--accent)]/20",
              "shadow-[0_0_30px_rgba(230,0,0,0.1)]"
            )}
          >
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-[var(--fg-primary)] tracking-tight">
              {user?.fullName || user?.full_name || "User"}
            </h2>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">
              {user?.email}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
              <Badge tone={roleTone} size="md">
                {roleLabel}
              </Badge>
              {user?.title && (
                <Badge tone="slate" size="md">
                  {user.title}
                </Badge>
              )}
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-6">
              {user?.phone && (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-default)]">
                    <Icon name="phone" size={14} className="text-[var(--fg-muted)]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wider font-medium">Phone</p>
                    <p className="text-sm text-[var(--fg-primary)]">{user.phone}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-default)]">
                  <Icon name="mail" size={14} className="text-[var(--fg-muted)]" />
                </div>
                <div>
                  <p className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wider font-medium">Email</p>
                  <p className="text-sm text-[var(--fg-primary)]">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-default)]">
                  <Icon name="shield" size={14} className="text-[var(--fg-muted)]" />
                </div>
                <div>
                  <p className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wider font-medium">Roles</p>
                  <p className="text-sm text-[var(--fg-primary)] capitalize">
                    {userRoles.join(", ") || "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ===== APPEARANCE / THEME SECTION ===== */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--accent)]/10 border border-[var(--accent)]/20">
            <Icon name="sun" size={16} className="text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--fg-primary)] tracking-tight">
              Appearance
            </h3>
            <p className="text-xs text-[var(--fg-secondary)]">
              Customize how the Service Desk looks
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dark Theme Card */}
          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "relative group text-left rounded-xl overflow-hidden transition-all duration-300",
              "border-2 p-1",
              theme === "dark"
                ? "border-[var(--accent)] shadow-[0_0_20px_rgba(230,0,0,0.12)]"
                : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
            )}
          >
            {/* Mini preview — always shows dark theme look */}
            <div className="rounded-lg overflow-hidden bg-[#0a0a0c] p-3">
              {/* Mini sidebar + header */}
              <div className="flex gap-2 h-24">
                {/* Sidebar */}
                <div className="w-10 rounded-md bg-[#111113] border border-white/[0.06] p-1.5 flex flex-col gap-1.5">
                  <div className="w-full h-1.5 rounded-full bg-[#E60000]/40" />
                  <div className="w-full h-1.5 rounded-full bg-white/10" />
                  <div className="w-full h-1.5 rounded-full bg-white/10" />
                  <div className="w-full h-1.5 rounded-full bg-white/6" />
                </div>
                {/* Content area */}
                <div className="flex-1 flex flex-col gap-1.5">
                  {/* Header */}
                  <div className="h-4 rounded-md bg-white/[0.04] border border-white/[0.06]" />
                  {/* Cards */}
                  <div className="flex-1 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06]" />
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06]" />
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] col-span-2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Icon name="moon" size={16} className={theme === "dark" ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                <span className={cn("text-sm font-medium", theme === "dark" ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)]")}>
                  Dark
                </span>
              </div>
              {theme === "dark" && (
                <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center animate-scale-in">
                  <Icon name="check" size={12} className="text-white" />
                </div>
              )}
            </div>
          </button>

          {/* Light Theme Card */}
          <button
            onClick={() => setTheme("light")}
            className={cn(
              "relative group text-left rounded-xl overflow-hidden transition-all duration-300",
              "border-2 p-1",
              theme === "light"
                ? "border-[var(--accent)] shadow-[0_0_20px_rgba(230,0,0,0.12)]"
                : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
            )}
          >
            {/* Mini preview — always shows light theme look */}
            <div className="rounded-lg overflow-hidden bg-[#F5F6F8] p-3">
              {/* Mini sidebar + header */}
              <div className="flex gap-2 h-24">
                {/* Sidebar */}
                <div className="w-10 rounded-md bg-white border border-black/[0.08] p-1.5 flex flex-col gap-1.5">
                  <div className="w-full h-1.5 rounded-full bg-[#E60000]/30" />
                  <div className="w-full h-1.5 rounded-full bg-black/10" />
                  <div className="w-full h-1.5 rounded-full bg-black/10" />
                  <div className="w-full h-1.5 rounded-full bg-black/6" />
                </div>
                {/* Content area */}
                <div className="flex-1 flex flex-col gap-1.5">
                  {/* Header */}
                  <div className="h-4 rounded-md bg-white border border-black/[0.06]" />
                  {/* Cards */}
                  <div className="flex-1 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-white border border-black/[0.06]" />
                    <div className="rounded-md bg-white border border-black/[0.06]" />
                    <div className="rounded-md bg-white border border-black/[0.06] col-span-2" />
                  </div>
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Icon name="sun" size={16} className={theme === "light" ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                <span className={cn("text-sm font-medium", theme === "light" ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)]")}>
                  Light
                </span>
              </div>
              {theme === "light" && (
                <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center animate-scale-in">
                  <Icon name="check" size={12} className="text-white" />
                </div>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ===== PREFERENCES INFO ===== */}
      <Card hover={false} spotlight={false}>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/10 border border-blue-500/20">
            <Icon name="info" size={18} className="text-blue-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--fg-primary)] mb-1">
              About Preferences
            </h4>
            <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">
              Your theme preference is saved locally in your browser and will persist across sessions.
              The theme applies across all pages and components instantly.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
