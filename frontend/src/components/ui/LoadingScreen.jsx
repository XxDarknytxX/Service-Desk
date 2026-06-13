/**
 * LoadingScreen — full-screen branded loader.
 *
 * A translucent, glassy AI "neural core" orb that slowly breathes, rotates and
 * morphs, with deep electric-blue / cyan / indigo / violet light and a soft
 * neon aura. Theme-aware: dark navy field in dark mode, white field in light
 * mode (styling lives in main.css under `.ai-orb-*`). No text — just the mark.
 * Used for the post-login splash and while the session bootstraps.
 */

export default function LoadingScreen({ message = "Loading your workspace..." }) {
  return (
    <div
      className="ai-orb-bg fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <div className="ai-orb">
        <div className="ai-orb-aura" />
        <div className="ai-orb-stage">
          <div className="ai-orb-breathe">
            <div className="ai-orb-spin">
              <div className="ai-orb-blob b2" />
              <div className="ai-orb-blob">
                <div className="ai-orb-layer ai-orb-grid" />
                <div className="ai-orb-hl magenta" />
                <div className="ai-orb-hl cyan" />
                <div className="ai-orb-hl violet" />
                <div className="ai-orb-sheen" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}
