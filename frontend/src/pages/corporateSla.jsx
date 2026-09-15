/**
 * SLA Settings — Corporate Service Desk
 *
 * Every clock a corporate request runs on, set per priority:
 *
 *   Delivery        first response + resolution for the delivery team holding
 *                   the request (with an optional at-risk warning), 24/7 or on a
 *                   business-hours schedule, plus optional per-team overrides
 *   NOC triage      time for NOC to route a "Not sure" request to a team
 *   Manager review  time each escalation layer (L1, L2, …) has to act
 *
 * The internal desk keeps its own policies on the internal SLA Policies page.
 * Saving applies to clocks that start afterwards; running clocks keep their
 * due times. Admins edit; other corporate staff can read.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../services/api";
import { useToast } from "../contexts/toast";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Badge from "../components/ui/Badge";
import PageHeader from "../components/ui/PageHeader";
import Skeleton from "../components/ui/Skeleton";
import { Select } from "../components/ui/Input";
import useConfirm from "../components/ui/useConfirm";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const PRIORITY_TONE = { low: "emerald", normal: "blue", high: "orange", urgent: "red" };
const UNITS = [
  { key: "min", label: "min", factor: 1 },
  { key: "hours", label: "hours", factor: 60 },
  { key: "days", label: "days", factor: 1440 },
];

/** Largest unit that shows the value as a whole number. */
function unitFor(minutes) {
  if (!minutes) return "min";
  if (minutes % 1440 === 0) return "days";
  if (minutes % 60 === 0) return "hours";
  return "min";
}

