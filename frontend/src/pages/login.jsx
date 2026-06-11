/**
 * Login Page
 * Linear/Modern Design System
 *
 * Features:
 * - Dark ambient background with floating blobs
 * - Elevated card with multi-layer shadows
 * - Subtle accent glow line
 * - Precision inputs with focus glow
 * - Premium button with accent glow
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/auth";
import { useTheme } from "../contexts/theme";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import FloatingBlobs from "../components/ui/FloatingBlobs";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] relative overflow-hidden flex items-center justify-center p-4 sm:p-6">
      {/* Animated floating blobs */}
      <FloatingBlobs variant="auth" />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-[420px]">
        <div
          className={cn(
            // Card styling
            "bg-[var(--bg-elevated)]",
            "rounded-2xl overflow-hidden",
            "border border-[var(--border-default)]",
            // Multi-layer shadow
            "shadow-[var(--shadow-elevated)]",
            // Animation
            "animate-scale-in"
          )}
        >
          {/* Accent glow line at top */}
          <div className={cn("h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent", isLight ? "opacity-30" : "opacity-60")} />

          {/* Inner glow — dark mode only */}
          {!isLight && (
            <div className="absolute top-0 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          )}

          <div className="p-8 sm:p-10">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <div
                className={cn(
                  "h-16 w-16 rounded-xl flex items-center justify-center",
                  "bg-[var(--accent)]",
                  isLight
                    ? "shadow-[0_0_0_1px_rgba(230,0,0,0.3),0_4px_12px_rgba(230,0,0,0.15)]"
                    : "shadow-[0_0_0_1px_rgba(230,0,0,0.5),0_8px_24px_rgba(230,0,0,0.3),0_0_60px_rgba(230,0,0,0.2)]"
                )}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.9" />
                  <path
                    d="M2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-[var(--fg-primary)] tracking-tight mb-1">
                Service Desk
              </h1>
              <p className="text-sm text-[var(--fg-secondary)]">
                Sign in to your account
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div
                className={cn(
                  "mb-6 flex items-center gap-3 p-4",
                  "bg-red-500/10 rounded-lg",
                  "border border-red-500/20",
                  "animate-fade-in"
                )}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/20 text-red-400">
                  <Icon name="alert" size={16} />
                </div>
                <p className="text-sm font-medium text-red-400">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
                    <Icon name="mail" size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@vodafone.com"
                    required
                    className={cn(
                      "w-full pl-10 pr-4 py-3",
                      "bg-[var(--bg-base)] rounded-lg",
                      "text-[var(--fg-primary)] text-sm",
                      "placeholder:text-[var(--fg-muted)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)]",
                      "focus:ring-2 focus:ring-[var(--accent)]/20",
                      "transition-all duration-200"
                    )}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
                    <Icon name="lock" size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className={cn(
                      "w-full pl-10 pr-4 py-3",
                      "bg-[var(--bg-base)] rounded-lg",
                      "text-[var(--fg-primary)] text-sm",
                      "placeholder:text-[var(--fg-muted)]",
                      "border border-[var(--border-default)]",
                      "focus:outline-none focus:border-[var(--accent)]",
                      "focus:ring-2 focus:ring-[var(--accent)]/20",
                      "transition-all duration-200"
                    )}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  className="w-full"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 sm:px-10 sm:pb-10">
            <div className="pt-6 border-t border-[var(--border-default)] text-center">
              <p className="text-xs text-[var(--fg-muted)]">
                Vodafone Service Desk
              </p>
            </div>
          </div>
        </div>

        {/* Help text below card */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--fg-secondary)]">
            Need help?{" "}
            <button className="text-[var(--accent)] font-medium hover:underline transition-all">
              Contact IT Support
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
