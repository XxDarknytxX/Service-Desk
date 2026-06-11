/**
 * Page Header Component
 * Linear/Modern Design System
 *
 * Features:
 * - Tight tracking headline
 * - Gradient text option
 * - Responsive layout
 * - Actions slot
 */

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  className,
  gradient = false,
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      <div>
        <h1
          className={cn(
            "text-2xl sm:text-3xl font-semibold tracking-tight",
            gradient
              ? "text-gradient"
              : "text-[var(--fg-primary)]"
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[var(--fg-secondary)] mt-1 text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Section Header - For subsections within a page
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-[var(--fg-primary)] tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-[var(--fg-secondary)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
