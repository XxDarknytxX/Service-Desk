/**
 * FieldPropertiesPanel Component
 * Right panel for editing the selected field's properties.
 *
 * Shows different property editors based on field type including
 * common properties, type-specific settings, and conditional visibility.
 */

import { useState } from "react";
import Input, { Textarea, Select } from "../ui/Input";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const LAYOUT_TYPES = ["section_header", "info_text", "divider"];

/**
 * Reusable toggle checkbox styled for the dark theme
 */
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors duration-200",
          checked ? "bg-[var(--accent)]" : "bg-[var(--bg-base)] border border-[var(--border-default)]"
        )}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
      >
        <div
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full transition-transform duration-200",
            checked
              ? "translate-x-[18px] bg-white"
              : "translate-x-0.5 bg-[var(--fg-muted)]"
          )}
        />
      </div>
      <span className="text-sm text-[var(--fg-secondary)] group-hover:text-[var(--fg-primary)] transition-colors">
        {label}
      </span>
    </label>
  );
}

/**
 * Section divider with label
 */
function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-2">
      <span className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--border-default)]" />
    </div>
  );
}

/**
 * Options editor for select, multiselect, and radio fields.
 * Manages a list of {value, label} pairs.
 */
function OptionsEditor({ options = [], onChange }) {
  function handleOptionChange(index, key, val) {
    const updated = options.map((opt, i) =>
      i === index ? { ...opt, [key]: val } : opt
    );
    onChange(updated);
  }

  function handleAddOption() {
    const nextNum = options.length + 1;
    onChange([
      ...options,
      { value: `option_${nextNum}`, label: `Option ${nextNum}` },
    ]);
  }

  function handleRemoveOption(index) {
    if (options.length <= 1) return;
    onChange(options.filter((_, i) => i !== index));
  }

  function handleMoveOption(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= options.length) return;
    const updated = [...options];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Reorder handle */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => handleMoveOption(i, -1)}
              disabled={i === 0}
              className={cn(
                "p-0.5 rounded text-[var(--fg-muted)]",
                i === 0
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:text-[var(--fg-primary)]"
              )}
            >
              <Icon name="chevron-up" size={10} />
            </button>
            <button
              type="button"
              onClick={() => handleMoveOption(i, 1)}
              disabled={i === options.length - 1}
              className={cn(
                "p-0.5 rounded text-[var(--fg-muted)]",
                i === options.length - 1
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:text-[var(--fg-primary)]"
              )}
            >
              <Icon name="chevron-down" size={10} />
            </button>
          </div>

          {/* Value input */}
          <input
            type="text"
            value={opt.value}
            onChange={(e) => handleOptionChange(i, "value", e.target.value)}
            placeholder="Value"
            className={cn(
              "flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md",
              "bg-[var(--bg-base)] border border-[var(--border-default)]",
              "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-colors duration-150"
            )}
          />

          {/* Label input */}
          <input
            type="text"
            value={opt.label}
            onChange={(e) => handleOptionChange(i, "label", e.target.value)}
            placeholder="Label"
            className={cn(
              "flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md",
              "bg-[var(--bg-base)] border border-[var(--border-default)]",
              "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-colors duration-150"
            )}
          />

          {/* Delete */}
          <button
            type="button"
            onClick={() => handleRemoveOption(i)}
            disabled={options.length <= 1}
            className={cn(
              "p-1 rounded-md shrink-0 transition-colors duration-150",
              "text-[var(--fg-muted)]",
              options.length <= 1
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-rose-500/10 hover:text-rose-500"
            )}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}

      <Button
        variant="ghost"
        size="xs"
        icon={<Icon name="plus" size={12} />}
        onClick={handleAddOption}
        className="w-full mt-1"
      >
        Add Option
      </Button>
    </div>
  );
}

/**
 * Groups editor for checkbox_group fields.
 * Each group has a name and an options list.
 */
