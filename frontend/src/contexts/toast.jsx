import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

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
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium",
              "animate-fade-in transition-all",
              t.type === "success" && "bg-emerald-900/90 border-emerald-500/30 text-emerald-100",
              t.type === "error"   && "bg-rose-900/90 border-rose-500/30 text-rose-100",
              t.type === "warning" && "bg-amber-900/90 border-amber-500/30 text-amber-100",
              t.type === "info"    && "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--fg-primary)]",
            ].filter(Boolean).join(" ")}
          >
            <span className="mt-0.5 shrink-0 text-base">
              {t.type === "success" && "✓"}
              {t.type === "error"   && "✕"}
              {t.type === "warning" && "⚠"}
              {t.type === "info"    && "ℹ"}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
