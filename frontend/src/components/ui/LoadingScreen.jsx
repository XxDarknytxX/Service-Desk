/**
 * LoadingScreen — full-screen branded loader.
 *
 * A translucent, glassy AI "neural core" orb (Vodafone-red, theme-aware) that
 * breathes, rotates and morphs. Styling lives in main.css under `.ai-orb-*`.
 *
 * `state` drives a cinematic transition so login → loader → app flows as one
 * motion instead of three hard switches:
 *   enter — orb small + transparent (just mounted, login still behind)
 *   in    — orb bloomed to full + opaque (covering)
 *   exit  — orb zooms out + fades, revealing the app rising in underneath
 * Default `in` (used standalone, e.g. while the session bootstraps).
 */

const STATES = {
  enter: { opacity: 0, scale: 0.55 },
  in: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.5 },
};

export default function LoadingScreen({ message = "Loading your workspace...", state = "in" }) {
  const s = STATES[state] || STATES.in;
  return (
    <div
      className="ai-orb-bg fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      style={{
        opacity: s.opacity,
        transition: "opacity 720ms cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: state === "in" ? "auto" : "none",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="ai-orb"
        style={{
          transform: `scale(${s.scale})`,
          transition: "transform 820ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
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
