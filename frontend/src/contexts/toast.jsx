import { createContext, useContext, useState, useCallback, useRef } from "react";
import Icon from "../components/ui/Icon";

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: {
    icon: "checkCircle",
    iconClass: "text-emerald-400 bg-emerald-500/10",
    barClass: "bg-emerald-500",
  },
  error: {
    icon: "alertCircle",
    iconClass: "text-rose-400 bg-rose-500/10",
    barClass: "bg-rose-500",
  },
  warning: {
    icon: "alertTriangle",
    iconClass: "text-amber-400 bg-amber-500/10",
    barClass: "bg-amber-500",
  },
  info: {
    icon: "info",
    iconClass: "text-blue-400 bg-blue-500/10",
    barClass: "bg-blue-500",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 180);
  }, []);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const toast = {
    success: (msg, dur) => addToast(msg, "success", dur),
    error: (msg, dur) => addToast(msg, "error", dur ?? 6000),
    info: (msg, dur) => addToast(msg, "info", dur),
    warning: (msg, dur) => addToast(msg, "warning", dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 pointer-events-none"
        style={{ maxWidth: 400 }}
        aria-live="polite"
      >
        {toasts.map(t => {
          const style = TOAST_STYLES[t.type] || TOAST_STYLES.info;
          return (
            <div
              key={t.id}
              role="status"
              className={[
                "pointer-events-auto relative flex items-start gap-3 pl-4 pr-3 py-3 overflow-hidden",
                "rounded-xl border border-[var(--border-default)]",
                "bg-[var(--bg-elevated)] text-[var(--fg-primary)]",
                "shadow-[var(--shadow-elevated)]",
                "text-sm",
                t.leaving ? "opacity-0 translate-x-3 transition-all duration-150" : "animate-slide-in-right",
              ].filter(Boolean).join(" ")}
            >
              {/* Accent bar */}
              <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${style.barClass}`} />
              {/* Icon */}
              <span className={`mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${style.iconClass}`}>
                <Icon name={style.icon} size={14} />
              </span>
              <span className="flex-1 leading-relaxed py-0.5 font-medium">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 p-1.5 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-colors"
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
