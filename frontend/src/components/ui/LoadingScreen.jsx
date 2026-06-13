/**
 * LoadingScreen — full-screen branded loader.
 *
 * A 3×3 grid of glossy red chips that ripple in a diagonal wave. Tiles stay
 * vibrantly red (the wave is a scale + brightness pop, not a fade), with a top
 * gloss highlight, inner shade, and soft glow for depth, plus a subtle
 * light→deep diagonal colour gradient. No text — just the animated mark.
 * Used for the post-login splash and while the session bootstraps.
 */

// Vivid red per diagonal band (row + col, 0‑4): top‑left lighter → bottom‑right deeper.
const TILE_COLORS = ["#FF5A5A", "#F23636", "#E60000", "#D10005", "#B3000F"];

export default function LoadingScreen({ message = "Loading your workspace..." }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)] overflow-hidden"
      role="status"
      aria-live="polite"
    >
      {/* Ambient accent glow */}
      <div className="absolute w-[540px] h-[540px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl animate-pulse-glow pointer-events-none" />

      {/* Pulsating chip grid (diagonal ripple) */}
      <div className="relative grid grid-cols-3 gap-3 animate-fade-in">
        {Array.from({ length: 9 }).map((_, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const color = TILE_COLORS[row + col];
          return (
            <span
              key={i}
              className="h-11 w-11 rounded-[13px] animate-tile-pulse"
              style={{
                background: color,
                boxShadow:
                  "inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -5px 9px rgba(120,0,0,0.28), 0 5px 14px rgba(230,0,0,0.3)",
                animationDelay: `${(row + col) * 0.1}s`,
              }}
            />
          );
        })}
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}