/** Number + unit, stored as whole minutes. `null` value = empty. */
function DurationInput({ value, onChange, disabled, allowEmpty = false, invalid, label }) {
  const [unit, setUnit] = useState(() => unitFor(value));
  const [text, setText] = useState(() => (value === null || value === undefined ? "" : String(value / UNITS.find((u) => u.key === unitFor(value)).factor)));

  // Follow outside changes (load / discard) without fighting the user's typing.
  useEffect(() => {
    const factor = UNITS.find((u) => u.key === unit).factor;
    // An emptied required field reports 0 — don't snap "0" back in while typing.
    const shown = text === "" ? (allowEmpty ? null : 0) : Math.round(Number(text) * factor);
    if (shown !== value) {
      const u = unitFor(value);
      setUnit(u);
      setText(value === null || value === undefined ? "" : String(value / UNITS.find((x) => x.key === u).factor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(nextText, nextUnit) {
    if (nextText === "") return onChange(allowEmpty ? null : 0);
    const n = Number(nextText);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(Math.round(n * UNITS.find((u) => u.key === nextUnit).factor));
  }

  return (
    <div
      className={cn(
        "flex items-stretch rounded-lg border bg-[var(--bg-elevated)] overflow-hidden transition-colors",
        invalid ? "border-rose-500/70 ring-2 ring-rose-500/15" : "border-[var(--border-default)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20",
        disabled && "opacity-70"
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        aria-label={label}
        disabled={disabled}
        value={text}
        placeholder={allowEmpty ? "Off" : ""}
        onChange={(e) => { setText(e.target.value); emit(e.target.value, unit); }}
        className="w-full min-w-0 px-2.5 py-2 text-sm tabular-nums bg-transparent text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none disabled:cursor-not-allowed"
      />
      <select
        aria-label={`${label} unit`}
        disabled={disabled}
        value={unit}
        onChange={(e) => { setUnit(e.target.value); emit(text, e.target.value); }}
        className="shrink-0 pl-2 pr-1 text-xs text-[var(--fg-secondary)] bg-[var(--bg-surface)] border-l border-[var(--border-default)] focus:outline-none disabled:cursor-not-allowed"
      >
        {UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
      </select>
    </div>
  );
}

/** Client-side mirror of the server's checks; returns { field: message }. */
function targetProblems(t) {
  const out = {};
  if (!t.response_minutes) out.response = "Set a first response time";
  if (!t.resolve_minutes) out.resolve = "Set a resolution time";
  if (t.response_minutes && t.resolve_minutes && t.response_minutes > t.resolve_minutes) {
    out.response = "Longer than resolution";
  }
  if (t.notify_at_risk_minutes !== null && t.notify_at_risk_minutes !== undefined && t.resolve_minutes && t.notify_at_risk_minutes >= t.resolve_minutes) {
    out.warn = "Must be shorter than resolution";
  }
  return out;
}

function Section({ icon, tone, title, description, children, aside }) {
  return (
    <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start gap-3 p-5 pb-4 border-b border-[var(--border-default)]">
        <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tone)}>
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-[var(--fg-primary)]">{title}</h2>
          <p className="text-xs text-[var(--fg-tertiary)] mt-0.5 max-w-2xl">{description}</p>
        </div>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PriorityLabel({ priority }) {
  return <Badge tone={PRIORITY_TONE[priority?.key] || "slate"} size="sm" dot>{priority?.label}</Badge>;
}

function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-[11px] text-rose-500">{children}</p>;
}

export default function CorporateSla() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(null); // priorities, teams, business_hours, can_edit
  const [saved, setSaved] = useState(null); // last loaded settings (for dirty / discard)
  const [draft, setDraft] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const d = await api("/corporate/sla-settings");
      const settings = {
        delivery: d.delivery,
        triage: d.triage,
        manager_review: d.manager_review,
      };
      setMeta({ priorities: d.priorities, teams: d.teams, business_hours: d.business_hours, can_edit: d.can_edit, last_changed_at: d.last_changed_at });
      setSaved(settings);
      setDraft(structuredClone(settings));
    } catch (err) {
      toast.error(err.message || "Couldn't load SLA settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priorityById = useMemo(() => new Map((meta?.priorities || []).map((p) => [p.id, p])), [meta]);
  const dirty = useMemo(() => !!draft && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const canEdit = !!meta?.can_edit;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const deliveryProblems = useMemo(
    () => (draft?.delivery.priorities || []).map(targetProblems),
    [draft]
  );
  const overrideProblems = useMemo(() => {
    const seen = new Map();
    return (draft?.delivery.overrides || []).map((o) => {
      const p = targetProblems(o);
      if (!o.team_id) p.team = "Choose a team";
      const key = `${o.team_id}:${o.priority_id || "any"}`;
      if (o.team_id && seen.has(key)) p.team = "Already set above";
      seen.set(key, true);
      return p;
    });
  }, [draft]);
  const clockProblems = (clock) => (draft?.[clock] || []).map((r) => (!r.minutes ? "Set a time" : null));
  const hasProblems = !!draft && (
    deliveryProblems.some((p) => Object.keys(p).length)
    || overrideProblems.some((p) => Object.keys(p).length)
    || clockProblems("triage").some(Boolean)
    || clockProblems("manager_review").some(Boolean)
    || (draft.delivery.use_business_hours && !draft.delivery.business_hours_id)
  );

  function update(mutator) {
    setDraft((d) => {
      const next = structuredClone(d);
      mutator(next);
      return next;
    });
  }

  async function save() {
    if (hasProblems) return toast.error("Fix the highlighted targets first");
    setSaving(true);
    try {
      const r = await api("/corporate/sla-settings", { method: "PUT", body: draft });
      toast.success(r.archived ? "SLA settings saved — removed overrides already used by requests were archived" : "SLA settings saved");
      await load();
    } catch (err) {
      toast.error(err.message || "Couldn't save SLA settings");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    confirm({
      title: "Discard changes?",
      message: "Your unsaved SLA changes will be lost.",
      confirmText: "Discard",
      onConfirm: () => setDraft(structuredClone(saved)),
    });
  }

  const businessHours = meta?.business_hours || [];

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        icon="sla"
        title="SLA Settings"
        subtitle="Response, triage and escalation targets for corporate requests"
        actions={
          canEdit && (
            <div className="flex items-center gap-2">
              <Button onClick={save} loading={saving} disabled={!dirty || hasProblems} icon={<Icon name="check" size={16} />}>
                Save changes
              </Button>
            </div>
          )
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <Icon name="info" size={16} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-[var(--fg-secondary)]">
          New targets apply to clocks that start after you save. Requests already on the clock keep their due times.
          {!canEdit && " Only administrators can change these settings."}
          {meta?.last_changed_at && (
            <span className="text-[var(--fg-muted)]"> Last changed {new Date(meta.last_changed_at).toLocaleString()}.</span>
          )}
        </p>
      </div>

      {loading || !draft ? (
        <div className="space-y-5">
          <Skeleton className="h-80" rounded="rounded-2xl" />
          <div className="grid lg:grid-cols-2 gap-5">
            <Skeleton className="h-64" rounded="rounded-2xl" />
            <Skeleton className="h-64" rounded="rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* ── Delivery ─────────────────────────────────────────────────── */}
          <Section
            icon="clock"
            tone="text-[var(--accent)] bg-[var(--accent)]/10"
            title="Delivery SLA"
            description="How quickly the delivery team holding a request must first respond and fully resolve it. The clock starts when the request lands in their queue (after NOC triage for “Not sure” requests)."
            aside={
              <div className="w-full sm:w-auto flex flex-col sm:items-end gap-2">
                <div className="inline-flex p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                  {[
                    { key: false, label: "24/7" },
                    { key: true, label: "Business hours" },
                  ].map((o) => (
                    <button
                      key={String(o.key)}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => update((d) => {
                        d.delivery.use_business_hours = o.key;
                        if (o.key && !d.delivery.business_hours_id) d.delivery.business_hours_id = businessHours[0]?.id || null;
                      })}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:cursor-not-allowed",
                        draft.delivery.use_business_hours === o.key ? "bg-[var(--accent)] text-white" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {draft.delivery.use_business_hours && (
                  businessHours.length ? (
                    <Select
                      size="sm"
                      disabled={!canEdit}
                      value={draft.delivery.business_hours_id || ""}
                      onChange={(e) => update((d) => { d.delivery.business_hours_id = Number(e.target.value) || null; })}
                      className="sm:w-60"
                    >
                      {businessHours.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}{b.timezone ? ` (${b.timezone})` : ""}</option>
                      ))}
                    </Select>
                  ) : (
                    <p className="text-xs text-rose-500">No business-hours schedule exists yet.</p>
                  )
                )}
              </div>
            }
          >
            <div className="hidden md:grid grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-3 px-1 pb-2 text-label">
              <span>Priority</span>
              <span>First response</span>
              <span>Resolution</span>
              <span>At-risk warning <span className="normal-case font-normal text-[var(--fg-muted)]">(before due)</span></span>
            </div>
            <div className="space-y-2">
              {draft.delivery.priorities.map((row, i) => {
                const pr = priorityById.get(row.priority_id);
                const problems = deliveryProblems[i];
                return (
                  <div key={row.priority_id} className="grid grid-cols-1 md:grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-3 items-start rounded-xl md:rounded-none border md:border-0 border-[var(--border-default)] p-3 md:p-1">
                    <div className="md:pt-2"><PriorityLabel priority={pr} /></div>
                    {[
                      ["response_minutes", "First response", problems.response, false],
                      ["resolve_minutes", "Resolution", problems.resolve, false],
                      ["notify_at_risk_minutes", "At-risk warning", problems.warn, true],
                    ].map(([field, label, error, allowEmpty]) => (
                      <div key={field}>
                        <span className="md:hidden block text-[11px] text-[var(--fg-muted)] mb-1">{label}</span>
                        <DurationInput
                          label={`${pr?.label} ${label}`}
                          value={row[field]}
                          allowEmpty={allowEmpty}
                          disabled={!canEdit}
                          invalid={!!error}
                          onChange={(v) => update((d) => { d.delivery.priorities[i][field] = v; })}
                        />
                        <FieldError>{error}</FieldError>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Team overrides */}
            <div className="mt-6 pt-5 border-t border-[var(--border-default)]">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="min-w-[14rem] flex-1">
                  <p className="text-sm font-semibold text-[var(--fg-primary)]">Team overrides</p>
                  <p className="text-xs text-[var(--fg-tertiary)] mt-0.5">
                    Give one delivery team different targets. An override for a team and priority wins over the priority targets above; “Any priority” covers that team's other priorities.
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Icon name="plus" size={14} />}
                    onClick={() => update((d) => {
                      const normal = d.delivery.priorities.find((p) => priorityById.get(p.priority_id)?.key === "normal") || d.delivery.priorities[0];
                      d.delivery.overrides.push({
                        id: null,
                        team_id: null,
                        priority_id: null,
                        response_minutes: normal?.response_minutes ?? 60,
                        resolve_minutes: normal?.resolve_minutes ?? 480,
                        notify_at_risk_minutes: normal?.notify_at_risk_minutes ?? null,
                      });
                    })}
                  >
                    Add override
                  </Button>
                )}
              </div>

              {draft.delivery.overrides.length === 0 ? (
                <p className="text-xs text-[var(--fg-muted)] rounded-lg border border-dashed border-[var(--border-default)] px-4 py-3">
                  No overrides — every delivery team uses the priority targets above.
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.delivery.overrides.map((o, i) => {
                    const problems = overrideProblems[i];
                    return (
                      <div
                        key={o.id ?? `new-${i}`}
                        className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-start rounded-xl border border-[var(--border-default)] bg-[var(--bg-base)] p-3"
                      >
                        <div className="sm:col-span-3">
                          <span className="block text-[11px] text-[var(--fg-muted)] mb-1">Team</span>
                          <Select
                            size="sm"
                            disabled={!canEdit}
                            value={o.team_id || ""}
                            error={problems.team}
                            onChange={(e) => update((d) => { d.delivery.overrides[i].team_id = Number(e.target.value) || null; })}
                          >
                            <option value="">Choose a team…</option>
                            {meta.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-[11px] text-[var(--fg-muted)] mb-1">Priority</span>
                          <Select
                            size="sm"
                            disabled={!canEdit}
                            value={o.priority_id || ""}
                            onChange={(e) => update((d) => { d.delivery.overrides[i].priority_id = Number(e.target.value) || null; })}
                          >
                            <option value="">Any priority</option>
                            {meta.priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </Select>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            title="Remove override"
                            aria-label={`Remove override ${i + 1}`}
                            onClick={() => update((d) => { d.delivery.overrides.splice(i, 1); })}
                            className="justify-self-end sm:mt-5 p-2 rounded-lg text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        ) : <span className="hidden sm:block" />}
                        {[
                          ["response_minutes", "First response", problems.response, false],
                          ["resolve_minutes", "Resolution", problems.resolve, false],
                          ["notify_at_risk_minutes", "At-risk warning", problems.warn, true],
                        ].map(([field, label, error, allowEmpty]) => (
                          <div key={field} className="sm:col-span-2">
                            <span className="block text-[11px] text-[var(--fg-muted)] mb-1">{label}</span>
                            <DurationInput
                              label={`Override ${i + 1} ${label}`}
                              value={o[field]}
                              allowEmpty={allowEmpty}
                              disabled={!canEdit}
                              invalid={!!error}
                              onChange={(v) => update((d) => { d.delivery.overrides[i][field] = v; })}
                            />
                            <FieldError>{error}</FieldError>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          {/* ── Triage + manager review ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              {
                clock: "triage",
                icon: "filter",
                tone: "text-amber-500 bg-amber-500/10",
                title: "NOC triage",
                description: "Time NOC has to set the priority of a “Not sure” request and route it to a delivery team. Runs 24/7. The delivery SLA starts once it's routed.",
              },
              {
                clock: "manager_review",
                icon: "arrowUp",
                tone: "text-violet-500 bg-violet-500/10",
                title: "Manager review",
                description: "Time each escalation layer has to act once a request reaches them: hand it back, resolve it, or pass it to the next level. Every layer (L1, L2, …) gets a fresh clock. Runs 24/7.",
              },
            ].map((s) => {
              const problems = clockProblems(s.clock);
              return (
                <Section key={s.clock} icon={s.icon} tone={s.tone} title={s.title} description={s.description}>
                  <div className="space-y-2">
                    {draft[s.clock].map((row, i) => {
                      const pr = priorityById.get(row.priority_id);
                      return (
                        <div key={row.priority_id} className="grid grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[130px_minmax(0,220px)] gap-3 items-start">
                          <div className="pt-2"><PriorityLabel priority={pr} /></div>
                          <div>
                            <DurationInput
                              label={`${s.title} ${pr?.label}`}
                              value={row.minutes}
                              disabled={!canEdit}
                              invalid={!!problems[i]}
                              onChange={(v) => update((d) => { d[s.clock][i].minutes = v; })}
                            />
                            <FieldError>{problems[i]}</FieldError>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              );
            })}
          </div>
        </>
      )}

      {/* Unsaved-changes bar — portalled: the page wrapper's entry animation
          makes `fixed` relative to it instead of the viewport. Centred and
          raised on phones so it clears the chat button. */}
      {canEdit && dirty && createPortal(
        <div className="fixed z-50 bottom-20 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card-hover)] px-4 py-3">
          <span className="text-sm text-[var(--fg-secondary)] mr-auto lg:mr-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {hasProblems ? "Fix the highlighted targets to save" : "Unsaved changes"}
          </span>
          <Button size="sm" variant="secondary" onClick={discard}>Discard</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={hasProblems}>Save changes</Button>
        </div>,
        document.body
      )}

      {confirmDialog}
    </div>
  );
}
