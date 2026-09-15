/**
 * SLA Settings — Corporate Service Desk
 *
 * Every clock a corporate request runs on:
 *
 *   Default SLA     first response + resolution per priority, for any delivery
 *                   team without its own SLA
 *   Team SLAs       each delivery team can have its own SLA (per priority, 24/7
 *                   or on a business-hours schedule)
 *   NOC triage SLA  NOC's own clock: set the urgency of a "Not sure" request and
 *                   route it to a team, per priority
 *   Manager review  time each escalation layer (L1, L2, …) has to act
 *
 * NOC sets the urgency during triage (ticket sidebar); that re-targets the triage
 * clock, and the routed team's SLA for that urgency starts when it's routed.
 * The internal desk keeps its own policies on the internal SLA Policies page.
 * Saving applies to clocks that start afterwards. Admins edit; staff can read.
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

/** "1h 30m", "2d", "45m" */
function formatMinutes(m) {
  if (!m) return "—";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  return [d && `${d}d`, h && `${h}h`, mins && `${mins}m`].filter(Boolean).join(" ");
}

/** Number + unit, stored as whole minutes. `null` value = empty. */
function DurationInput({ value, onChange, disabled, allowEmpty = false, invalid, label }) {
  const [unit, setUnit] = useState(() => unitFor(value));
  const [text, setText] = useState(() => (value === null || value === undefined ? "" : String(value / UNITS.find((u) => u.key === unitFor(value)).factor)));

  // Follow outside changes (load / discard / copy from default) without
  // fighting the user's typing.
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
  if (!t.response_minutes) out.response_minutes = "Set a first response time";
  if (!t.resolve_minutes) out.resolve_minutes = "Set a resolution time";
  if (t.response_minutes && t.resolve_minutes && t.response_minutes > t.resolve_minutes) {
    out.response_minutes = "Longer than resolution";
  }
  if (t.notify_at_risk_minutes !== null && t.notify_at_risk_minutes !== undefined && t.resolve_minutes && t.notify_at_risk_minutes >= t.resolve_minutes) {
    out.notify_at_risk_minutes = "Must be shorter than resolution";
  }
  return out;
}

function slaProblems(sla) {
  const rows = sla.priorities.map(targetProblems);
  const clock = sla.use_business_hours && !sla.business_hours_id ? "Choose a schedule" : null;
  return { rows, clock, any: !!clock || rows.some((r) => Object.keys(r).length) };
}

