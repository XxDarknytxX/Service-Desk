/**
 * TemplateRenderer Component
 *
 * Core reusable component that renders any form from a JSON fields_schema array.
 * Used in ticket creation (interactive), ticket detail (read-only), and
 * template builder (preview mode).
 *
 * Supports 16 field types with conditional visibility, responsive grid layout,
 * and full validation.
 */

import { useMemo, useCallback, useState } from "react";
import Input, { Textarea, Select, SearchableSelect } from "../ui/Input";
import Icon from "../ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Width mapping for CSS grid columns
// ---------------------------------------------------------------------------
const WIDTH_MAP = {
  full: "col-span-6",
  half: "col-span-6 sm:col-span-3",
  third: "col-span-6 sm:col-span-2",
};

// Layout-only field types always span full width
const LAYOUT_TYPES = new Set(["section_header", "info_text", "divider"]);

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------
function evaluateCondition(condition, values) {
  const fieldValue = values[condition.field];

  switch (condition.operator) {
    case "equals":
      return String(fieldValue ?? "") === String(condition.value ?? "");
    case "not_equals":
      return String(fieldValue ?? "") !== String(condition.value ?? "");
    case "contains": {
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(condition.value);
      }
      return String(fieldValue ?? "").includes(String(condition.value ?? ""));
    }
    case "not_empty":
      if (Array.isArray(fieldValue)) return fieldValue.length > 0;
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    case "empty":
      if (Array.isArray(fieldValue)) return fieldValue.length === 0;
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    default:
      return true;
  }
}

function isFieldVisible(field, values) {
  if (!field.conditions || field.conditions.length === 0) return true;
  // ALL conditions must pass for the field to be visible
  return field.conditions.every((c) => evaluateCondition(c, values));
}

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------
function formatDate(value) {
  if (!value) return "--";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Validation (exported)
// ---------------------------------------------------------------------------
export function validateTemplateForm(schema, values) {
  const errors = {};

  if (!Array.isArray(schema)) return errors;

  for (const field of schema) {
    // Skip layout-only elements
    if (LAYOUT_TYPES.has(field.type) || field.type === "hidden") continue;

    // Skip fields that are conditionally hidden
    if (!isFieldVisible(field, values)) continue;

    const val = values[field.id];
    const v = field.validation || {};

    // Required check
    if (field.required) {
      if (Array.isArray(val)) {
        if (val.length === 0) {
          errors[field.id] = `${field.label || "This field"} is required`;
          continue;
        }
      } else if (field.type === "daterange") {
        const start = val?.start;
        const end = val?.end;
        if (!start || !end) {
          errors[field.id] = `${field.label || "This field"} is required`;
          continue;
        }
      } else if (val === undefined || val === null || val === "") {
        errors[field.id] = `${field.label || "This field"} is required`;
        continue;
      }
    }

    // String length checks
    if (typeof val === "string" && val.length > 0) {
      if (v.minLength && val.length < v.minLength) {
        errors[field.id] = `Minimum ${v.minLength} characters required`;
      } else if (v.maxLength && val.length > v.maxLength) {
        errors[field.id] = `Maximum ${v.maxLength} characters allowed`;
      }
    }

    // Number range checks
    if (field.type === "number" && val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (isNaN(num)) {
        errors[field.id] = "Must be a valid number";
      } else {
        if (v.min !== undefined && num < v.min) {
          errors[field.id] = `Minimum value is ${v.min}`;
        } else if (v.max !== undefined && num > v.max) {
          errors[field.id] = `Maximum value is ${v.max}`;
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Individual field renderers
// ---------------------------------------------------------------------------

function FieldLabel({ field }) {
  return (
    <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
      {field.label}
      {field.required && (
        <span className="text-[var(--error)] ml-1">*</span>
      )}
    </label>
  );
}

function FieldHelperText({ field, error }) {
  const text = error || field.helperText;
  if (!text) return null;
  return (
    <p
      className={cn(
        "mt-1.5 text-sm",
        error ? "text-[var(--error)]" : "text-[var(--fg-secondary)]"
      )}
    >
      {text}
    </p>
  );
}

function ReadOnlyValue({ children }) {
  return (
    <div className="px-4 py-2.5 text-sm text-[var(--fg-primary)] bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] min-h-[40px] flex items-center">
      {children || <span className="text-[var(--fg-muted)]">--</span>}
    </div>
  );
}

function BadgeList({ items }) {
  if (!items || items.length === 0) {
    return <ReadOnlyValue />;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span
          key={i}
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/25"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkbox (custom styled)
// ---------------------------------------------------------------------------
function CustomCheckbox({ checked, onChange, label, disabled }) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer group select-none",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "w-5 h-5 rounded flex items-center justify-center shrink-0",
          "border transition-all duration-200",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "bg-[var(--bg-elevated)] border-[var(--border-default)]",
          !disabled && !checked && "group-hover:border-[var(--fg-muted)]"
        )}
      >
        {checked && (
          <Icon name="check" size={14} className="text-white" />
        )}
      </button>
      <span className="text-sm text-[var(--fg-primary)]">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Radio (custom styled)
// ---------------------------------------------------------------------------
function CustomRadio({ checked, onChange, label, name, disabled }) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer group select-none",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange()}
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
          "border-2 transition-all duration-200",
          checked
            ? "border-[var(--accent)]"
            : "border-[var(--border-default)] bg-[var(--bg-elevated)]",
          !disabled && !checked && "group-hover:border-[var(--fg-muted)]"
        )}
      >
        {checked && (
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
        )}
      </button>
      <span className="text-sm text-[var(--fg-primary)]">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Field type renderers
// ---------------------------------------------------------------------------

function renderTextField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>{value}</ReadOnlyValue>
      </div>
    );
  }
  return (
    <Input
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      placeholder={field.placeholder || ""}
      error={error}
      helperText={field.helperText}
      disabled={preview}
      maxLength={field.validation?.maxLength}
    />
  );
}

function renderTextareaField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <div className="px-4 py-3 text-sm text-[var(--fg-primary)] bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] whitespace-pre-wrap min-h-[60px]">
          {value || <span className="text-[var(--fg-muted)]">--</span>}
        </div>
      </div>
    );
  }
  return (
    <Textarea
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      placeholder={field.placeholder || ""}
      rows={field.rows || 4}
      error={error}
      helperText={field.helperText}
      disabled={preview}
    />
  );
}

