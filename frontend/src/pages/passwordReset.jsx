/**
 * Password reset pages — "Forgot password?" and "Set a new password".
 *
 * Both are public (the user can't sign in) and share the login page's split
 * canvas so the flow feels like one place: brand on the left, form on the
 * white end of the gradient on the right.
 *
 * The reset link carries its token in the URL FRAGMENT (#token=…), which the
 * browser never sends to the server — so it stays out of access logs. We read
 * it once, then strip it from the address bar so it doesn't linger in history
 * or get copied along with the URL.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import VodafoneLogo from "../components/ui/VodafoneLogo";
import { useTheme } from "../contexts/theme";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const MIN_LENGTH = 8;

/** Mirrors the login page's canvas so the reset flow reads as the same place. */
function AuthShell({ children }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <div className="login-canvas relative min-h-screen flex overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(100deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, transparent 64%)",
          WebkitMaskImage: "linear-gradient(100deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 42%, transparent 64%)",
        }}
      />
      <VodafoneLogo size={620} className="absolute -top-44 -left-44 opacity-[0.06] pointer-events-none select-none" />

      {/* Left — brand (desktop only) */}
      <div className="relative z-10 hidden lg:flex lg:w-[55%] flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3 animate-fade-up">
          <VodafoneLogo size={40} className="drop-shadow-[0_0_18px_rgba(230,0,0,0.5)]" />
          <div>
            <p className="text-[15px] font-semibold text-white tracking-tight leading-tight">Vodafone Fiji</p>
            <p className="text-[11px] text-white/45 tracking-wide uppercase">Service Desk</p>
          </div>
        </div>
        <div className="max-w-md animate-fade-up" style={{ animationDelay: "120ms" }}>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/15 mb-6">
            <Icon name="key" size={22} className="text-white/85" />
          </span>
          <h1 className="text-4xl xl:text-[44px] font-semibold tracking-tight leading-[1.08] text-white">
            Get back into
            <br />
            your account.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/55">
            Reset links are sent to the email address on your Service Desk account. Each link
            works once and expires automatically.
          </p>
        </div>
        <p className="text-[11px] text-white/25">Internal system · Authorized Vodafone Fiji personnel only</p>
      </div>

      {/* Right — form */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12 sm:px-12">
        <div
          className={cn(
            "w-full max-w-[400px]",
            "max-lg:rounded-3xl max-lg:p-7 max-lg:backdrop-blur-2xl max-lg:backdrop-saturate-150 max-lg:border",
            dark
              ? "max-lg:bg-white/[0.04] max-lg:border-white/10"
              : "max-lg:bg-white/[0.55] max-lg:border-white/50 max-lg:shadow-[0_24px_80px_rgba(20,3,5,0.35)]"
          )}
        >
          <div className="lg:hidden flex flex-col items-center mb-8">
            <VodafoneLogo size={56} className="drop-shadow-[0_4px_18px_rgba(230,0,0,0.35)]" />
            <p className={cn("mt-3 text-sm font-semibold", dark ? "text-white" : "text-[#111318]")}>Vodafone Fiji</p>
            <p className={cn("text-[11px] uppercase tracking-wide", dark ? "text-white/40" : "text-black/40")}>Service Desk</p>
          </div>
          {children({ dark })}
        </div>
      </div>
    </div>
  );
}

function inputClsFor(dark) {
  return cn(
    "w-full pl-11 pr-4 py-3 rounded-xl text-sm",
    dark ? "bg-white/[0.05] text-white border border-white/15" : "bg-white text-[#111318] border border-black/10 shadow-sm",
    dark ? "placeholder:text-white/30" : "placeholder:text-black/30",
    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
    "transition-all duration-200"
  );
}

