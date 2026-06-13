/**
 * Login Page — one continuous canvas.
 *
 * The whole viewport is a single dark gradient surface (independent of the
 * app theme — the theme applies after sign-in). Brand content on the left,
 * the form on the right — both simply sit on the same background, so there
 * is no panel edge anywhere. Decorative layers (grid, watermark, orbs, ring)
 * live at the root and flow freely across the entire page.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import VodafoneLogo from "../components/ui/VodafoneLogo";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* Glass card for the floating product artifacts */
function GlassCard({ className, children }) {
  return (
    <div
      className={cn(
        "absolute rounded-2xl p-4",
        "bg-white/[0.045] backdrop-blur-xl",
        "border border-white/10",
        "shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = cn(
    "w-full pl-11 pr-4 py-3 rounded-xl text-sm",
    "bg-white text-[#111318]",
    "border border-black/10 shadow-sm",
    "placeholder:text-black/30",
    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
    "transition-all duration-200"
  );

  return (
    <div className="login-canvas relative min-h-screen flex overflow-hidden">
      {/* ── Page-wide decorative layers (one canvas, no boundaries) ── */}
      {/* Grid texture, fading out as the canvas turns white */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(100deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, transparent 64%)",
          WebkitMaskImage:
            "linear-gradient(100deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, transparent 64%)",
        }}
      />
      <VodafoneLogo
        size={620}
        className="absolute -top-44 -left-44 opacity-[0.06] pointer-events-none select-none"
      />
      {/* Soft glow riding the red→white transition */}
      <div className="hidden lg:block absolute top-[10%] left-[52%] w-[420px] h-[420px] rounded-full bg-white/[0.10] blur-3xl animate-pulse-glow pointer-events-none" />
      {/* Faint blush on the white side so it isn't sterile */}
      <div className="absolute -bottom-32 right-[6%] w-[380px] h-[380px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl pointer-events-none" />
      {/* Slow-drifting dashed ring across the lower transition */}
      <div
        className="hidden lg:block absolute -bottom-56 left-[46%] w-[520px] h-[520px] rounded-full animate-drift-ring pointer-events-none"
        style={{ border: "1.5px dashed rgba(230,0,0,0.16)" }}
      />

      {/* ═══════════ LEFT — BRAND CONTENT (hidden on mobile) ═══════════ */}
      <div className="relative z-10 hidden lg:flex lg:w-[55%] flex-col justify-between p-12 xl:p-16">
        {/* Top: wordmark */}
        <div className="flex items-center gap-3 animate-fade-up">
          <VodafoneLogo size={40} className="drop-shadow-[0_0_18px_rgba(230,0,0,0.5)]" />
          <div>
            <p className="text-[15px] font-semibold text-white tracking-tight leading-tight">
              Vodafone Fiji
            </p>
            <p className="text-[11px] text-white/45 tracking-wide uppercase">
              Service Desk
            </p>
          </div>
        </div>

        {/* Middle: headline + floating product artifacts */}
        <div className="my-10">
          <h1
            className="text-4xl xl:text-[44px] font-semibold tracking-tight leading-[1.08] text-white animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            Support that keeps
            <br />
            <span
              style={{
                background: "linear-gradient(90deg, #ffffff 0%, #ffc9c9 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Fiji connected.
            </span>
          </h1>
          <p
            className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55 animate-fade-up"
            style={{ animationDelay: "200ms" }}
          >
            One desk for tickets, approvals, assets and SLAs — built for every
            Vodafone Fiji team.
          </p>

          <div
            className="relative h-[240px] mt-12 max-w-[560px] animate-fade-up"
            style={{ animationDelay: "280ms" }}
          >
            {/* Ticket card */}
            <GlassCard className="left-0 top-0 w-[290px] -rotate-2 animate-float">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-mono text-white/40">
                  SD-20260612-00037
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  Resolved
                </span>
              </div>
              <p className="text-[13px] font-medium text-white/90 leading-snug">
                Wi-Fi outage — Suva HQ, Level 3
              </p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.07]">
                <span className="h-6 w-6 rounded-md bg-[var(--accent)]/25 text-[10px] font-bold text-red-200 flex items-center justify-center">
                  AC
                </span>
                <span className="text-[11px] text-white/45">Ashival Chand</span>
                <span className="ml-auto text-[10px] text-white/30">2m ago</span>
              </div>
            </GlassCard>

            {/* SLA card */}
            <GlassCard className="right-0 top-7 w-[200px] rotate-3 animate-float-delayed">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-1.5">
                Resolution SLA
              </p>
              <p className="text-2xl font-semibold text-white tracking-tight">
                98.2<span className="text-sm text-white/50 ml-0.5">%</span>
              </p>
              <div className="mt-2.5 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full w-[98%] rounded-full"
                  style={{ background: "linear-gradient(90deg, #E60000, #10B981)" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/35">this week</p>
            </GlassCard>

            {/* Approval card */}
            <GlassCard className="left-28 bottom-0 w-[250px] rotate-1 animate-float-slow">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-lg bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
                  <Icon name="checkCircle" size={15} className="text-emerald-300" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-white/90 truncate">
                    Approved — new starter access
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Vikash Prasad · Chief Technology Officer
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Bottom: capability ticks + legal */}
        <div>
          <div
            className="flex items-center gap-7 animate-fade-up"
            style={{ animationDelay: "360ms" }}
          >
            {[
              { icon: "tickets", label: "Tickets & SLA" },
              { icon: "checkCircle", label: "Approvals" },
              { icon: "assets", label: "Assets" },
              { icon: "knowledgeBase", label: "Knowledge" },
            ].map((f) => (
              <span key={f.label} className="flex items-center gap-2 text-[12px] text-white/45">
                <Icon name={f.icon} size={14} className="text-[#ff4d4d]/70" />
                {f.label}
              </span>
            ))}
          </div>
          <p
            className="mt-5 text-[11px] text-white/25 animate-fade-up"
            style={{ animationDelay: "420ms" }}
          >
            Internal system · Authorized Vodafone Fiji personnel only
          </p>
        </div>
      </div>

      {/* ═══════════ RIGHT — SIGN-IN FORM (white end of the same canvas) ═══════════ */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12 sm:px-12">
        {/* Mobile gets a frosted glass card over the gradient;
            on desktop the form sits directly on the white end — no card. */}
        <div
          className={cn(
            "w-full max-w-[400px]",
            "max-lg:rounded-3xl max-lg:p-7",
            "max-lg:bg-white/[0.55] max-lg:backdrop-blur-2xl max-lg:backdrop-saturate-150",
            "max-lg:border max-lg:border-white/50",
            "max-lg:shadow-[0_24px_80px_rgba(20,3,5,0.35),inset_0_1px_0_rgba(255,255,255,0.65)]"
          )}
        >
          {/* Mobile-only brand */}
          <div className="lg:hidden flex flex-col items-center mb-8 animate-fade-up">
            <VodafoneLogo size={56} className="drop-shadow-[0_4px_18px_rgba(230,0,0,0.35)]" />
            <p className="mt-3 text-sm font-semibold text-[#111318]">Vodafone Fiji</p>
            <p className="text-[11px] text-black/40 uppercase tracking-wide">
              Service Desk
            </p>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <h2 className="text-3xl font-semibold tracking-tight text-[#111318]">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-black/45">
              Sign in to your Service Desk account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Email */}
            <div className="group animate-fade-up" style={{ animationDelay: "160ms" }}>
              <label
                htmlFor="login-email"
                className="block text-[13px] font-medium text-black/55 mb-2 transition-colors duration-200 group-focus-within:text-[var(--accent)]"
              >
                Email address
              </label>
              <div className="relative">
                <Icon
                  name="mail"
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none transition-colors duration-200 group-focus-within:text-[var(--accent)]"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@vodafone.com.fj"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Password */}
            <div className="group animate-fade-up" style={{ animationDelay: "220ms" }}>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-medium text-black/55 mb-2 transition-colors duration-200 group-focus-within:text-[var(--accent)]"
              >
                Password
              </label>
              <div className="relative">
                <Icon
                  name="lock"
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none transition-colors duration-200 group-focus-within:text-[var(--accent)]"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(inputCls, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg",
                    "text-black/35 hover:text-[#111318]",
                    "hover:bg-black/[0.05] transition-all duration-150"
                  )}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </button>
              </div>
            </div>

            <div className="animate-fade-up" style={{ animationDelay: "280ms" }}>
              <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          </form>

          {/* Help + trust */}
          <div className="animate-fade-up" style={{ animationDelay: "340ms" }}>
            <div className="my-7 flex items-center gap-4">
              <div className="flex-1 h-px bg-black/[0.08]" />
              <span className="text-[11px] uppercase tracking-wider text-black/35">
                Need help?
              </span>
              <div className="flex-1 h-px bg-black/[0.08]" />
            </div>

            <a
              href="mailto:it.support@vodafone.com.fj"
              className={cn(
                "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium",
                "text-black/55 border border-black/10 bg-white/60",
                "hover:text-[var(--accent)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/[0.05]",
                "transition-all duration-200"
              )}
            >
              <Icon name="mail" size={15} />
              Contact IT Support
            </a>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-black/35">
              <Icon name="lock" size={11} />
              Vodafone Fiji internal system — use your corporate credentials
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