function renderRichtextField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <div className="px-4 py-3 text-sm text-[var(--fg-primary)] bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] whitespace-pre-wrap min-h-[80px]">
          {value || <span className="text-[var(--fg-muted)]">--</span>}
        </div>
      </div>
    );
  }
  return (
    <Textarea
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      placeholder={field.placeholder || ""}
      rows={field.rows || 8}
      error={error}
      helperText={field.helperText}
      disabled={preview}
    />
  );
}

function renderSelectField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    const selected = (field.options || []).find(
      (o) => String(o.value ?? o) === String(value)
    );
    const displayLabel = selected ? (selected.label ?? selected) : value;
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>{displayLabel}</ReadOnlyValue>
      </div>
    );
  }
  return (
    <Select
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      error={error}
      helperText={field.helperText}
      disabled={preview}
    >
      <option value="">{field.placeholder || "Select..."}</option>
      {(field.options || []).map((opt) => {
        const optValue = typeof opt === "object" ? opt.value : opt;
        const optLabel = typeof opt === "object" ? opt.label : opt;
        return (
          <option key={optValue} value={optValue}>
            {optLabel}
          </option>
        );
      })}
    </Select>
  );
}

function renderMultiselectField(field, value, onChange, error, readOnly, preview) {
  const selected = Array.isArray(value) ? value : [];
  const options = field.options || [];

  if (readOnly) {
    const labels = selected.map((v) => {
      const opt = options.find((o) =>
        String(typeof o === "object" ? o.value : o) === String(v)
      );
      return opt ? (typeof opt === "object" ? opt.label : opt) : v;
    });
    return (
      <div>
        <FieldLabel field={field} />
        <BadgeList items={labels} />
      </div>
    );
  }

  function handleToggle(optValue) {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(field.id, next);
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="space-y-2.5 mt-1">
        {options.map((opt) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const optLabel = typeof opt === "object" ? opt.label : opt;
          return (
            <CustomCheckbox
              key={optValue}
              checked={selected.includes(optValue)}
              onChange={() => handleToggle(optValue)}
              label={optLabel}
              disabled={preview}
            />
          );
        })}
      </div>
      <FieldHelperText field={field} error={error} />
    </div>
  );
}

