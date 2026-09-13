/**
 * Email (SMTP) Settings — Vodafone Service Desk
 *
 * Admin-only page for the system-wide outbound mail relay. One settings row,
 * edited in place: relay host/port/security, optional authentication, the
 * "From" identity, and a master on/off switch.
 *
 * Two distinct checks are offered, because they fail for different reasons:
 *   • Test connection — opens the socket and runs the SMTP handshake. Proves
 *     the relay is reachable and (if auth is on) the credentials work.
 *   • Send test email — actually delivers a message. Proves the relay will
 *     RELAY for our From address, which a handshake cannot tell you.
 * Both test the SAVED configuration, so both save first.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { smtpApi } from "../services/api";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import Skeleton from "../components/ui/Skeleton";
import Input, { Select } from "../components/ui/Input";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Sentinel the backend understands as "leave the stored password alone".
const UNCHANGED = "__UNCHANGED__";

const SECURITY_OPTIONS = [
  { value: "none", label: "None", hint: "Plaintext. Typical for an internal relay on port 25." },
  { value: "starttls", label: "STARTTLS", hint: "Opens plaintext, then upgrades. Usually port 587." },
  { value: "tls", label: "SSL / TLS", hint: "Encrypted from the first byte. Usually port 465." },
];

// Ports that conventionally pair with each security type. Used only to warn —
// never to override what the admin typed, since relays do get custom ports.
const CONVENTIONAL_PORTS = { none: [25, 2525], starttls: [587, 25, 2525], tls: [465] };

const EMPTY = {
  host: "",
  port: 25,
  security: "none",
  auth_required: false,
  username: "",
  password: "",
  from_email: "",
  from_name: "",
  enabled: true,
};

/** A grouped section card, matching the rule-builder sections elsewhere. */
function Section({ icon, tint, title, description, children, footer }) {
  return (
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/40">
        <span className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center border", tint)}>
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--fg-primary)]">{title}</h2>
          {description && (
            <p className="text-xs text-[var(--fg-tertiary)] mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)]/30">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Accessible on/off switch. */
function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-150 relative",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "bg-[var(--bg-surface)] border-[var(--border-default)]"
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-150",
            checked ? "left-[22px]" : "left-[3px]"
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--fg-primary)]">{label}</span>
        {description && (
          <span className="block text-xs text-[var(--fg-tertiary)] mt-0.5">{description}</span>
        )}
      </span>
    </label>
  );
}

