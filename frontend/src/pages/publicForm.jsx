/**
 * Public Form Fill Page — /f/:token
 *
 * The customer-facing, Google-Forms-style experience. No login: the unique
 * one-time link is the credential. Forced light tokens (data-theme="light")
 * so it renders identically for everyone, with the Vodafone red→white
 * identity, a live progress bar, and a celebratory success state.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { publicFormsApi } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import VodafoneLogo from "../components/ui/VodafoneLogo";
import TemplateRenderer, { validateTemplateForm } from "../components/templates/TemplateRenderer";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const INPUT_TYPES = new Set([
  "text", "textarea", "richtext", "select", "multiselect", "checkbox_group",
  "radio", "number", "date", "daterange", "user_lookup",
]);

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every(isEmptyValue);
  return false;
}

/* Shared centered shell on the branded canvas (also used by the admin
   full-tab preview at /forms/preview/:id) */
export function Shell({ children }) {
  return (
    <div data-theme="light" className="min-h-screen bg-[#F4F5F7] flex flex-col">
      {/* Brand band */}
      <div
        className="h-2 w-full shrink-0"
        style={{ background: "linear-gradient(90deg, #E60000 0%, #a30b14 55%, #2a060a 100%)" }}
      />
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10">
        {children}
      </div>
      <footer className="pb-8 pt-2 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <VodafoneLogo size={16} />
          <span className="text-[12px] font-medium text-black/45">
            Vodafone Fiji Service Desk
          </span>
        </div>
        <p className="text-[10px] text-black/30">
          This form was sent to you by Vodafone Fiji. Do not share your link.
        </p>
      </footer>
    </div>
  );
}

function StateCard({ icon, iconCls, title, message, children }) {
  return (
    <div className="w-full max-w-md mt-[12vh] animate-fade-up">
      <div className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_20px_60px_rgba(20,3,5,0.10)] p-8 text-center">
        <div className={cn("w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center", iconCls)}>
          <Icon name={icon} size={28} />
        </div>
        <h1 className="text-xl font-semibold text-[#111318] tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-black/50 leading-relaxed">{message}</p>
        {children}
      </div>
    </div>
  );
}