function renderCheckboxGroupField(field, value, onChange, error, readOnly, preview) {
  const selected = Array.isArray(value) ? value : [];
  const groups = field.groups || [];

  if (readOnly) {
    // Collect all labels from all groups
    const labels = [];
    for (const group of groups) {
      for (const opt of group.options || []) {
        if (selected.includes(opt.value)) {
          labels.push(opt.label);
        }
      }
    }
    return (
      <div>
        <FieldLabel field={field} />
        <BadgeList items={labels} />
      </div>
    );
  }

  function handleToggle(optValue) {
    const next = selected.includes(optValue)
      ? selected.filter((v) => v !== optValue)
      : [...selected, optValue];
    onChange(field.id, next);
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="space-y-4 mt-1">
        {groups.map((group, gi) => (
          <div key={gi}>
            <h4 className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-wider mb-2">
              {group.name}
            </h4>
            <div className="space-y-2.5 pl-1">
              {(group.options || []).map((opt) => (
                <CustomCheckbox
                  key={opt.value}
                  checked={selected.includes(opt.value)}
                  onChange={() => handleToggle(opt.value)}
                  label={opt.label}
                  disabled={preview}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <FieldHelperText field={field} error={error} />
    </div>
  );
}

function renderRadioField(field, value, onChange, error, readOnly, preview) {
  const options = field.options || [];

  if (readOnly) {
    const selected = options.find(
      (o) => String(typeof o === "object" ? o.value : o) === String(value)
    );
    const displayLabel = selected
      ? typeof selected === "object"
        ? selected.label
        : selected
      : value;
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>{displayLabel}</ReadOnlyValue>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="space-y-2.5 mt-1">
        {options.map((opt) => {
          const optValue = typeof opt === "object" ? opt.value : opt;
          const optLabel = typeof opt === "object" ? opt.label : opt;
          return (
            <CustomRadio
              key={optValue}
              checked={String(value) === String(optValue)}
              onChange={() => onChange(field.id, optValue)}
              label={optLabel}
              name={field.id}
              disabled={preview}
            />
          );
        })}
      </div>
      <FieldHelperText field={field} error={error} />
    </div>
  );
}

function renderNumberField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>{value !== undefined && value !== null && value !== "" ? value : undefined}</ReadOnlyValue>
      </div>
    );
  }
  const v = field.validation || {};
  return (
    <Input
      type="number"
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value ?? ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      placeholder={field.placeholder || ""}
      min={v.min}
      max={v.max}
      step={field.step || "any"}
      error={error}
      helperText={field.helperText}
      disabled={preview}
    />
  );
}

function renderDateField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>{formatDate(value)}</ReadOnlyValue>
      </div>
    );
  }
  return (
    <Input
      type="date"
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      error={error}
      helperText={field.helperText}
      disabled={preview}
    />
  );
}

function renderDaterangeField(field, value, onChange, error, readOnly, preview) {
  const rangeValue = value && typeof value === "object" ? value : { start: "", end: "" };
  const startLabel = field.startLabel || "Start Date";
  const endLabel = field.endLabel || "End Date";

  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <span className="block text-xs text-[var(--fg-muted)] mb-1">{startLabel}</span>
            <ReadOnlyValue>{formatDate(rangeValue.start)}</ReadOnlyValue>
          </div>
          <div className="text-[var(--fg-muted)] pt-5">
            <Icon name="arrowRight" size={16} />
          </div>
          <div className="flex-1">
            <span className="block text-xs text-[var(--fg-muted)] mb-1">{endLabel}</span>
            <ReadOnlyValue>{formatDate(rangeValue.end)}</ReadOnlyValue>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-[var(--fg-muted)] mb-1">{startLabel}</label>
          <Input
            type="date"
            value={rangeValue.start || ""}
            onChange={(e) =>
              onChange(field.id, { ...rangeValue, start: e.target.value })
            }
            disabled={preview}
          />
        </div>
        <div className="text-[var(--fg-muted)] pb-2.5">
          <Icon name="arrowRight" size={16} />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-[var(--fg-muted)] mb-1">{endLabel}</label>
          <Input
            type="date"
            value={rangeValue.end || ""}
            onChange={(e) =>
              onChange(field.id, { ...rangeValue, end: e.target.value })
            }
            disabled={preview}
          />
        </div>
      </div>
      <FieldHelperText field={field} error={error} />
    </div>
  );
}

