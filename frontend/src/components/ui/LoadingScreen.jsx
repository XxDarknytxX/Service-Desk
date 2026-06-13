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

const STATES = {
  enter: { opacity: 0, scale: 0.92 },
  in: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.08 },
};

const DARK_FIELD = "radial-gradient(circle at 50% 44%, #0d1224 0%, #080a14 56%, #04050b 100%)";

export default function LoadingScreen({ message = "Loading your workspace...", state = "in" }) {
  const s = STATES[state] || STATES.in;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden"
      style={{
        background: DARK_FIELD,
        opacity: s.opacity,
        transition: "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: state === "in" ? "auto" : "none",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${s.scale})`, transition: "transform 800ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        <ParticleSphere />
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}