export default function PublicForm() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | invalid | completed | active | success
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    publicFormsApi
      .get(token)
      .then((data) => {
        if (!alive) return;
        setForm(data.form);
        if (data.state === "completed") {
          setState("completed");
          return;
        }
        setRecipient(data.recipient || null);
        // Initialise values with defaults
        const init = {};
        for (const f of data.form.fields_schema || []) {
          if (f.defaultValue !== undefined && f.defaultValue !== null) init[f.id] = f.defaultValue;
          else if (f.type === "checkbox_group" || f.type === "multiselect") init[f.id] = [];
          else if (f.type === "daterange") init[f.id] = { start: "", end: "" };
          else init[f.id] = "";
        }
        setValues(init);
        setState("active");
      })
      .catch((e) => {
        if (!alive) return;
        setErrorMsg(e.message || "This form link is invalid");
        setState("invalid");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const schema = form?.fields_schema || [];

  // Required progress (unconditional required input fields)
  const progress = useMemo(() => {
    const required = schema.filter(
      (f) =>
        INPUT_TYPES.has(f.type) &&
        f.required &&
        !(Array.isArray(f.conditions) && f.conditions.length > 0)
    );
    if (!required.length) return { done: 0, total: 0, pct: 100 };
    const done = required.filter((f) => !isEmptyValue(values[f.id])).length;
    return { done, total: required.length, pct: Math.round((done / required.length) * 100) };
  }, [schema, values]);

  function handleChange(fieldId, value) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validation = validateTemplateForm(schema, values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      // Scroll to the first errored field
      const firstId = Object.keys(validation)[0];
      document.getElementById(`field-${firstId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      await publicFormsApi.submit(token, values);
      setState("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErrorMsg(err.message || "Submission failed — please try again");
      setErrors({});
      // Surface the server message inline at the top of the form
      document.getElementById("public-form-top")?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ─────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <Shell>
        <div className="mt-[16vh] flex flex-col items-center animate-fade-in">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#E60000]/15 border-t-[#E60000] animate-spin" />
            <div className="absolute inset-[9px] flex items-center justify-center">
              <VodafoneLogo size={46} />
            </div>
          </div>
          <p className="mt-5 text-sm text-black/45">Loading your form…</p>
        </div>
      </Shell>
    );
  }

  if (state === "invalid") {
    return (
      <Shell>
        <StateCard
          icon="alertTriangle"
          iconCls="bg-rose-500/10 text-rose-500"
          title="This link isn't available"
          message={errorMsg}
        />
      </Shell>
    );
  }

  if (state === "completed") {
    return (
      <Shell>
        <StateCard
          icon="checkCircle"
          iconCls="bg-emerald-500/10 text-emerald-500"
          title="Already submitted"
          message={`Your response to "${form?.name}" has already been recorded. This was a one-time link — if you need to make changes, contact your Vodafone Fiji representative.`}
        />
      </Shell>
    );
  }

  if (state === "success") {
    return (
      <Shell>
        <StateCard
          icon="check"
          iconCls="bg-emerald-500/10 text-emerald-500 animate-scale-in"
          title="Thank you!"
          message={`Your response to "${form?.name}" has been submitted successfully. Our team will review it and be in touch if anything else is needed.`}
        >
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-black/35">
            <Icon name="lock" size={11} />
            This link is now closed and cannot be reused
          </div>
        </StateCard>
      </Shell>
    );
  }

  // ── Active form ────────────────────────────────────────────────
  return (
    <Shell>
      <div id="public-form-top" className="w-full max-w-[760px]">
        {/* Form header card */}
        <div className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_20px_60px_rgba(20,3,5,0.08)] overflow-hidden mb-5 animate-fade-up">
          <div
            className="h-1.5 w-full"
            style={{ background: "linear-gradient(90deg, #E60000, #ff4d4d)" }}
          />
          <div className="p-7 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-[#111318] leading-snug">
                  {form.name}
                </h1>
                {form.description && (
                  <p className="mt-2.5 text-sm text-black/55 leading-relaxed">{form.description}</p>
                )}
              </div>
              <VodafoneLogo size={44} className="shrink-0 drop-shadow-[0_4px_12px_rgba(230,0,0,0.25)]" />
            </div>
            {recipient?.email && (
              <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/[0.04] border border-black/[0.06]">
                <Icon name="user" size={13} className="text-black/40" />
                <span className="text-[12px] text-black/55">
                  Filling in as <strong className="text-[#111318] font-medium">{recipient.name || recipient.email}</strong>
                </span>
              </div>
            )}
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-black/35">
              <Icon name="info" size={11} />
              Required questions are marked with an asterisk. This is a one-time link — submit when you're done.
            </p>
          </div>
        </div>

        {/* Sticky progress */}
        {progress.total > 0 && (
          <div className="sticky top-3 z-20 mb-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <div className="bg-white/90 backdrop-blur-xl rounded-xl border border-black/[0.07] shadow-[0_8px_28px_rgba(20,3,5,0.08)] px-4 py-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${progress.pct}%`,
                    background: "linear-gradient(90deg, #E60000, #ff4d4d)",
                  }}
                />
              </div>
              <span className="text-[11px] font-medium text-black/50 whitespace-nowrap tabular-nums">
                {progress.done}/{progress.total} required
              </span>
            </div>
          </div>
        )}

        {/* Server error banner */}
        {errorMsg && (
          <div className="mb-5 flex items-start gap-3 p-4 rounded-xl bg-rose-500/[0.07] border border-rose-500/25 animate-shake">
            <Icon name="alertTriangle" size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-rose-600">{errorMsg}</p>
          </div>
        )}

        {/* The form */}
        <form onSubmit={handleSubmit}>
          <div
            className="bg-white rounded-2xl border border-black/[0.07] shadow-[0_20px_60px_rgba(20,3,5,0.08)] p-6 sm:p-8 animate-fade-up"
            style={{ animationDelay: "140ms" }}
          >
            <TemplateRenderer
              schema={schema}
              values={values}
              onChange={handleChange}
              errors={errors}
            />
          </div>

          {/* Submit bar */}
          <div
            className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between animate-fade-up"
            style={{ animationDelay: "200ms" }}
          >
            <p className="flex items-center gap-1.5 text-[11px] text-black/35 order-2 sm:order-1">
              <Icon name="lock" size={11} />
              Your response is sent securely to Vodafone Fiji
            </p>
            <Button
              type="submit"
              size="lg"
              loading={submitting}
              className="order-1 sm:order-2 sm:min-w-[180px]"
              icon={<Icon name="send" size={16} />}
            >
              {submitting ? "Submitting…" : "Submit response"}
            </Button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