function GroupsEditor({ groups = [], onChange }) {
  function handleGroupNameChange(index, name) {
    const updated = groups.map((g, i) =>
      i === index ? { ...g, name } : g
    );
    onChange(updated);
  }

  function handleGroupOptionsChange(index, options) {
    const updated = groups.map((g, i) =>
      i === index ? { ...g, options } : g
    );
    onChange(updated);
  }

  function handleAddGroup() {
    const nextNum = groups.length + 1;
    onChange([
      ...groups,
      {
        name: `Group ${nextNum}`,
        options: [{ value: `opt_1`, label: "Option 1" }],
      },
    ]);
  }

  function handleRemoveGroup(index) {
    if (groups.length <= 1) return;
    onChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div
          key={gi}
          className={cn(
            "p-3 rounded-lg",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={group.name}
              onChange={(e) => handleGroupNameChange(gi, e.target.value)}
              placeholder="Group name"
              className={cn(
                "flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md",
                "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                "focus:outline-none focus:border-[var(--accent)]",
                "transition-colors duration-150"
              )}
            />
            <button
              type="button"
              onClick={() => handleRemoveGroup(gi)}
              disabled={groups.length <= 1}
              className={cn(
                "p-1 rounded-md shrink-0 transition-colors duration-150",
                "text-[var(--fg-muted)]",
                groups.length <= 1
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-rose-500/10 hover:text-rose-500"
              )}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
          <OptionsEditor
            options={group.options || []}
            onChange={(opts) => handleGroupOptionsChange(gi, opts)}
          />
        </div>
      ))}

      <Button
        variant="ghost"
        size="xs"
        icon={<Icon name="plus" size={12} />}
        onClick={handleAddGroup}
        className="w-full"
      >
        Add Group
      </Button>
    </div>
  );
}

/**
 * Conditional visibility editor
 */
function ConditionsEditor({ conditions = [], allFields = [], onChange }) {
  function handleConditionChange(index, key, val) {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, [key]: val } : c
    );
    onChange(updated);
  }

  function handleAddCondition() {
    onChange([
      ...conditions,
      { field: "", operator: "equals", value: "" },
    ]);
  }

  function handleRemoveCondition(index) {
    onChange(conditions.filter((_, i) => i !== index));
  }

  const operators = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "not_empty", label: "Not Empty" },
    { value: "is_empty", label: "Is Empty" },
  ];

  return (
    <div className="space-y-2">
      {conditions.map((cond, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Field selector */}
          <select
            value={cond.field}
            onChange={(e) => handleConditionChange(i, "field", e.target.value)}
            className={cn(
              "flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md appearance-none",
              "bg-[var(--bg-base)] border border-[var(--border-default)]",
              "text-[var(--fg-primary)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-colors duration-150"
            )}
          >
            <option value="">Select field...</option>
            {allFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label || f.id}
              </option>
            ))}
          </select>

          {/* Operator */}
          <select
            value={cond.operator}
            onChange={(e) =>
              handleConditionChange(i, "operator", e.target.value)
            }
            className={cn(
              "w-24 px-2 py-1.5 text-xs rounded-md appearance-none shrink-0",
              "bg-[var(--bg-base)] border border-[var(--border-default)]",
              "text-[var(--fg-primary)]",
              "focus:outline-none focus:border-[var(--accent)]",
              "transition-colors duration-150"
            )}
          >
            {operators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          {/* Value input */}
          {!["not_empty", "is_empty"].includes(cond.operator) && (
            <input
              type="text"
              value={cond.value}
              onChange={(e) =>
                handleConditionChange(i, "value", e.target.value)
              }
              placeholder="Value"
              className={cn(
                "flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-md",
                "bg-[var(--bg-base)] border border-[var(--border-default)]",
                "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                "focus:outline-none focus:border-[var(--accent)]",
                "transition-colors duration-150"
              )}
            />
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => handleRemoveCondition(i)}
            className={cn(
              "p-1 rounded-md shrink-0 transition-colors duration-150",
              "text-[var(--fg-muted)]",
              "hover:bg-rose-500/10 hover:text-rose-500"
            )}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}

      <Button
        variant="ghost"
        size="xs"
        icon={<Icon name="plus" size={12} />}
        onClick={handleAddCondition}
        className="w-full mt-1"
      >
        Add Condition
      </Button>
    </div>
  );
}

