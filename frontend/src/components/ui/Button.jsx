/**
 * Button Component
 * Linear/Modern Design System
 *
 * Features:
 * - Multi-layer shadows with accent glow
 * - Precision micro-interactions (scale 0.98)
 * - Subtle hover lift (2-4px)
 * - Inner highlight for depth
 * - Loading state with spinner
 */

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const variantStyles = {
  // Primary: Solid accent with glow
  primary: cn(
    "bg-[var(--accent)] text-white font-medium",
    "shadow-[0_0_0_1px_rgba(230,0,0,0.5),0_2px_8px_rgba(230,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:bg-[var(--accent-hover)]",
    "hover:shadow-[0_0_0_1px_rgba(230,0,0,0.6),0_4px_16px_rgba(230,0,0,0.35),0_0_40px_rgba(230,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.15)]",
    "hover:-translate-y-0.5",
    "active:scale-[0.98] active:shadow-[0_0_0_1px_rgba(230,0,0,0.5),0_1px_4px_rgba(230,0,0,0.2)]"
  ),

  // Secondary: Subtle surface with border
  secondary: cn(
    "bg-[var(--bg-surface)] text-[var(--fg-primary)] font-medium",
    "shadow-[0_0_0_1px_var(--border-default),inset_0_1px_0_rgba(255,255,255,0.03)]",
    "hover:bg-[var(--bg-surface-hover)]",
    "hover:shadow-[0_0_0_1px_var(--border-hover),0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]",
    "hover:-translate-y-0.5",
    "active:scale-[0.98] active:bg-[var(--bg-surface)]"
  ),

  // Ghost: Minimal, no border
  ghost: cn(
    "bg-transparent text-[var(--fg-secondary)] font-medium",
    "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]",
    "active:scale-[0.98]"
  ),

  // Danger: Red warning
  danger: cn(
    "bg-[var(--error)] text-white font-medium",
    "shadow-[0_0_0_1px_rgba(239,68,68,0.5),0_2px_8px_rgba(239,68,68,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:bg-red-500",
    "hover:shadow-[0_0_0_1px_rgba(239,68,68,0.6),0_4px_16px_rgba(239,68,68,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]",
    "hover:-translate-y-0.5",
    "active:scale-[0.98]"
  ),

  // Success: Green confirmation
  success: cn(
    "bg-[var(--success)] text-white font-medium",
    "shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_2px_8px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:bg-emerald-400",
    "hover:shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_4px_16px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]",
    "hover:-translate-y-0.5",
    "active:scale-[0.98]"
  ),

  // Outline: Border only
  outline: cn(
    "bg-transparent text-[var(--accent)] font-medium",
    "shadow-[inset_0_0_0_1px_var(--border-accent)]",
    "hover:bg-[var(--accent-subtle)]",
    "hover:shadow-[inset_0_0_0_1px_var(--accent),0_0_20px_rgba(230,0,0,0.1)]",
    "active:scale-[0.98]"
  ),

  // Glass: Translucent with blur
  glass: cn(
    "bg-white/[0.03] backdrop-blur-xl text-[var(--fg-primary)] font-medium",
    "shadow-[0_0_0_1px_var(--border-default),inset_0_1px_0_rgba(255,255,255,0.03)]",
    "hover:bg-white/[0.06]",
    "hover:shadow-[0_0_0_1px_var(--border-hover),0_4px_12px_rgba(0,0,0,0.3)]",
    "hover:-translate-y-0.5",
    "active:scale-[0.98]"
  ),
};

const sizeStyles = {
  xs: "px-2.5 py-1.5 text-xs rounded-md min-h-[28px] gap-1.5",
  sm: "px-3 py-2 text-sm rounded-lg min-h-[36px] gap-2",
  md: "px-4 py-2.5 text-sm rounded-lg min-h-[40px] gap-2",
  lg: "px-5 py-3 text-base rounded-lg min-h-[48px] gap-2.5",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  type = "button",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        // Base styles
        "inline-flex items-center justify-center",
        "transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:transform-none disabled:hover:shadow-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        // Variant & size
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && icon && iconPosition === "left" && (
        <span className="shrink-0">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === "right" && (
        <span className="shrink-0">{icon}</span>
      )}
    </button>
  );
}

/**
 * Icon Button - Square button for icons only
 */
export function IconButton({
  children,
  variant = "ghost",
  size = "md",
  className,
  ...props
}) {
  const iconSizeStyles = {
    xs: "w-7 h-7 rounded-md",
    sm: "w-9 h-9 rounded-lg",
    md: "w-10 h-10 rounded-lg",
    lg: "w-12 h-12 rounded-lg",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        "transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
        variantStyles[variant],
        iconSizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
