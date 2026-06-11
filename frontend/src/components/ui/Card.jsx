/**
 * Card Component
 * Linear/Modern Design System
 *
 * Features:
 * - Gradient background (subtle white fade)
 * - Multi-layer shadow system
 * - Mouse-tracking spotlight effect
 * - Hover lift animation
 * - Inner glow line at top
 */

import { useRef, useState, useCallback } from "react";
import { useTheme } from "../../contexts/theme";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Color tint presets for cards
const cardTints = {
  default: "from-white/[0.03] to-transparent",
  slate: "from-slate-500/[0.04] to-slate-900/[0.02]",
  red: "from-red-500/[0.04] to-red-900/[0.02]",
  rose: "from-rose-500/[0.04] to-rose-900/[0.02]",
  orange: "from-orange-500/[0.04] to-orange-900/[0.02]",
  amber: "from-amber-500/[0.04] to-amber-900/[0.02]",
  yellow: "from-yellow-500/[0.04] to-yellow-900/[0.02]",
  lime: "from-lime-500/[0.04] to-lime-900/[0.02]",
  green: "from-green-500/[0.04] to-green-900/[0.02]",
  emerald: "from-emerald-500/[0.04] to-emerald-900/[0.02]",
  teal: "from-teal-500/[0.04] to-teal-900/[0.02]",
  cyan: "from-cyan-500/[0.04] to-cyan-900/[0.02]",
  sky: "from-sky-500/[0.04] to-sky-900/[0.02]",
  blue: "from-blue-500/[0.04] to-blue-900/[0.02]",
  indigo: "from-indigo-500/[0.04] to-indigo-900/[0.02]",
  violet: "from-violet-500/[0.04] to-violet-900/[0.02]",
  purple: "from-purple-500/[0.04] to-purple-900/[0.02]",
  fuchsia: "from-fuchsia-500/[0.04] to-fuchsia-900/[0.02]",
  pink: "from-pink-500/[0.04] to-pink-900/[0.02]",
};

// Spotlight colors that match tints
const spotlightColors = {
  default: "rgba(255, 255, 255, 0.04)",
  slate: "rgba(100, 116, 139, 0.06)",
  red: "rgba(239, 68, 68, 0.06)",
  rose: "rgba(244, 63, 94, 0.06)",
  orange: "rgba(249, 115, 22, 0.06)",
  amber: "rgba(245, 158, 11, 0.06)",
  yellow: "rgba(234, 179, 8, 0.06)",
  lime: "rgba(132, 204, 22, 0.06)",
  green: "rgba(34, 197, 94, 0.06)",
  emerald: "rgba(16, 185, 129, 0.06)",
  teal: "rgba(20, 184, 166, 0.06)",
  cyan: "rgba(6, 182, 212, 0.06)",
  sky: "rgba(14, 165, 233, 0.06)",
  blue: "rgba(59, 130, 246, 0.06)",
  indigo: "rgba(99, 102, 241, 0.06)",
  violet: "rgba(139, 92, 246, 0.06)",
  purple: "rgba(168, 85, 247, 0.06)",
  fuchsia: "rgba(217, 70, 239, 0.06)",
  pink: "rgba(236, 72, 153, 0.06)",
};