function Section({ icon, tone, title, description, children, aside }) {
  return (
    <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start gap-3 p-5 pb-4 border-b border-[var(--border-default)]">
        <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", tone)}>
          <Icon name={icon} size={17} />
        </span>
        <div className="min-w-[14rem] flex-1">
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

function Segmented({ options, value, onChange, disabled, size = "md" }) {
  return (
    <div className="inline-flex p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-all disabled:cursor-not-allowed whitespace-nowrap",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === o.value ? "bg-[var(--accent)] text-white" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 24/7 vs business hours (+ schedule) for one SLA. */
function ClockPicker({ sla, onChange, businessHours, disabled, error }) {
  return (
    <div className="flex flex-col sm:items-end gap-2">
      <Segmented
        disabled={disabled}
        value={!!sla.use_business_hours}
        onChange={(v) => onChange({ use_business_hours: v, business_hours_id: v ? sla.business_hours_id || businessHours[0]?.id || null : sla.business_hours_id })}
        options={[{ value: false, label: "24/7" }, { value: true, label: "Business hours" }]}
      />
      {sla.use_business_hours && (
        businessHours.length ? (
          <div className="sm:w-60">
            <Select
              size="sm"
              disabled={disabled}
              value={sla.business_hours_id || ""}
              onChange={(e) => onChange({ business_hours_id: Number(e.target.value) || null })}
            >
              {businessHours.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.timezone ? ` (${b.timezone})` : ""}</option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="text-xs text-rose-500">{error || "No business-hours schedule exists yet."}</p>
        )
      )}
    </div>
  );
}

const TARGET_FIELDS = [
  ["response_minutes", "First response", false],
  ["resolve_minutes", "Resolution", false],
  ["notify_at_risk_minutes", "At-risk warning", true],
];

/** Priority × (first response, resolution, at-risk warning). */
function TargetsMatrix({ rows, problems, onChange, disabled, priorityById, labelPrefix }) {
  return (
    <div>
      <div className="hidden md:grid grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-3 px-1 pb-2 text-label">
        <span>Priority</span>
        <span>First response</span>
        <span>Resolution</span>
        <span>At-risk warning <span className="normal-case font-normal text-[var(--fg-muted)]">(before due)</span></span>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const pr = priorityById.get(row.priority_id);
          return (
            <div key={row.priority_id} className="grid grid-cols-1 md:grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-3 items-start rounded-xl md:rounded-none border md:border-0 border-[var(--border-default)] p-3 md:p-1">
              <div className="md:pt-2"><PriorityLabel priority={pr} /></div>
              {TARGET_FIELDS.map(([field, label, allowEmpty]) => (
                <div key={field}>
                  <span className="md:hidden block text-[11px] text-[var(--fg-muted)] mb-1">{label}</span>
                  <DurationInput
                    label={`${labelPrefix} ${pr?.label} ${label}`}
                    value={row[field]}
                    allowEmpty={allowEmpty}
                    disabled={disabled}
                    invalid={!!problems[i]?.[field]}
                    onChange={(v) => onChange(i, field, v)}
                  />
                  <FieldError>{problems[i]?.[field]}</FieldError>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CorporateSla() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(null);
  const [saved, setSaved] = useState(null); // last loaded settings (for dirty / discard)
  const [draft, setDraft] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const d = await api("/corporate/sla-settings");
      const settings = { default: d.default, teams: d.teams, triage: d.triage, manager_review: d.manager_review };
      setMeta({
        priorities: d.priorities,
        business_hours: d.business_hours,
        triage_team: d.triage_team,
        can_edit: d.can_edit,
        last_changed_at: d.last_changed_at,
      });
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
  const businessHours = meta?.business_hours || [];

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const problems = useMemo(() => {
    if (!draft) return null;
    const def = slaProblems(draft.default);
    const teams = draft.teams.map((t) => (t.custom ? slaProblems(t) : { rows: [], clock: null, any: false }));
    const clock = (key) => draft[key].map((r) => (!r.minutes ? "Set a time" : null));
    const triage = clock("triage");
    const review = clock("manager_review");
    return {
      default: def, teams, triage, manager_review: review,
      any: def.any || teams.some((t) => t.any) || triage.some(Boolean) || review.some(Boolean),
    };
  }, [draft]);

  function update(mutator) {
    setDraft((d) => {
      const next = structuredClone(d);
      mutator(next);
      return next;
    });
  }

  async function save() {
    if (problems?.any) return toast.error("Fix the highlighted targets first");
    setSaving(true);
    try {
      const r = await api("/corporate/sla-settings", { method: "PUT", body: draft });
      toast.success(r.archived ? "SLA settings saved. Removed targets that requests already used were archived." : "SLA settings saved");
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

  const customCount = draft?.teams.filter((t) => t.custom).length || 0;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        icon="sla"
        title="SLA Settings"
        subtitle="Team, triage and escalation targets for corporate requests"
        actions={
          canEdit && (
            <Button onClick={save} loading={saving} disabled={!dirty || problems?.any} icon={<Icon name="check" size={16} />}>
              Save changes
            </Button>
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
          <Skeleton className="h-72" rounded="rounded-2xl" />
          <Skeleton className="h-64" rounded="rounded-2xl" />
        </div>
      ) : (
        <>
          {/* ── Default SLA ──────────────────────────────────────────────── */}
          <Section
            icon="clock"
            tone="text-[var(--accent)] bg-[var(--accent)]/10"
            title="Default SLA"
            description="Used by every delivery team that doesn't have its own SLA. The clock starts when a request lands in the team's queue, at the urgency NOC or the customer's category set."
            aside={
              <ClockPicker
                sla={draft.default}
                businessHours={businessHours}
                disabled={!canEdit}
                error={problems.default.clock}
                onChange={(patch) => update((d) => Object.assign(d.default, patch))}
              />
            }
          >
            <TargetsMatrix
              rows={draft.default.priorities}
              problems={problems.default.rows}
              priorityById={priorityById}
              disabled={!canEdit}
              labelPrefix="Default"
              onChange={(i, field, v) => update((d) => {
                d.default.priorities[i][field] = v;
                // Teams following the default mirror it, so switching one to
                // its own SLA starts from the current default.
                d.teams.forEach((t) => { if (!t.custom) t.priorities[i][field] = v; });
              })}
            />
          </Section>

          {/* ── Team SLAs ────────────────────────────────────────────────── */}
          <Section
            icon="teams"
            tone="text-blue-500 bg-blue-500/10"
            title="Team SLAs"
            description="Give a delivery team its own SLA. A team set to Default follows the default SLA above."
            aside={<Badge tone="slate" size="sm">{customCount} of {draft.teams.length} with their own SLA</Badge>}
          >
            {draft.teams.length === 0 ? (
              <p className="text-xs text-[var(--fg-muted)]">No corporate delivery teams yet. Add them under Delivery Teams.</p>
            ) : (
              <div className="space-y-3">
                {draft.teams.map((team, ti) => {
                  const tp = problems.teams[ti];
                  const urgent = team.priorities[team.priorities.length - 1];
                  const normal = team.priorities.find((p) => priorityById.get(p.priority_id)?.key === "normal") || team.priorities[0];
                  return (
                    <div
                      key={team.team_id}
                      className={cn(
                        "rounded-xl border",
                        team.custom ? "border-[var(--border-strong,var(--border-default))] bg-[var(--bg-base)]" : "border-[var(--border-default)]"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-[10rem] flex-1">
                          <p className="text-sm font-semibold text-[var(--fg-primary)]">{team.name}</p>
                          <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                            {team.custom
                              ? `Own SLA · ${team.use_business_hours ? "business hours" : "24/7"}`
                              : `Default SLA · Normal ${formatMinutes(normal?.response_minutes)} / ${formatMinutes(normal?.resolve_minutes)} · Urgent ${formatMinutes(urgent?.response_minutes)} / ${formatMinutes(urgent?.resolve_minutes)}`}
                          </p>
                        </div>
                        <Segmented
                          size="sm"
                          disabled={!canEdit}
                          value={!!team.custom}
                          onChange={(custom) => update((d) => {
                            const t = d.teams[ti];
                            t.custom = custom;
                            if (!custom) {
                              // Back to the default: mirror it again.
                              t.priorities = structuredClone(d.default.priorities);
                              t.use_business_hours = d.default.use_business_hours;
                              t.business_hours_id = d.default.business_hours_id;
                            }
                          })}
                          options={[{ value: false, label: "Default" }, { value: true, label: "Own SLA" }]}
                        />
                      </div>
                      {team.custom && (
                        <div className="border-t border-[var(--border-default)] px-4 py-4 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-[var(--fg-tertiary)]">Targets for requests in {team.name}'s queue.</p>
                            <ClockPicker
                              sla={team}
                              businessHours={businessHours}
                              disabled={!canEdit}
                              error={tp.clock}
                              onChange={(patch) => update((d) => Object.assign(d.teams[ti], patch))}
                            />
                          </div>
                          <TargetsMatrix
                            rows={team.priorities}
                            problems={tp.rows}
                            priorityById={priorityById}
                            disabled={!canEdit}
                            labelPrefix={team.name}
                            onChange={(i, field, v) => update((d) => { d.teams[ti].priorities[i][field] = v; })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── NOC triage + manager review ──────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              {
                clock: "triage",
                icon: "filter",
                tone: "text-amber-500 bg-amber-500/10",
                title: `${meta.triage_team?.name || "NOC"} triage SLA`,
                description: `${meta.triage_team?.name || "NOC"}'s own SLA: time to set the urgency of a “Not sure” request and route it to a delivery team. Changing the urgency during triage re-targets this clock; the team's SLA starts once it's routed. Runs 24/7.`,
              },
              {
                clock: "manager_review",
                icon: "arrowUp",
                tone: "text-violet-500 bg-violet-500/10",
                title: "Manager review",
                description: "Time each escalation layer has to act once a request reaches them: hand it back, resolve it, or pass it to the next level. Every layer (L1, L2, …) gets a fresh clock. Runs 24/7.",
              },
            ].map((s) => (
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
                            invalid={!!problems[s.clock][i]}
                            onChange={(v) => update((d) => { d[s.clock][i].minutes = v; })}
                          />
                          <FieldError>{problems[s.clock][i]}</FieldError>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            ))}
          </div>
        </>
      )}

      {/* Unsaved-changes bar — portalled: the page wrapper's entry animation
          makes `fixed` relative to it instead of the viewport. Centred and
          raised on phones so it clears the chat button. */}
      {canEdit && dirty && createPortal(
        <div className="fixed z-50 bottom-20 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card-hover)] px-4 py-3">
          <span className="text-sm text-[var(--fg-secondary)] mr-auto sm:mr-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {problems?.any ? "Fix the highlighted targets to save" : "Unsaved changes"}
          </span>
          <Button size="sm" variant="secondary" onClick={discard}>Discard</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={problems?.any}>Save changes</Button>
        </div>,
        document.body
      )}

      {confirmDialog}
    </div>
  );
}