export default function EmailSettings() {
  const { user } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState(null); // last_tested_at / last_test_ok / last_test_error
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testTo, setTestTo] = useState("");

  const isAdmin = (user?.roles || []).includes("admin");

  // ToastProvider rebuilds its context value on every render, so depending on
  // `toast` directly would give `load` a new identity each time a toast fires —
  // and the mount effect would re-fetch, wiping the form right after a save.
  // The ref keeps the helper current without feeding the dependency array.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await smtpApi.get();
      setForm({
        host: data.host || "",
        port: data.port ?? 25,
        security: data.security || "none",
        auth_required: !!data.auth_required,
        username: data.username || "",
        // The real secret never leaves the server; the sentinel stands in for
        // it so an unrelated edit doesn't wipe the stored password.
        password: data.has_password ? UNCHANGED : "",
        from_email: data.from_email || "",
        from_name: data.from_name || "",
        enabled: !!data.enabled,
      });
      setMeta({
        has_password: !!data.has_password,
        last_tested_at: data.last_tested_at,
        last_test_ok: data.last_test_ok,
        last_test_error: data.last_test_error,
      });
      setDirty(false);
    } catch (err) {
      toastRef.current.error(err.message || "Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!testTo && user?.email) setTestTo(user.email);
  }, [user, testTo]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    if (!form.host.trim()) return toast.error("SMTP host is required");
    if (!form.from_email.trim()) return toast.error("A 'From' email address is required");

    setSaving(true);
    try {
      const data = await smtpApi.update({
        ...form,
        port: Number(form.port),
        username: form.auth_required ? form.username : null,
      });
      setMeta((m) => ({ ...m, has_password: !!data.has_password }));
      setForm((f) => ({ ...f, password: data.has_password ? UNCHANGED : "" }));
      setDirty(false);
      toast.success("Email settings saved");
      return true;
    } catch (err) {
      toast.error(err.message || "Failed to save email settings");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Both tests run against the saved row, so flush pending edits first —
  // otherwise a green result would describe a config that isn't live.
  async function ensureSaved() {
    if (!dirty) return true;
    return save();
  }

  async function testConnection() {
    if (!(await ensureSaved())) return;
    setTesting(true);
    try {
      const res = await smtpApi.test();
      toast.success(res.message || "Connection successful");
      setMeta((m) => ({ ...m, last_test_ok: 1, last_test_error: null, last_tested_at: new Date().toISOString() }));
    } catch (err) {
      toast.error(err.message || "Connection failed");
      setMeta((m) => ({ ...m, last_test_ok: 0, last_test_error: err.message, last_tested_at: new Date().toISOString() }));
    } finally {
      setTesting(false);
    }
  }

  async function sendTestEmail() {
    if (!testTo.trim()) return toast.error("Enter a recipient address");
    if (!(await ensureSaved())) return;
    setSending(true);
    try {
      const res = await smtpApi.sendTest(testTo.trim());
      toast.success(res.message || "Test email sent");
    } catch (err) {
      toast.error(err.message || "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-8 text-center">
          <Icon name="shield" size={28} className="mx-auto text-[var(--fg-tertiary)]" />
          <h2 className="mt-3 text-base font-semibold text-[var(--fg-primary)]">Administrators only</h2>
          <p className="mt-1 text-sm text-[var(--fg-tertiary)]">
            Email settings can only be viewed and changed by an administrator.
          </p>
        </div>
      </div>
    );
  }

  const portWarning =
    form.port &&
    !CONVENTIONAL_PORTS[form.security]?.includes(Number(form.port))
      ? `Port ${form.port} is unusual for ${SECURITY_OPTIONS.find((o) => o.value === form.security)?.label}. Double-check with your mail team.`
      : null;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PageHeader
        icon="mail"
        title="Email Settings"
        subtitle="Outbound SMTP relay used for notifications and ticket updates"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              title="Reload"
              disabled={loading}
              className={cn(
                "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
              )}
            >
              <Icon name="refresh" size={16} />
            </button>
            <Button onClick={save} disabled={saving || loading || !dirty}>
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Status strip */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  form.enabled ? "bg-emerald-500" : "bg-[var(--fg-tertiary)]"
                )}
              />
              <span className="text-sm font-medium text-[var(--fg-primary)]">
                {form.enabled ? "Email enabled" : "Email disabled"}
              </span>
            </div>
            {form.host && (
              <span className="text-sm text-[var(--fg-secondary)] font-mono">
                {form.host}:{form.port}
              </span>
            )}
            <Badge tone={form.security === "none" ? "slate" : "emerald"} size="sm">
              {SECURITY_OPTIONS.find((o) => o.value === form.security)?.label}
            </Badge>
            <Badge tone={form.auth_required ? "blue" : "slate"} size="sm">
              {form.auth_required ? "Authenticated" : "No authentication"}
            </Badge>
            {meta?.last_tested_at && (
              <span
                className={cn(
                  "text-xs ml-auto",
                  meta.last_test_ok ? "text-emerald-500" : "text-red-500"
                )}
              >
                {meta.last_test_ok ? "Last test passed" : `Last test failed: ${meta.last_test_error}`}
                {" · "}
                {new Date(meta.last_tested_at).toLocaleString()}
              </span>
            )}
          </div>

          <Section
            icon="settings"
            tint="bg-blue-500/10 text-blue-500 border-blue-500/15"
            title="Relay"
            description="Where the Service Desk hands off outgoing mail"
          >
            <Toggle
              checked={form.enabled}
              onChange={(v) => set("enabled", v)}
              label="Send outbound email"
              description="Turn off to suppress all outgoing mail without losing this configuration."
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="SMTP server"
                  placeholder="smtp.example.com"
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                />
              </div>
              <Input
                label="Port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
              />
            </div>

            <div>
              <Select
                label="Security type"
                value={form.security}
                onChange={(e) => set("security", e.target.value)}
              >
                {SECURITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-[var(--fg-tertiary)]">
                {SECURITY_OPTIONS.find((o) => o.value === form.security)?.hint}
              </p>
              {portWarning && (
                <p className="mt-1.5 text-xs text-amber-500 flex items-start gap-1.5">
                  <Icon name="alertTriangle" size={13} className="mt-0.5 shrink-0" />
                  {portWarning}
                </p>
              )}
            </div>
          </Section>

          <Section
            icon="shield"
            tint="bg-violet-500/10 text-violet-500 border-violet-500/15"
            title="Authentication"
            description="Only needed if the relay requires a login"
          >
            <Toggle
              checked={form.auth_required}
              onChange={(v) => set("auth_required", v)}
              label="Require authentication to send email"
              description="Internal relays that allow-list by IP usually need this off."
            />

            {form.auth_required && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Username"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                />
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={meta?.has_password ? "•••••••• (unchanged)" : ""}
                  // The stored secret is never sent to the browser. While the
                  // sentinel is in place the field shows blank; typing replaces
                  // it, and clearing it explicitly removes the password.
                  value={form.password === UNCHANGED ? "" : form.password}
                  onChange={(e) => set("password", e.target.value)}
                  helperText={
                    meta?.has_password
                      ? "A password is stored. Leave blank to keep it."
                      : undefined
                  }
                />
              </div>
            )}
          </Section>

          <Section
            icon="user"
            tint="bg-cyan-500/10 text-cyan-500 border-cyan-500/15"
            title="Sender identity"
            description="What recipients see in the From line"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="From address"
                type="email"
                placeholder="servicedesk@vodafone.com.fj"
                value={form.from_email}
                onChange={(e) => set("from_email", e.target.value)}
              />
              <Input
                label="Display name"
                placeholder="Vodafone Service Desk"
                value={form.from_name}
                onChange={(e) => set("from_name", e.target.value)}
              />
            </div>
            <p className="text-xs text-[var(--fg-tertiary)]">
              The relay must be willing to send on behalf of this address, or mail will be
              rejected even though the connection test passes.
            </p>
          </Section>

          <Section
            icon="checkCircle"
            tint="bg-emerald-500/10 text-emerald-500 border-emerald-500/15"
            title="Verify"
            description="Unsaved changes are saved automatically before each test"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={testConnection} disabled={testing || saving}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <span className="text-xs text-[var(--fg-tertiary)]">
                {testing
                  ? "Waiting for the relay to answer — this can take up to 30 seconds."
                  : "Opens the connection and runs the SMTP handshake. Sends nothing."}
              </span>
            </div>

            <div className="pt-2 border-t border-[var(--border-default)]">
              <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2 mt-3">
                Send a test email
              </label>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <Input
                    type="email"
                    placeholder="you@vodafone.com.fj"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                </div>
                <Button variant="secondary" onClick={sendTestEmail} disabled={sending || saving}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-[var(--fg-tertiary)]">
                Delivers a real message — the only way to confirm the relay will actually accept
                mail from this sender.
              </p>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