export default function Card({
  children,
  className,
  padding = true,
  hover = true,
  spotlight = false,
  onClick,
  accent = false,
  size = "md",
  tint = "default",
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const cardRef = useRef(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback((e) => {
    if (!spotlight || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePosition({ x, y });
  }, [spotlight]);

  const paddingSizes = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  const gradientTint = cardTints[tint] || cardTints.default;
  const spotlightColor = spotlightColors[tint] || spotlightColors.default;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      className={cn(
        // Base card styles
        "relative overflow-hidden group",
        "rounded-xl",
        // Gradient background with tint — light mode uses elevated bg
        isLight ? "bg-[var(--bg-elevated)]" : ["bg-gradient-to-br", gradientTint],
        // Border
        "border border-[var(--border-default)]",
        // Multi-layer shadow — lighter in light mode
        isLight
          ? "shadow-[var(--shadow-card)]"
          : "shadow-[0_0_0_1px_var(--border-default),0_2px_8px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)]",
        // Transitions
        "transition-all duration-200",
        // Hover effects
        hover && [
          "hover:border-[var(--border-hover)]",
          isLight
            ? "hover:shadow-[var(--shadow-card-hover)]"
            : "hover:shadow-[0_0_0_1px_var(--border-hover),0_4px_16px_rgba(0,0,0,0.4),0_16px_48px_rgba(0,0,0,0.3)]",
          "hover:-translate-y-0.5",
        ],
        // Clickable state
        onClick && "cursor-pointer",
        // Padding
        padding && paddingSizes[size],
        // Accent line at top
        accent && "surface-accent-top",
        className
      )}
    >
      {/* Inner glow line at top — hidden in light mode */}
      {!isLight && (
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      )}

      {/* Mouse-tracking spotlight */}
      {spotlight && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, ${spotlightColor}, transparent 40%)`,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}

/**
 * Stat Card
 * Specialized card for displaying statistics
 */
export function StatCard({
  label,
  value,
  icon,
  color = "accent",
  trend,
  trendValue,
  className,
}) {
  const colorMap = {
    accent: {
      iconBg: "bg-[var(--accent)]/10",
      iconText: "text-[var(--accent)]",
      valueText: "text-[var(--accent)]",
      dot: "bg-[var(--accent)]",
      tint: "red",
    },
    blue: {
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-400",
      valueText: "text-blue-400",
      dot: "bg-blue-500",
      tint: "blue",
    },
    emerald: {
      iconBg: "bg-emerald-500/10",
      iconText: "text-emerald-400",
      valueText: "text-emerald-400",
      dot: "bg-emerald-500",
      tint: "emerald",
    },
    amber: {
      iconBg: "bg-amber-500/10",
      iconText: "text-amber-400",
      valueText: "text-amber-400",
      dot: "bg-amber-500",
      tint: "amber",
    },
    violet: {
      iconBg: "bg-violet-500/10",
      iconText: "text-violet-400",
      valueText: "text-violet-400",
      dot: "bg-violet-500",
      tint: "violet",
    },
    rose: {
      iconBg: "bg-rose-500/10",
      iconText: "text-rose-400",
      valueText: "text-rose-400",
      dot: "bg-rose-500",
      tint: "rose",
    },
    cyan: {
      iconBg: "bg-cyan-500/10",
      iconText: "text-cyan-400",
      valueText: "text-cyan-400",
      dot: "bg-cyan-500",
      tint: "cyan",
    },
    indigo: {
      iconBg: "bg-indigo-500/10",
      iconText: "text-indigo-400",
      valueText: "text-indigo-400",
      dot: "bg-indigo-500",
      tint: "indigo",
    },
  };

  const colors = colorMap[color] || colorMap.accent;

  return (
    <Card className={className} hover spotlight tint={colors.tint}>
      <div className="flex flex-col h-full">
        {/* Header with icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("status-dot", colors.dot)} />
            <span className="text-label">
              {label}
            </span>
          </div>
          {icon && (
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                "border border-[var(--border-default)]",
                colors.iconBg,
                colors.iconText
              )}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <p
          className={cn(
            "text-4xl font-semibold tracking-tight",
            colors.valueText
          )}
        >
          {value}
        </p>

        {/* Trend indicator */}
        {trend && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                trend === "up" && "bg-emerald-500/10 text-emerald-400",
                trend === "down" && "bg-rose-500/10 text-rose-400",
                trend === "neutral" && "bg-slate-500/10 text-slate-400"
              )}
            >
              {trend === "up" ? "+" : trend === "down" ? "-" : ""}{trendValue}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Feature Card
 * Card with prominent icon for feature highlights
 */
export function FeatureCard({
  title,
  description,
  icon,
  iconColor = "accent",
  className,
  onClick,
}) {
  const iconColorMap = {
    accent: { style: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20", tint: "red" },
    blue: { style: "bg-blue-500/10 text-blue-400 border-blue-500/20", tint: "blue" },
    emerald: { style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", tint: "emerald" },
    amber: { style: "bg-amber-500/10 text-amber-400 border-amber-500/20", tint: "amber" },
    violet: { style: "bg-violet-500/10 text-violet-400 border-violet-500/20", tint: "violet" },
    pink: { style: "bg-pink-500/10 text-pink-400 border-pink-500/20", tint: "pink" },
    cyan: { style: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", tint: "cyan" },
    indigo: { style: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", tint: "indigo" },
    rose: { style: "bg-rose-500/10 text-rose-400 border-rose-500/20", tint: "rose" },
    teal: { style: "bg-teal-500/10 text-teal-400 border-teal-500/20", tint: "teal" },
  };

  const colorConfig = iconColorMap[iconColor] || iconColorMap.accent;

  return (
    <Card className={className} onClick={onClick} hover spotlight tint={colorConfig.tint}>
      {/* Icon */}
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
          "border transition-transform duration-200 group-hover:scale-110",
          colorConfig.style
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-[var(--fg-primary)] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-[var(--fg-secondary)] leading-relaxed">
        {description}
      </p>
    </Card>
  );
}

/**
 * List Card
 * Card optimized for list content with no padding
 */
export function ListCard({
  children,
  header,
  className,
  tint = "default",
}) {
  return (
    <Card className={cn("h-full flex flex-col", className)} hover={false} padding={false} tint={tint}>
      {header && (
        <div className="px-5 py-4 border-b border-[var(--border-default)]">
          {header}
        </div>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </Card>
  );
}
