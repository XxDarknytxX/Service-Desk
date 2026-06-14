/**
 * LoadingScreen — rotating particle-sphere loader (everstride.ch-inspired).
 *
 * A point-cloud sphere displaced by animated 3D noise (see ParticleSphere),
 * floating on a deep navy field. The additive-blended dots need a dark
 * backdrop to glow, so this loader stays dark in both app themes.
 *
 * `state` drives the boot envelope (enter/in/exit): opacity + a subtle scale,
 * so it flows through the BootProvider login → loader → app transition.
 */

import ParticleSphere from "./ParticleSphere";
import { useTheme } from "../../contexts/theme";

const STATES = {
  enter: { opacity: 0, scale: 0.92 },
  in: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.08 },
};

const DARK_FIELD = "radial-gradient(circle at 50% 45%, #170609 0%, #0b0305 55%, #040102 100%)";
const LIGHT_FIELD = "radial-gradient(circle at 50% 45%, #ffffff 0%, #fdf0f1 55%, #f7e5e8 100%)";

export default function LoadingScreen({ message = "Loading your workspace...", state = "in", minimal = false }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  // Minimal bootstrap loader — used while the session is restored on a normal
  // page reload. No WebGL/particles (which would flash a static frame and then
  // hard-cut); just a calm spinner on the app's own background so it loads in
  // seamlessly. The full particle animation is reserved for the login boot.
  if (minimal) {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]"
        role="status"
        aria-live="polite"
      >
        <div className="h-8 w-8 rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)] animate-spin" />
        <span className="sr-only">{message}</span>
      </div>
    );
  }

  const s = STATES[state] || STATES.in;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      style={{
        background: dark ? DARK_FIELD : LIGHT_FIELD,
        opacity: s.opacity,
        // on exit, hold opaque while the blast expands, then fade to reveal the app
        transition: `opacity 1600ms cubic-bezier(0.16, 1, 0.3, 1) ${state === "exit" ? "1000ms" : "0ms"}`,
        pointerEvents: state === "in" ? "auto" : "none",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${s.scale})`, transition: `transform ${state === "exit" ? "1700ms" : "800ms"} cubic-bezier(0.16, 1, 0.3, 1)` }}
      >
        <ParticleSphere
          blast={state === "exit"}
          additive={dark}
          colorA={dark ? "#52000e" : "#ff97a6"}
          colorB={dark ? "#e10018" : "#ff4f66"}
          colorC={dark ? "#ff6f88" : "#f01d36"}
        />
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}