function renderFileUploadField(field, value, onChange, error, readOnly, preview) {
  if (readOnly) {
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>
          {value ? (
            <span className="flex items-center gap-2">
              <Icon name="fileText" size={16} className="text-[var(--fg-muted)]" />
              {typeof value === "string" ? value : "File attached"}
            </span>
          ) : undefined}
        </ReadOnlyValue>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center",
          "transition-colors duration-200 cursor-pointer",
          error
            ? "border-[var(--error)]/50 bg-[var(--error)]/5"
            : "border-[var(--border-default)] bg-[var(--bg-elevated)]",
          !preview && "hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5"
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center">
            <Icon name="upload" size={20} className="text-[var(--fg-muted)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--fg-primary)]">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              {field.acceptedTypes || "Any file type"}{" "}
              {field.maxSize ? `(max ${field.maxSize})` : ""}
            </p>
          </div>
        </div>
      </div>
      <FieldHelperText field={field} error={error} />
    </div>
  );
}

function renderUserLookupField(field, value, onChange, error, readOnly, preview, users) {
  const userList = users || [];

  if (readOnly) {
    const user = userList.find((u) => String(u.id) === String(value));
    const displayName = user ? user.full_name : value;
    return (
      <div>
        <FieldLabel field={field} />
        <ReadOnlyValue>
          {displayName && (
            <span className="flex items-center gap-2">
              <Icon name="user" size={16} className="text-[var(--fg-muted)]" />
              {displayName}
            </span>
          )}
        </ReadOnlyValue>
      </div>
    );
  }

  const options = userList.map((u) => ({
    value: u.id,
    label: u.full_name,
    subtitle: u.email,
  }));

  return (
    <SearchableSelect
      label={
        <span>
          {field.label}
          {field.required && <span className="text-[var(--error)] ml-1">*</span>}
        </span>
      }
      options={options}
      value={value || ""}
      onChange={(e) => onChange(field.id, e.target.value)}
      placeholder={field.placeholder || "Search users..."}
      searchPlaceholder="Type to search..."
      emptyMessage="No users found"
      error={error}
      helperText={field.helperText}
      disabled={preview}
    />
  );
}

function renderSectionHeader(field) {
  return (
    <div className="pt-2">
      <h3 className="text-base font-semibold text-[var(--fg-primary)]">
        {field.label}
      </h3>
      {field.description && (
        <p className="text-sm text-[var(--fg-secondary)] mt-1">
          {field.description}
        </p>
      )}
    </div>
  );
}

function renderInfoText(field) {
  const variant = field.variant || "info";

  const variantConfig = {
    info: {
      bg: "bg-[var(--info)]/10",
      border: "border-[var(--info)]/25",
      text: "text-[var(--info)]",
      icon: "info",
    },
    warning: {
      bg: "bg-[var(--warning)]/10",
      border: "border-[var(--warning)]/25",
      text: "text-[var(--warning)]",
      icon: "alert",
    },
    success: {
      bg: "bg-[var(--success)]/10",
      border: "border-[var(--success)]/25",
      text: "text-[var(--success)]",
      icon: "checkCircle",
    },
    error: {
      bg: "bg-[var(--error)]/10",
      border: "border-[var(--error)]/25",
      text: "text-[var(--error)]",
      icon: "xCircle",
    },
  };

  const config = variantConfig[variant] || variantConfig.info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg border",
        config.bg,
        config.border
      )}
    >
      <div className={cn("shrink-0 mt-0.5", config.text)}>
        <Icon name={config.icon} size={18} />
      </div>
      <div>
        {field.label && (
          <p className={cn("text-sm font-medium", config.text)}>
            {field.label}
          </p>
        )}
        {field.content && (
          <p className="text-sm text-[var(--fg-secondary)] mt-0.5">
            {field.content}
          </p>
        )}
      </div>
    </div>
  );
}

