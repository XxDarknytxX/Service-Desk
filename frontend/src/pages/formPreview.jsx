/**
 * Form Preview Page — /forms/preview/:id (staff only)
 *
 * Renders the form exactly as a customer sees it at /f/<token>, full tab,
 * fully scrollable and interactive — but submissions are disabled.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formsApi } from "../services/api";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import VodafoneLogo from "../components/ui/VodafoneLogo";
import TemplateRenderer from "../components/templates/TemplateRenderer";
import { Shell, StateCard } from "./publicForm";

export default function FormPreview() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [values, setValues] = useState({});

  useEffect(() => {
    formsApi
      .get(id)
      .then((data) => {
        setForm(data.form);
        const init = {};
        for (const f of data.form.fields_schema || []) {
          if (f.defaultValue !== undefined && f.defaultValue !== null) init[f.id] = f.defaultValue;
          else if (f.type === "checkbox_group" || f.type === "multiselect") init[f.id] = [];
          else if (f.type === "daterange") init[f.id] = { start: "", end: "" };
          else init[f.id] = "";
        }
        setValues(init);
      })
      .catch((e) => setError(e.message || "Failed to load form"));
  }, [id]);

  if (error) {
    return (
      <Shell>
        <StateCard
          icon="alertTriangle"
          iconCls="bg-rose-500/10 text-rose-500"
          title="Couldn't load this form"
          message={error}
        />
      </Shell>
    );
  }

  if (!form) {
    return (
      <Shell>
        <div className="mt-[16vh] flex flex-col items-center animate-fade-in">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-2 border-[#E60000]/15 border-t-[#E60000] animate-spin" />
            <div className="absolute inset-[9px] flex items-center justify-center">
              <VodafoneLogo size={46} />
            </div>
          </div>
          <p className="mt-5 text-sm text-black/45">Loading preview…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-[760px]">
        {/* Preview banner */}
        <div className="sticky top-3 z-30 mb-5 animate-fade-up">
          <div className="flex items-center gap-3 rounded-2xl bg-[#111318] text-white px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.06]">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-semibold uppercase tracking-wider">
              <Icon name="eye" size={12} /> Preview
            </span>
            <p className="text-[13px] text-white/70 flex-1">
              This is exactly what recipients see. Submissions are disabled in preview.
            </p>
            <button
              onClick={() => window.close()}
              className="text-[12px] font-medium text-white/60 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Header card — mirrors the live customer page */}
        <div className="relative bg-white rounded-3xl border border-black/[0.07] shadow-[0_24px_64px_rgba(20,3,5,0.10)] overflow-hidden mb-5 animate-fade-up">
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #E60000, #ff4d4d)" }} />
          <div
            className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(closest-side, rgba(230,0,0,0.10), transparent 70%)" }}
          />
          <div className="relative p-7 sm:p-8">
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
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/[0.04] border border-black/[0.06]">
              <Icon name="user" size={13} className="text-black/40" />
              <span className="text-[12px] text-black/55">
                Filling in as <strong className="text-[#111318] font-medium">recipient@example.com</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Interactive form body */}
        <div className="bg-white rounded-3xl border border-black/[0.07] shadow-[0_24px_64px_rgba(20,3,5,0.10)] p-6 sm:p-8 animate-fade-up">
          <TemplateRenderer
            schema={form.fields_schema || []}
            values={values}
            onChange={(fieldId, value) => setValues((p) => ({ ...p, [fieldId]: value }))}
          />
        </div>

        <div className="mt-5 flex items-center justify-end">
          <span title="Submissions are disabled in preview">
            <Button size="lg" disabled icon={<Icon name="send" size={16} />}>
              Submit response
            </Button>
          </span>
        </div>
      </div>
    </Shell>
  );
}
