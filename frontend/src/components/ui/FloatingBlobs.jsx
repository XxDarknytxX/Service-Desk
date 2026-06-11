/**
 * Floating Blobs Background Component
 * Linear/Modern Design System
 *
 * Features:
 * - Large animated gradient blobs for cinematic ambient lighting
 * - Heavy blur (150px+) for soft diffuse glow
 * - Slow floating animation (8-12s)
 * - Accent color pools that create depth
 * - Respects prefers-reduced-motion
 */

import { useTheme } from "../../contexts/theme";

export default function FloatingBlobs({ variant = "default" }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const variants = {
    // Default: Balanced ambient lighting for main app
    default: [
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/20 via-[var(--accent)]/10 to-transparent",
        size: "w-[900px] h-[600px]",
        position: "-top-[200px] -left-[200px]",
        blur: "blur-[150px]",
        animation: "animate-float-slow",
        delay: "",
      },
      {
        gradient: "bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-transparent",
        size: "w-[600px] h-[800px]",
        position: "-right-[150px] top-[20%]",
        blur: "blur-[120px]",
        animation: "animate-float-delayed",
        delay: "delay-2000",
      },
      {
        gradient: "bg-gradient-to-br from-orange-500/8 via-amber-500/5 to-transparent",
        size: "w-[500px] h-[500px]",
        position: "bottom-[10%] -left-[100px]",
        blur: "blur-[100px]",
        animation: "animate-float",
        delay: "delay-3000",
      },
    ],

    // Auth: Dramatic lighting for login/signup
    auth: [
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/25 via-[var(--accent)]/15 to-transparent",
        size: "w-[1000px] h-[800px]",
        position: "-top-[300px] -left-[300px]",
        blur: "blur-[180px]",
        animation: "animate-float-slow",
        delay: "",
      },
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/15 via-rose-500/10 to-transparent",
        size: "w-[800px] h-[600px]",
        position: "-right-[200px] -bottom-[200px]",
        blur: "blur-[150px]",
        animation: "animate-float",
        delay: "delay-2000",
      },
      {
        gradient: "bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent",
        size: "w-[400px] h-[400px]",
        position: "top-[40%] right-[10%]",
        blur: "blur-[100px]",
        animation: "animate-float-delayed",
        delay: "delay-3000",
      },
    ],

    // Minimal: Subtle for content-heavy pages
    minimal: [
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/10 to-transparent",
        size: "w-[600px] h-[400px]",
        position: "-top-[100px] -right-[100px]",
        blur: "blur-[120px]",
        animation: "animate-float-slow",
        delay: "",
      },
      {
        gradient: "bg-gradient-to-br from-rose-500/5 to-transparent",
        size: "w-[400px] h-[300px]",
        position: "bottom-[20%] -left-[50px]",
        blur: "blur-[100px]",
        animation: "animate-float-delayed",
        delay: "delay-2000",
      },
    ],

    // Vibrant: More prominent for hero sections
    vibrant: [
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/30 via-[var(--accent)]/15 to-transparent",
        size: "w-[1200px] h-[900px]",
        position: "-top-[400px] -left-[400px]",
        blur: "blur-[200px]",
        animation: "animate-float-slow",
        delay: "",
      },
      {
        gradient: "bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-transparent",
        size: "w-[800px] h-[1000px]",
        position: "-right-[300px] top-[10%]",
        blur: "blur-[150px]",
        animation: "animate-float-delayed",
        delay: "delay-1000",
      },
      {
        gradient: "bg-gradient-to-br from-orange-500/12 via-amber-500/8 to-transparent",
        size: "w-[600px] h-[600px]",
        position: "bottom-[5%] left-[10%]",
        blur: "blur-[120px]",
        animation: "animate-float",
        delay: "delay-2000",
      },
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/10 to-transparent",
        size: "w-[500px] h-[500px]",
        position: "-bottom-[200px] right-[15%]",
        blur: "blur-[100px]",
        animation: "animate-pulse-glow",
        delay: "delay-3000",
      },
    ],

    // Subtle: Very understated for data-heavy views
    subtle: [
      {
        gradient: "bg-gradient-to-br from-[var(--accent)]/8 to-transparent",
        size: "w-[500px] h-[400px]",
        position: "-top-[50px] -left-[50px]",
        blur: "blur-[100px]",
        animation: "animate-float-slow",
        delay: "",
      },
      {
        gradient: "bg-gradient-to-br from-slate-500/5 to-transparent",
        size: "w-[400px] h-[300px]",
        position: "-right-[50px] top-[30%]",
        blur: "blur-[80px]",
        animation: "animate-float-delayed",
        delay: "delay-2000",
      },
    ],
  };

  const blobs = variants[variant] || variants.default;

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden -z-10 transition-opacity duration-500 ${isLight ? "opacity-40" : "opacity-100"}`}
      aria-hidden="true"
    >
      {/* Base gradient layer */}
      <div className="absolute inset-0 bg-radial-gradient" />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 bg-noise opacity-50" />

      {/* Animated gradient blobs */}
      {blobs.map((blob, index) => (
        <div
          key={index}
          className={`
            absolute rounded-full
            ${blob.gradient}
            ${blob.size}
            ${blob.position}
            ${blob.blur}
            ${blob.animation}
            ${blob.delay}
          `}
        />
      ))}

      {/* Grid overlay for technical precision feel */}
      <div className="absolute inset-0 bg-grid opacity-30" />
    </div>
  );
}

/**
 * Mouse-tracking spotlight effect for cards
 * Use this as a child component inside interactive cards
 */
export function Spotlight({ className = "" }) {
  return (
    <div
      className={`
        pointer-events-none absolute inset-0 opacity-0
        group-hover:opacity-100 transition-opacity duration-300
        ${className}
      `}
      style={{
        background: "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(230, 0, 0, 0.06), transparent 40%)",
      }}
    />
  );
}

/**
 * Ambient glow orb - smaller accent decorations
 */
export function GlowOrb({
  color = "accent",
  size = "md",
  position = "top-right",
  animate = true
}) {
  const colorMap = {
    accent: "from-[var(--accent)] to-[var(--accent)]/50",
    rose: "from-rose-500 to-rose-500/50",
    amber: "from-amber-500 to-amber-500/50",
    emerald: "from-emerald-500 to-emerald-500/50",
    blue: "from-blue-500 to-blue-500/50",
  };

  const sizeMap = {
    sm: "w-24 h-24",
    md: "w-40 h-40",
    lg: "w-64 h-64",
  };

  const positionMap = {
    "top-right": "-top-10 -right-10",
    "top-left": "-top-10 -left-10",
    "bottom-right": "-bottom-10 -right-10",
    "bottom-left": "-bottom-10 -left-10",
    "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  };

  return (
    <div
      className={`
        absolute rounded-full blur-3xl opacity-20
        bg-gradient-to-br ${colorMap[color] || colorMap.accent}
        ${sizeMap[size] || sizeMap.md}
        ${positionMap[position] || positionMap["top-right"]}
        ${animate ? "animate-pulse-glow" : ""}
      `}
      aria-hidden="true"
    />
  );
}
