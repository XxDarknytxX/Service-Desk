/**
 * Modal Component
 * Linear/Modern Design System
 *
 * Features:
 * - Dark backdrop with blur
 * - Elevated card container with multi-layer shadows
 * - Accent glow line at top
 * - Scale-in animation
 * - Keyboard accessible (Escape to close, focus trap, focus restore)
 * - Click outside to close (mousedown-based so text-selection drags don't dismiss)
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import Button from "./Button";
import { useTheme } from "../../contexts/theme";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-7xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  size = "md",
  showCloseButton = true,
  fillContent = false,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  // Focus management: remember the trigger, focus the dialog, restore on close
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const t = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.contains(document.activeElement)) return;
      const first = dialog.querySelector(FOCUSABLE);
      (first || dialog).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(t);
      const prev = restoreFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // Keyboard: Escape closes, Tab cycles within the dialog
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const nodes = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const modalContent = (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      {/* Backdrop with blur */}
      <div
        className={cn(
          "fixed inset-0 backdrop-blur-sm transition-opacity animate-fade-in",
          isLight ? "bg-black/30" : "bg-black/70"
        )}
        aria-hidden="true"
      />

      {/* Modal Container — mousedown on the empty area closes (clicks that start
          inside the dialog and end outside, e.g. text selection, do not) */}
      <div
        className="flex min-h-full items-center justify-center p-4 sm:p-6"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={cn(
            "relative w-full",
            sizes[size],
            // Background
            "bg-[var(--bg-elevated)]",
            // Border and radius
            "rounded-2xl border border-[var(--border-default)]",
            // Shadow
            "shadow-[var(--shadow-elevated)]",
            // Animation
            "animate-scale-in",
            // Layout
            "flex flex-col max-h-[calc(100vh-3rem)]",
            // No outline when programmatically focused
            "focus:outline-none"
          )}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
        >
          {/* Accent glow line at top */}
          <div className={cn(
            "absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent",
            isLight ? "opacity-30" : "opacity-50"
          )} />

          {/* Inner glow line — dark mode only */}
          {!isLight && (
            <div className="absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          )}

          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[var(--border-default)] flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-[var(--fg-primary)] tracking-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-[var(--fg-secondary)] mt-1">
                    {subtitle}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className={cn(
                    "p-2 rounded-lg shrink-0",
                    "text-[var(--fg-muted)]",
                    "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]",
                    "transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  )}
                  aria-label="Close modal"
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className={cn(
            "px-6 py-5 flex-1 min-h-0 flex flex-col",
            fillContent ? "overflow-hidden" : "overflow-y-auto"
          )}>
            {children}
          </div>

          {/* Footer with Actions */}
          {actions && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-end gap-3",
                "px-6 py-4",
                "border-t border-[var(--border-default)]",
                "bg-[var(--bg-surface)]",
                "rounded-b-2xl",
                "flex-shrink-0"
              )}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

/**
 * Confirmation Modal
 * Pre-styled modal for confirmations with danger/confirm actions
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
  icon,
}) {
  const iconStyles = {
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    primary: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  const defaultIcons = {
    danger: "alertTriangle",
    primary: "info",
    success: "checkCircle",
  };

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title={title}
      size="sm"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "w-11 h-11 rounded-xl border flex items-center justify-center shrink-0",
            iconStyles[variant] || iconStyles.danger
          )}
        >
          <Icon name={icon || defaultIcons[variant] || "alertTriangle"} size={20} />
        </div>
        <div className="text-sm text-[var(--fg-secondary)] leading-relaxed pt-1.5">
          {message}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Alert Modal
 * Simple alert with single action
 */
export function AlertModal({
  open,
  onClose,
  title,
  message,
  buttonText = "OK",
  icon,
  variant = "info", // info, success, warning, error
}) {
  const iconColors = {
    info: "text-blue-400 bg-blue-500/10",
    success: "text-emerald-400 bg-emerald-500/10",
    warning: "text-amber-400 bg-amber-500/10",
    error: "text-red-400 bg-red-500/10",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      actions={
        <Button variant="secondary" onClick={onClose} className="w-full">
          {buttonText}
        </Button>
      }
    >
      <div className="text-center py-4">
        {icon && (
          <div
            className={cn(
              "w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center",
              iconColors[variant]
            )}
          >
            {icon}
          </div>
        )}
        <h3 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
          {title}
        </h3>
        <p className="text-sm text-[var(--fg-secondary)]">
          {message}
        </p>
      </div>
    </Modal>
  );
}