/**
 * Main properties panel
 */
export default function FieldPropertiesPanel({
  field,
  onChange,
  onClose,
  allFields = [],
}) {
  if (!field) return null;

  const isLayout = LAYOUT_TYPES.includes(field.type);

  function updateField(key, value) {
    onChange({ ...field, [key]: value });
  }

  function updateValidation(key, value) {
    const validation = { ...(field.validation || {}), [key]: value };
    onChange({ ...field, validation });
  }

  return (
    <div
      className={cn(
        "h-full flex flex-col overflow-hidden",
        "bg-[var(--bg-elevated)]",
        "border border-[var(--border-default)] rounded-2xl",
        "shadow-[var(--shadow-card)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-[var(--border-default)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Icon name="settings" size={15} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight leading-none">
              Field Properties
            </h3>
            <p className="text-[11px] text-[var(--fg-muted)] mt-1 capitalize truncate">
              {field.type.replace(/_/g, " ")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "p-1.5 rounded-lg",
            "text-[var(--fg-muted)]",
            "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]",
            "transition-all duration-150"
          )}
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Scrollable body — no visible scrollbar */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
        {/* Field ID (read-only) */}
        {!isLayout && (
          <div>
            <p className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-1">
              Field ID
            </p>
            <p className="text-xs text-[var(--fg-secondary)] font-mono bg-[var(--bg-base)] px-3 py-2 rounded-md border border-[var(--border-default)]">
              {field.id}
            </p>
          </div>
        )}

        {/* --- Layout-specific properties --- */}
        {field.type === "section_header" && (
          <>
            <Input
              label="Section Title"
              value={field.label || ""}
              onChange={(e) => updateField("label", e.target.value)}
              size="sm"
            />
            <Textarea
              label="Description"
              value={field.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              size="sm"
            />
          </>
        )}

        {field.type === "info_text" && (
          <>
            <Textarea
              label="Content"
              value={field.content || ""}
              onChange={(e) => updateField("content", e.target.value)}
              rows={4}
              size="sm"
            />
            <Select
              label="Variant"
              value={field.variant || "info"}
              onChange={(e) => updateField("variant", e.target.value)}
              size="sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </Select>
          </>
        )}

        {field.type === "divider" && (
          <p className="text-xs text-[var(--fg-muted)] italic">
            No configurable properties for dividers.
          </p>
        )}

        {field.type === "hidden" && (
          <Input
            label="Default Value"
            value={field.defaultValue || ""}
            onChange={(e) => updateField("defaultValue", e.target.value)}
            size="sm"
          />
        )}

        {/* --- Common properties (non-layout) --- */}
        {!isLayout && field.type !== "hidden" && (
          <>
            <Input
              label="Label"
              value={field.label || ""}
              onChange={(e) => updateField("label", e.target.value)}
              size="sm"
            />

            <Toggle
              label="Required"
              checked={!!field.required}
              onChange={(val) => updateField("required", val)}
            />

            <Select
              label="Width"
              value={field.width || "full"}
              onChange={(e) => updateField("width", e.target.value)}
              size="sm"
            >
              <option value="full">Full Width</option>
              <option value="half">Half Width</option>
              <option value="third">Third Width</option>
            </Select>

            <Input
              label="Help Text"
              value={field.helpText || ""}
              onChange={(e) => updateField("helpText", e.target.value)}
              placeholder="Optional help text for users"
              size="sm"
            />
          </>
        )}

        {/* --- Type-specific properties --- */}
        {field.type === "text" && (
          <>
            <SectionDivider label="Text Settings" />
            <Input
              label="Placeholder"
              value={field.placeholder || ""}
              onChange={(e) => updateField("placeholder", e.target.value)}
              size="sm"
            />
            <SectionDivider label="Validation" />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Min Length"
                type="number"
                value={field.validation?.minLength ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "minLength",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
              <Input
                label="Max Length"
                type="number"
                value={field.validation?.maxLength ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "maxLength",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
            </div>
            <Input
              label="Pattern (Regex)"
              value={field.validation?.pattern || ""}
              onChange={(e) => updateValidation("pattern", e.target.value)}
              placeholder="e.g. ^[A-Z].*"
              size="sm"
            />
          </>
        )}

        {(field.type === "textarea" || field.type === "richtext") && (
          <>
            <SectionDivider label="Text Area Settings" />
            <Input
              label="Placeholder"
              value={field.placeholder || ""}
              onChange={(e) => updateField("placeholder", e.target.value)}
              size="sm"
            />
            <Input
              label="Rows"
              type="number"
              value={field.rows ?? 4}
              onChange={(e) =>
                updateField("rows", Number(e.target.value) || 4)
              }
              size="sm"
            />
            <SectionDivider label="Validation" />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Min Length"
                type="number"
                value={field.validation?.minLength ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "minLength",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
              <Input
                label="Max Length"
                type="number"
                value={field.validation?.maxLength ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "maxLength",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
            </div>
          </>
        )}

        {field.type === "number" && (
          <>
            <SectionDivider label="Number Settings" />
            <Input
              label="Placeholder"
              value={field.placeholder || ""}
              onChange={(e) => updateField("placeholder", e.target.value)}
              size="sm"
            />
            <SectionDivider label="Validation" />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Min"
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "min",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
              <Input
                label="Max"
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "max",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                size="sm"
              />
            </div>
            <Input
              label="Step"
              type="number"
              value={field.validation?.step ?? ""}
              onChange={(e) =>
                updateValidation(
                  "step",
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              size="sm"
            />
          </>
        )}

        {(field.type === "select" || field.type === "radio") && (
          <>
            <SectionDivider label="Options" />
            <OptionsEditor
              options={field.options || []}
              onChange={(opts) => updateField("options", opts)}
            />
          </>
        )}

        {field.type === "multiselect" && (
          <>
            <SectionDivider label="Options" />
            <OptionsEditor
              options={field.options || []}
              onChange={(opts) => updateField("options", opts)}
            />
          </>
        )}

        {field.type === "checkbox_group" && (
          <>
            <SectionDivider label="Groups" />
            <GroupsEditor
              groups={field.groups || []}
              onChange={(groups) => updateField("groups", groups)}
            />
          </>
        )}

        {field.type === "daterange" && (
          <>
            <SectionDivider label="Date Range Labels" />
            <Input
              label="Start Label"
              value={field.startLabel || ""}
              onChange={(e) => updateField("startLabel", e.target.value)}
              placeholder="Start Date"
              size="sm"
            />
            <Input
              label="End Label"
              value={field.endLabel || ""}
              onChange={(e) => updateField("endLabel", e.target.value)}
              placeholder="End Date"
              size="sm"
            />
          </>
        )}

        {field.type === "file_upload" && (
          <>
            <SectionDivider label="Upload Settings" />
            <Input
              label="Accepted File Types"
              value={field.accept || ""}
              onChange={(e) => updateField("accept", e.target.value)}
              placeholder=".pdf,.doc,.jpg,.png"
              size="sm"
            />
            <Input
              label="Max File Size (MB)"
              type="number"
              value={field.maxSize ?? ""}
              onChange={(e) =>
                updateField(
                  "maxSize",
                  e.target.value ? Number(e.target.value) : undefined
                )
              }
              size="sm"
            />
            <Toggle
              label="Allow Multiple Files"
              checked={!!field.multiple}
              onChange={(val) => updateField("multiple", val)}
            />
          </>
        )}

        {/* --- Conditional visibility (non-layout only) --- */}
        {!isLayout && (
          <>
            <SectionDivider label="Conditional Visibility" />
            <ConditionsEditor
              conditions={field.conditions || []}
              allFields={allFields.filter(
                (f) => f.id !== field.id && !LAYOUT_TYPES.includes(f.type)
              )}
              onChange={(conditions) => updateField("conditions", conditions)}
            />
          </>
        )}
      </div>
    </div>
  );
}
