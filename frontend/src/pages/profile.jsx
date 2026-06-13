/**
 * Profile Page — Vodafone Service Desk
 *
 * Branded hero (gradient banner + overlapping avatar), identity details,
 * appearance/theme switcher with live preview cards, and preferences note.
 * Theme logic preserved.
 */

import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import Icon from "../components/ui/Icon";
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

  const detailTiles = [
    { icon: "mail", label: "Email", value: user?.email || "—" },
    ...(user?.phone ? [{ icon: "phone", label: "Phone", value: user.phone }] : []),
    { icon: "shield", label: "Roles", value: userRoles.join(", ") || "—", capitalize: true },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon="user"
        title="Profile"
        subtitle="Manage your account settings and preferences"
      />

      {/* ===== HERO IDENTITY CARD ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] animate-fade-up">
        {/* Brand glow — fades smoothly down into the card (no hard banner seam) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[var(--accent)]/[0.16] via-[var(--accent)]/[0.05] to-transparent" />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-grid opacity-40"
          style={{
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <div className="pointer-events-none absolute -top-16 right-8 h-52 w-52 rounded-full bg-[var(--accent)] opacity-[0.13] blur-3xl" />

        {/* Body */}
        <div className="relative px-6 pt-12 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div
              className={cn(
                "h-24 w-24 rounded-2xl flex items-center justify-center flex-shrink-0",
                "bg-[var(--accent)]/10 text-[var(--accent)] text-3xl font-bold tracking-tight",
                "ring-4 ring-[var(--bg-elevated)] border border-[var(--accent)]/20",
                "shadow-[0_0_30px_rgba(230,0,0,0.12)]"
              )}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-xl font-semibold text-[var(--fg-primary)] tracking-tight">
                {user?.fullName || user?.full_name || "User"}
              </h2>
              <p className="text-sm text-[var(--fg-secondary)] mt-0.5 truncate">{user?.email}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <Badge tone={roleTone} size="md">{roleLabel}</Badge>
                {user?.title && <Badge tone="slate" size="md">{user.title}</Badge>}
              </div>
            </div>
          </div>

          {/* Detail tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-[var(--border-default)]">
            {detailTiles.map((tile) => (
              <div key={tile.label} className="flex items-center gap-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] px-3.5 py-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-default)] shrink-0">
                  <Icon name={tile.icon} size={15} className="text-[var(--fg-muted)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-label">{tile.label}</p>
                  <p className={cn("text-sm text-[var(--fg-primary)] truncate", tile.capitalize && "capitalize")}>
                    {tile.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== APPEARANCE ===== */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] p-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--accent)]/10 border border-[var(--accent)]/15">
            <Icon name="sun" size={16} className="text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--fg-primary)] tracking-tight">Appearance</h3>
            <p className="text-xs text-[var(--fg-secondary)]">Customize how the Service Desk looks</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dark Theme Card */}
          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "relative group text-left rounded-xl overflow-hidden transition-all duration-300 border-2 p-1",
              theme === "dark"
                ? "border-[var(--accent)] shadow-[0_0_20px_rgba(230,0,0,0.12)]"
                : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
            )}
          >
            <div className="rounded-lg overflow-hidden bg-[#0a0a0c] p-3">
              <div className="flex gap-2 h-24">
                <div className="w-10 rounded-md bg-[#111113] border border-white/[0.06] p-1.5 flex flex-col gap-1.5">
                  <div className="w-full h-1.5 rounded-full bg-[#E60000]/40" />
                  <div className="w-full h-1.5 rounded-full bg-white/10" />
                  <div className="w-full h-1.5 rounded-full bg-white/10" />
                  <div className="w-full h-1.5 rounded-full bg-white/6" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-4 rounded-md bg-white/[0.04] border border-white/[0.06]" />
                  <div className="flex-1 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06]" />
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06]" />
                    <div className="rounded-md bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/[0.06] col-span-2" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Icon name="moon" size={16} className={theme === "dark" ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                <span className={cn("text-sm font-medium", theme === "dark" ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)]")}>Dark</span>
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
              "relative group text-left rounded-xl overflow-hidden transition-all duration-300 border-2 p-1",
              theme === "light"
                ? "border-[var(--accent)] shadow-[0_0_20px_rgba(230,0,0,0.12)]"
                : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
            )}
          >
            <div className="rounded-lg overflow-hidden bg-[#F5F6F8] p-3">
              <div className="flex gap-2 h-24">
                <div className="w-10 rounded-md bg-white border border-black/[0.08] p-1.5 flex flex-col gap-1.5">
                  <div className="w-full h-1.5 rounded-full bg-[#E60000]/30" />
                  <div className="w-full h-1.5 rounded-full bg-black/10" />
                  <div className="w-full h-1.5 rounded-full bg-black/10" />
                  <div className="w-full h-1.5 rounded-full bg-black/6" />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-4 rounded-md bg-white border border-black/[0.06]" />
                  <div className="flex-1 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-white border border-black/[0.06]" />
                    <div className="rounded-md bg-white border border-black/[0.06]" />
                    <div className="rounded-md bg-white border border-black/[0.06] col-span-2" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Icon name="sun" size={16} className={theme === "light" ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"} />
                <span className={cn("text-sm font-medium", theme === "light" ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)]")}>Light</span>
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

      {/* ===== ABOUT PREFERENCES ===== */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] p-5 animate-fade-up" style={{ animationDelay: "160ms" }}>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/10 border border-blue-500/15">
            <Icon name="info" size={18} className="text-blue-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--fg-primary)] mb-1">About Preferences</h4>
            <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">
              Your theme preference is saved locally in your browser and will persist across sessions.
              The theme applies across all pages and components instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