function Heading({ dark, title, subtitle }) {
  return (
    <div className="animate-fade-up">
      <h2 className={cn("text-3xl font-semibold tracking-tight", dark ? "text-white" : "text-[#111318]")}>{title}</h2>
      {subtitle && <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/50" : "text-black/45")}>{subtitle}</p>}
    </div>
  );
}

function BackToLogin({ dark }) {
  return (
    <Link
      to="/login"
      className={cn(
        "mt-7 inline-flex items-center gap-1.5 text-sm font-medium transition-colors",
        dark ? "text-white/55 hover:text-white" : "text-black/50 hover:text-[#111318]"
      )}
    >
      <Icon name="arrowLeft" size={15} />
      Back to sign in
    </Link>
  );
}

function Notice({ dark, tone, icon, title, children }) {
  const toneCls =
    tone === "success"
      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600"
      : "bg-amber-500/10 border-amber-500/25 text-amber-600";
  return (
    <div className={cn("mt-8 rounded-2xl border p-5 animate-fade-up", toneCls)}>
      <div className="flex items-start gap-3">
        <Icon name={icon} size={20} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", dark ? "text-white" : "text-[#111318]")}>{title}</p>
          <div className={cn("mt-1 text-sm leading-relaxed", dark ? "text-white/60" : "text-black/55")}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", auth: false, body: { email: value } });
      setSentTo(value);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {({ dark }) => {
        const inputCls = inputClsFor(dark);
        if (sentTo) {
          return (
            <>
              <Heading dark={dark} title="Check your email" />
              {/* Deliberately non-committal: the server gives the same answer
                  whether or not the address has an account. */}
              <Notice dark={dark} tone="success" icon="mail" title="If there's an account, a link is on its way">
                We've sent password reset instructions to <strong className="[overflow-wrap:anywhere]">{sentTo}</strong> if it matches a
                Service Desk account. The link expires in 1 hour.
              </Notice>
              <p className={cn("mt-5 text-xs leading-relaxed", dark ? "text-white/40" : "text-black/40")}>
                Nothing arrived after a few minutes? Check your junk folder, or contact IT Support — an administrator can
                also send you a reset link.
              </p>
              <BackToLogin dark={dark} />
            </>
          );
        }
        return (
          <>
            <Heading
              dark={dark}
              title="Forgot password?"
              subtitle="Enter your work email and we'll send you a link to set a new password."
            />
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              <div className="group">
                <label
                  htmlFor="forgot-email"
                  className={cn("block text-[13px] font-medium mb-2 group-focus-within:text-[var(--accent)]", dark ? "text-white/60" : "text-black/55")}
                >
                  Email address
                </label>
                <div className="relative">
                  <Icon
                    name="mail"
                    size={17}
                    className={cn("absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[var(--accent)]", dark ? "text-white/30" : "text-black/30")}
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@vodafone.com.fj"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              </div>
              <Button type="submit" size="lg" loading={loading} className="w-full">
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
            <BackToLogin dark={dark} />
          </>
        );
      }}
    </AuthShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Email claim of the stored JWT, if any. Read-only decode — never trusted for auth. */
function storedSessionEmail() {
  try {
    const jwt = localStorage.getItem("token");
    if (!jwt) return null;
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.email || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function readTokenFromFragment() {
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") || "";
}

function passwordChecks(pw) {
  return [
    { label: `At least ${MIN_LENGTH} characters`, ok: pw.length >= MIN_LENGTH },
    { label: "Contains a letter", ok: /[A-Za-z]/.test(pw) },
    { label: "Contains a number", ok: /[0-9]/.test(pw) },
  ];
}

export function ResetPassword() {
  const navigate = useNavigate();
  // Read once on mount; the fragment is stripped right after.
  const [token] = useState(readTokenFromFragment);
  const [status, setStatus] = useState(token ? "checking" : "invalid"); // checking | ready | invalid | done
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!token) return;
    let cancelled = false;
    api("/auth/reset-password/validate", { method: "POST", auth: false, body: { token } })
      .then((data) => {
        if (cancelled) return;
        if (data.valid) {
          setEmail(data.email || "");
          setStatus("ready");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => !cancelled && setStatus("invalid"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const allOk = checks.every((c) => c.ok);
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allOk) return setError("Your new password doesn't meet the requirements below.");
    if (!matches) return setError("The passwords don't match.");
    setError("");
    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", auth: false, body: { token, password } });
      // If this browser holds a session for the SAME account, the server has
      // just revoked it — drop it so the app doesn't keep using a dead token.
      // A session for a different account (an admin checking a link) is left
      // alone.
      if (storedSessionEmail() === email.toLowerCase()) localStorage.removeItem("token");
      setStatus("done");
    } catch (err) {
      const msg = err.message || "Something went wrong. Please try again.";
      if (/invalid|expired|already been used/i.test(msg)) setStatus("invalid");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {({ dark }) => {
        const inputCls = inputClsFor(dark);

        if (status === "checking") {
          return (
            <div className={cn("flex items-center gap-3 text-sm", dark ? "text-white/60" : "text-black/55")}>
              <span className="h-4 w-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              Checking your reset link…
            </div>
          );
        }

        if (status === "invalid") {
          return (
            <>
              <Heading dark={dark} title="Link expired" />
              <Notice dark={dark} tone="warning" icon="alertTriangle" title="This reset link can't be used">
                It may have expired, already been used, or been replaced by a newer link. Reset links work once, and only
                the most recent one is valid.
              </Notice>
              <Link to="/forgot-password" className="block mt-6">
                <Button size="lg" className="w-full">Request a new link</Button>
              </Link>
              <BackToLogin dark={dark} />
            </>
          );
        }

        if (status === "done") {
          return (
            <>
              <Heading dark={dark} title="Password updated" />
              <Notice dark={dark} tone="success" icon="checkCircle" title="You're all set">
                Your password has been changed and any other signed-in sessions were signed out. We've emailed you a
                confirmation.
              </Notice>
              <Button size="lg" className="w-full mt-6" onClick={() => navigate("/login", { replace: true })}>
                Sign in
              </Button>
            </>
          );
        }

        return (
          <>
            <Heading
              dark={dark}
              title="Set a new password"
              subtitle={email ? <>For <strong className={dark ? "text-white/80" : "text-black/70"}>{email}</strong></> : null}
            />
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {/* Lets password managers associate the new password with the account. */}
              <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />

              <div className="group">
                <label
                  htmlFor="reset-password"
                  className={cn("block text-[13px] font-medium mb-2 group-focus-within:text-[var(--accent)]", dark ? "text-white/60" : "text-black/55")}
                >
                  New password
                </label>
                <div className="relative">
                  <Icon
                    name="lock"
                    size={17}
                    className={cn("absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[var(--accent)]", dark ? "text-white/30" : "text-black/30")}
                  />
                  <input
                    id="reset-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    autoFocus
                    placeholder="Enter a new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(inputCls, "pr-11")}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all",
                      dark ? "text-white/40 hover:text-white hover:bg-white/[0.08]" : "text-black/35 hover:text-[#111318] hover:bg-black/[0.05]"
                    )}
                  >
                    <Icon name={show ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
                <ul className="mt-2.5 space-y-1">
                  {checks.map((c) => (
                    <li
                      key={c.label}
                      className={cn(
                        "flex items-center gap-2 text-xs transition-colors",
                        c.ok ? "text-emerald-600" : dark ? "text-white/40" : "text-black/40"
                      )}
                    >
                      <Icon name={c.ok ? "checkCircle" : "clock"} size={13} />
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="group">
                <label
                  htmlFor="reset-confirm"
                  className={cn("block text-[13px] font-medium mb-2 group-focus-within:text-[var(--accent)]", dark ? "text-white/60" : "text-black/55")}
                >
                  Confirm new password
                </label>
                <div className="relative">
                  <Icon
                    name="lock"
                    size={17}
                    className={cn("absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-[var(--accent)]", dark ? "text-white/30" : "text-black/30")}
                  />
                  <input
                    id="reset-confirm"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter the new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {confirm.length > 0 && !matches && <p className="mt-2 text-xs text-red-500">The passwords don't match.</p>}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button type="submit" size="lg" loading={loading} disabled={!allOk || !matches} className="w-full">
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
            <BackToLogin dark={dark} />
          </>
        );
      }}
    </AuthShell>
  );
}
