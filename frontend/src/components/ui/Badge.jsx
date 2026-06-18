/**
 * Badge Component
 * Linear/Modern Design System
 *
 * Features:
 * - Subtle background tints with matching text
 * - Multiple color tones for status indication
 * - Compact pill shape
 * - Optional dot indicator
 */

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const toneStyles = {
  slate: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  pink: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  green: "bg-green-500/10 text-green-400 border-green-500/20",
  accent: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
  brand: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
};

const dotColors = {
  slate: "bg-slate-400",
  blue: "bg-blue-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  red: "bg-red-400",
  orange: "bg-orange-400",
  violet: "bg-violet-400",
  indigo: "bg-indigo-400",
  cyan: "bg-cyan-400",
  pink: "bg-pink-400",
  green: "bg-green-400",
  accent: "bg-[var(--accent)]",
  brand: "bg-[var(--accent)]",
};

const sizeStyles = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export default function Badge({
  children,
  tone = "slate",
  size = "md",
  dot = false,
  icon,
  iconPosition = "left",
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-full border",
        toneStyles[tone] || toneStyles.slate,
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColors[tone] || dotColors.slate
          )}
        />
      )}
      {icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>}
      {children}
      {icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
    </span>
  );
}

/**
 * Status Badge - Pre-configured for common status types
 */
export function StatusBadge({ status, size = "md", className }) {
  const statusConfig = {
    // Ticket statuses
    draft: { tone: "slate", label: "Draft", dot: true },
    open: { tone: "blue", label: "Open", dot: true },
    pending: { tone: "amber", label: "Pending", dot: true },
    in_progress: { tone: "indigo", label: "In Progress", dot: true },
    on_hold: { tone: "violet", label: "On Hold", dot: true },
    solved: { tone: "emerald", label: "Solved", dot: true },
    closed: { tone: "slate", label: "Closed", dot: false },

    // Priority levels
    urgent: { tone: "red", label: "Urgent", dot: true },
    high: { tone: "orange", label: "High", dot: true },
    medium: { tone: "amber", label: "Medium", dot: true },
    low: { tone: "emerald", label: "Low", dot: true },

    // Generic statuses
    active: { tone: "emerald", label: "Active", dot: true },
    inactive: { tone: "slate", label: "Inactive", dot: false },
    draft: { tone: "slate", label: "Draft", dot: false },
    published: { tone: "emerald", label: "Published", dot: true },
    archived: { tone: "slate", label: "Archived", dot: false },

    // User roles
    admin: { tone: "violet", label: "Admin", dot: false },
    agent: { tone: "blue", label: "Agent", dot: false },
    requester: { tone: "slate", label: "Requester", dot: false },
  };

  const normalizedStatus = status?.toLowerCase().replace(/\s+/g, "_");
  const config = statusConfig[normalizedStatus] || {
    tone: "slate",
    label: status || "Unknown",
    dot: false,
  };

  return (
    <Badge
      tone={config.tone}
      size={size}
      dot={config.dot}
      className={className}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Counter Badge - For notification counts
 */
export function CounterBadge({
  count,
  max = 99,
  tone = "accent",
  size = "sm",
  className,
}) {
  const displayCount = count > max ? `${max}+` : count;

  if (!count || count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-full min-w-[20px]",
        size === "sm" && "h-5 px-1.5 text-[10px]",
        size === "md" && "h-6 px-2 text-xs",
        tone === "accent" && "bg-[var(--accent)] text-white",
        tone === "brand" && "bg-[var(--accent)] text-white",
        tone === "slate" && "bg-slate-500 text-white",
        className
      )}
    >
      {displayCount}
    </span>
  );
}

/**
 * Tag Badge - For labels/tags with optional remove button
 */
export function TagBadge({
  children,
  tone = "slate",
  onRemove,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border",
        toneStyles[tone] || toneStyles.slate,
        className
      )}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label="Remove"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 3l6 6M9 3L3 9" />
          </svg>
        </button>
      )}
    </span>
  );
}
