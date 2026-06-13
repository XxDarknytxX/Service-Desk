/**
 * LoadingScreen — full-screen branded loader.
 * Vodafone speechmark wrapped in a spinning accent arc, ambient glow,
 * and staggered loading dots. Used while the session bootstraps.
 */

import VodafoneLogo from "./VodafoneLogo";

export default function LoadingScreen({ message = "Loading your workspace..." }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)] overflow-hidden"
      role="status"
      aria-live="polite"
    >
      {/* Ambient accent glow */}
      <div className="absolute w-[480px] h-[480px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl animate-pulse-glow pointer-events-none" />

      <div className="relative flex flex-col items-center animate-fade-in">
        {/* Logo with spinning arc */}
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/15 border-t-[var(--accent)] animate-spin" />
          <div className="absolute inset-[10px] flex items-center justify-center">
            <VodafoneLogo size={60} className="drop-shadow-[0_0_20px_rgba(230,0,0,0.35)]" />
          </div>
        </div>

        <h1 className="mt-7 text-base font-semibold text-[var(--fg-primary)] tracking-tight">
          Service Desk
        </h1>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">Vodafone Fiji</p>

        {/* Staggered dots */}
        <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-loading-dot"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </div>

        <span className="sr-only">{message}</span>
      </div>
    </div>
  );
}