function renderDivider() {
  return (
    <div className="py-1">
      <hr className="border-t border-[var(--border-default)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main field dispatch
// ---------------------------------------------------------------------------
function renderField(field, value, onChange, error, readOnly, preview, users) {
  switch (field.type) {
    case "text":
      return renderTextField(field, value, onChange, error, readOnly, preview);
    case "textarea":
      return renderTextareaField(field, value, onChange, error, readOnly, preview);
    case "richtext":
      return renderRichtextField(field, value, onChange, error, readOnly, preview);
    case "select":
      return renderSelectField(field, value, onChange, error, readOnly, preview);
    case "multiselect":
      return renderMultiselectField(field, value, onChange, error, readOnly, preview);
    case "checkbox_group":
      return renderCheckboxGroupField(field, value, onChange, error, readOnly, preview);
    case "radio":
      return renderRadioField(field, value, onChange, error, readOnly, preview);
    case "number":
      return renderNumberField(field, value, onChange, error, readOnly, preview);
    case "date":
      return renderDateField(field, value, onChange, error, readOnly, preview);
    case "daterange":
      return renderDaterangeField(field, value, onChange, error, readOnly, preview);
    case "file_upload":
      return renderFileUploadField(field, value, onChange, error, readOnly, preview);
    case "user_lookup":
      return renderUserLookupField(field, value, onChange, error, readOnly, preview, users);
    case "section_header":
      return renderSectionHeader(field);
    case "info_text":
      return renderInfoText(field);
    case "divider":
      return renderDivider();
    case "hidden":
      return null;
    default:
      return (
        <div className="px-4 py-3 text-sm text-[var(--fg-muted)] bg-[var(--bg-surface)] rounded-lg border border-dashed border-[var(--border-default)]">
          Unsupported field type: <code>{field.type}</code>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Repeating section detection
// ---------------------------------------------------------------------------
// Detects numbered section groups like tr1_header/tr2_header or v1_header/v2_header
// and groups them so only the first is shown with "Add More" button.

const NUMBERED_PREFIX_RE = /^([a-zA-Z]+)(\d+)_(.+)$/;

function detectRepeatingSections(fields) {
  // 1. Find all section_headers that match the numbered pattern
  const headersByBase = {};
  fields.forEach((f, idx) => {
    if (f.type !== "section_header") return;
    const m = f.id.match(NUMBERED_PREFIX_RE);
    if (!m) return;
    const base = m[1];   // e.g. "tr", "v", "res"
    const num = parseInt(m[2]); // e.g. 1, 2, 3
    if (!headersByBase[base]) headersByBase[base] = [];
    headersByBase[base].push({ field: f, index: idx, num });
  });

  // 2. Only bases with 2+ numbered headers are repeating groups
  const repeatGroups = {};
  for (const [base, headers] of Object.entries(headersByBase)) {
    if (headers.length < 2) continue;
    headers.sort((a, b) => a.num - b.num);
    repeatGroups[base] = headers;
  }

  if (Object.keys(repeatGroups).length === 0) return null;

  // 3. Assign each field to a group instance or mark as non-group
  // A field belongs to group "tr" instance 2 if its id starts with "tr2_"
  const fieldGroupMap = new Map(); // field.id -> { base, num }
  for (const [base, headers] of Object.entries(repeatGroups)) {
    for (const h of headers) {
      const prefix = `${base}${h.num}_`;
      // Find all fields after this header that share the prefix (until next section_header)
      fieldGroupMap.set(h.field.id, { base, num: h.num });
      for (let i = h.index + 1; i < fields.length; i++) {
        const f = fields[i];
        if (f.type === "section_header") break;
        if (f.id.startsWith(prefix)) {
          fieldGroupMap.set(f.id, { base, num: h.num });
        }
      }
    }
  }

  // 4. Build ordered group info: { base -> { label, maxNum, instances: [num, num, ...] } }
  const groupInfo = {};
  for (const [base, headers] of Object.entries(repeatGroups)) {
    // Derive a clean label from the first header (strip the number)
    const firstLabel = headers[0].field.label || "";
    // Remove leading number and surrounding whitespace/punctuation
    const cleanLabel = firstLabel.replace(/^\d+\s*/, "").replace(/\s*\(if applicable\)\s*$/i, "").trim() || base;
    groupInfo[base] = {
      label: cleanLabel,
      maxNum: Math.max(...headers.map(h => h.num)),
      instances: headers.map(h => h.num),
    };
  }

  return { fieldGroupMap, groupInfo };
}

// ---------------------------------------------------------------------------
// TemplateRenderer Component
// ---------------------------------------------------------------------------
export default function TemplateRenderer({
  schema = [],
  values = {},
  onChange = () => {},
  errors = {},
  readOnly = false,
  preview = false,
  users = [],
}) {
  // Detect repeating section groups
  const repeatData = useMemo(() => {
    if (!Array.isArray(schema)) return null;
    return detectRepeatingSections(schema);
  }, [schema]);

  // Track how many instances are visible per group base
  // In readOnly mode, show all instances that have data; in edit mode, start with 1
  const [visibleCounts, setVisibleCounts] = useState(() => {
    if (!repeatData) return {};
    const counts = {};
    for (const [base, info] of Object.entries(repeatData.groupInfo)) {
      if (readOnly) {
        // Show all instances that have data
        let lastWithData = 1;
        for (const num of info.instances) {
          const prefix = `${base}${num}_`;
          const hasData = Object.keys(values).some(k => k.startsWith(prefix) && values[k]);
          if (hasData) lastWithData = num;
        }
        counts[base] = lastWithData;
      } else {
        counts[base] = 1;
      }
    }
    return counts;
  });

  // Memoize visible fields
  const visibleFields = useMemo(() => {
    if (!Array.isArray(schema)) return [];
    return schema.filter((field) => {
      if (field.type === "hidden") return false;
      return isFieldVisible(field, values);
    });
  }, [schema, values]);

  // Stable onChange ref
  const handleChange = useCallback(
    (id, val) => {
      if (!readOnly) {
        onChange(id, val);
      }
    },
    [onChange, readOnly]
  );

  if (!Array.isArray(schema) || schema.length === 0) {
    return (
      <div className="text-sm text-[var(--fg-muted)] text-center py-8">
        No form fields defined.
      </div>
    );
  }

  // Build the render list with "Add More" buttons injected
  const renderItems = [];
  const processedAddButtons = new Set();

  for (const field of visibleFields) {
    const groupEntry = repeatData?.fieldGroupMap?.get(field.id);

    if (groupEntry) {
      const { base, num } = groupEntry;
      const maxVisible = visibleCounts[base] || 1;

      // Skip fields from hidden instances
      if (num > maxVisible) continue;

      // Render the field
      renderItems.push({ type: "field", field });

      // After the last field of the current max visible instance, inject the Add More / Remove buttons
      if (num === maxVisible && !processedAddButtons.has(base)) {
        // Check if this is the last field in this instance group
        const prefix = `${base}${num}_`;
        const instanceFields = visibleFields.filter(f => {
          const ge = repeatData.fieldGroupMap.get(f.id);
          return ge && ge.base === base && ge.num === num;
        });
        const lastFieldInInstance = instanceFields[instanceFields.length - 1];

        if (field.id === lastFieldInInstance.id) {
          processedAddButtons.add(base);
          const info = repeatData.groupInfo[base];
          renderItems.push({
            type: "repeat_controls",
            base,
            label: info.label,
            canAdd: maxVisible < info.maxNum,
            canRemove: maxVisible > 1,
            currentCount: maxVisible,
            maxCount: info.maxNum,
          });
        }
      }
    } else {
      renderItems.push({ type: "field", field });
    }
  }

  return (
    <div className="grid grid-cols-6 gap-x-4 gap-y-5">
      {renderItems.map((item, idx) => {
        if (item.type === "repeat_controls") {
          if (readOnly) return null;
          return (
            <div key={`repeat-${item.base}`} className="col-span-6 flex items-center gap-3 py-2">
              {item.canAdd && (
                <button
                  type="button"
                  onClick={() => setVisibleCounts(prev => ({
                    ...prev,
                    [item.base]: (prev[item.base] || 1) + 1
                  }))}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-dashed border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/5 hover:border-[var(--accent)] transition-all"
                >
                  <Icon name="plus" size={14} />
                  Add Another {item.label}
                </button>
              )}
              {item.canRemove && (
                <button
                  type="button"
                  onClick={() => {
                    const removing = visibleCounts[item.base] || 1;
                    // Clear values for the removed instance
                    const prefix = `${item.base}${removing}_`;
                    for (const key of Object.keys(values)) {
                      if (key.startsWith(prefix)) {
                        onChange(key, "");
                      }
                    }
                    setVisibleCounts(prev => ({
                      ...prev,
                      [item.base]: Math.max(1, (prev[item.base] || 1) - 1)
                    }));
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-dashed border-rose-500/40 text-rose-400 hover:bg-rose-500/5 hover:border-rose-500 transition-all"
                >
                  <Icon name="trash" size={14} />
                  Remove Last
                </button>
              )}
              {item.canAdd && (
                <span className="text-xs text-[var(--fg-muted)] ml-auto">
                  {item.currentCount} of {item.maxCount}
                </span>
              )}
            </div>
          );
        }

        // Regular field
        const { field } = item;
        const isLayout = LAYOUT_TYPES.has(field.type);
        const widthClass = isLayout
          ? "col-span-6"
          : WIDTH_MAP[field.width] || WIDTH_MAP.full;

        return (
          <div key={field.id} className={widthClass}>
            {renderField(
              field,
              values[field.id],
              handleChange,
              errors[field.id],
              readOnly,
              preview,
              users
            )}
          </div>
        );
      })}
    </div>
  );
}
