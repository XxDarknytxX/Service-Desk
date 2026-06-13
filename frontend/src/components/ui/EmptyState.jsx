/**
 * EmptyState — consistent, polished "nothing here yet" panel.
 *
 * Used by every list/table/detail surface so empty, first-run, and no-results
 * states all share one premium treatment: a softly glowing icon tile, a clear
 * title, supporting copy, and optional primary / secondary actions.
 */

import Icon from "./Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const toneMap = {
  default: "text-[var(--fg-muted)]",
  accent: "text-[var(--accent)]",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
  blue: "text-blue-500",
};

const glowMap = {
  default: "bg-[var(--fg-muted)]",
  accent: "bg-[var(--accent)]",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  blue: "bg-blue-500",
};

export default function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  secondaryAction,
  tone = "default",
  compact = false,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-up",
        compact ? "py-10 px-6" : "py-16 px-6",
        className
      )}
    >
      <div className="relative mb-4">
        <div
          className={cn(
            "absolute inset-0 -z-10 rounded-full blur-2xl opacity-[0.18]",
            glowMap[tone] || glowMap.default
          )}
        />
        <div className="h-14 w-14 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center shadow-[var(--shadow-sm)]">
          <Icon name={icon} size={24} className={toneMap[tone] || toneMap.default} />
        </div>
      </div>
      <h3 className="text-base font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--fg-secondary)] mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
