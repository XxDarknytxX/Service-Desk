/**
 * TemplateFormBuilder Component
 * Main form builder combining Toolbox + Canvas + Properties Panel.
 *
 * Provides a 3-column layout for visually designing ticket template forms
 * with drag-and-drop field management, inline property editing,
 * and a live preview mode that shows how the form will look to end users.
 */

import { useState, useCallback } from "react";
import FieldToolbox from "./FieldToolbox";
import FieldPreview from "./FieldPreview";
import FieldPropertiesPanel from "./FieldPropertiesPanel";
import TemplateRenderer from "./TemplateRenderer";
import Icon from "../ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Default properties for each field type when newly added.
 */
const FIELD_DEFAULTS = {
  text: {
    label: "Text Field",
    placeholder: "",
    required: false,
    width: "full",
  },
  textarea: {
    label: "Text Area",
    placeholder: "",
    required: false,
    width: "full",
    rows: 4,
  },
  richtext: {
    label: "Rich Text",
    required: false,
    width: "full",
  },
  number: {
    label: "Number",
    required: false,
    width: "half",
  },
  select: {
    label: "Dropdown",
    required: false,
    width: "half",
    options: [{ value: "option_1", label: "Option 1" }],
  },
  multiselect: {
    label: "Multi-Select",
    required: false,
    width: "half",
    options: [{ value: "option_1", label: "Option 1" }],
  },
  checkbox_group: {
    label: "Checkbox Group",
    required: false,
    width: "full",
    groups: [
      {
        name: "Group 1",
        options: [{ value: "opt_1", label: "Option 1" }],
      },
    ],
  },
  radio: {
    label: "Radio Buttons",
    required: false,
    width: "full",
    options: [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ],
  },
  date: {
    label: "Date",
    required: false,
    width: "half",
  },
  daterange: {
    label: "Date Range",
    required: false,
    width: "full",
    startLabel: "Start Date",
    endLabel: "End Date",
  },
  file_upload: {
    label: "File Upload",
    required: false,
    width: "full",
    accept: ".pdf,.doc,.docx,.jpg,.png",
    multiple: false,
  },
  user_lookup: {
    label: "User Lookup",
    required: false,
    width: "half",
  },
  section_header: {
    label: "Section Title",
    description: "",
  },
  info_text: {
    content: "Information text goes here.",
    variant: "info",
  },
  divider: {},
  hidden: {
    defaultValue: "",
  },
};

/**
 * Generate a unique field ID
 */
function generateFieldId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

export default function TemplateFormBuilder({ schema = [], onChange }) {
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState({});

  // Find the currently selected field
  const selectedField = schema.find((f) => f.id === selectedFieldId) || null;

  /**
   * Add a new field of the given type to the end of the schema.
   */
  const addField = useCallback(
    (type) => {
      const defaults = FIELD_DEFAULTS[type] || {};
      const newField = {
        id: `field_${generateFieldId()}`,
        type,
        ...defaults,
      };
      const updated = [...schema, newField];
      onChange(updated);
      setSelectedFieldId(newField.id);
    },
    [schema, onChange]
  );

  /**
   * Remove a field from the schema by ID.
   */
  const removeField = useCallback(
    (id) => {
      const updated = schema.filter((f) => f.id !== id);
      onChange(updated);
      if (selectedFieldId === id) {
        setSelectedFieldId(null);
      }
    },
    [schema, onChange, selectedFieldId]
  );

  /**
   * Move a field up or down in the array.
   */
  const moveField = useCallback(
    (id, direction) => {
      const index = schema.findIndex((f) => f.id === id);
      if (index === -1) return;

      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= schema.length) return;

      const updated = [...schema];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      onChange(updated);
    },
    [schema, onChange]
  );

  /**
   * Update a field's properties.
   */
  const updateField = useCallback(
    (updatedField) => {
      const updated = schema.map((f) =>
        f.id === updatedField.id ? updatedField : f
      );
      onChange(updated);
    },
    [schema, onChange]
  );

  /**
   * Handle drop events on the canvas.
   */
  function handleCanvasDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const fieldType = e.dataTransfer.getData("fieldType");
    if (fieldType) {
      addField(fieldType);
    }
  }

  function handleCanvasDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleCanvasDragLeave(e) {
    // Only set false when actually leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }

  // ── Preview Mode ──────────────────────────────────────────────────────
  if (showPreview) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Preview toolbar */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Live Preview</span>
            </div>
            <span className="text-xs text-[var(--fg-muted)]">
              This is how the form will appear to users when creating a ticket
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              "bg-[var(--bg-surface)] border border-[var(--border-default)]",
              "text-[var(--fg-primary)]",
              "hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-hover)]",
              "transition-all duration-150"
            )}
          >
            <Icon name="pencil" size={14} />
            Back to Builder
          </button>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-y-auto scrollbar-none min-h-0">
          <div
            className={cn(
              "max-w-3xl mx-auto p-6 rounded-2xl",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]",
              "shadow-[var(--shadow-card)]"
            )}
          >
            {schema.length === 0 ? (
              <div className="text-center py-12">
                <Icon name="eye" size={32} className="text-[var(--fg-muted)] mx-auto mb-3" />
                <p className="text-sm text-[var(--fg-muted)]">
                  No fields to preview. Add fields in the builder first.
                </p>
              </div>
            ) : (
              <TemplateRenderer
                schema={schema}
                values={previewValues}
                onChange={(id, val) =>
                  setPreviewValues((prev) => ({ ...prev, [id]: val }))
                }
                errors={{}}
                readOnly={false}
                preview={false}
                users={[]}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Builder Mode ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar with preview toggle */}
      <div className="flex items-center justify-end mb-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            setPreviewValues({});
            setShowPreview(true);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
            "bg-[var(--accent)]/10 border border-[var(--accent)]/25",
            "text-[var(--accent)]",
            "hover:bg-[var(--accent)]/20 hover:border-[var(--accent)]/40",
            "transition-all duration-150"
          )}
        >
          <Icon name="eye" size={14} />
          Preview Form
        </button>
      </div>

      {/* 3-column builder layout — fills all remaining space */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Field Toolbox — fills height, internal scroll handled by FieldToolbox itself */}
        <div className="w-56 shrink-0">
          <FieldToolbox onAddField={addField} />
        </div>

        {/* Center: Canvas — independent scroll, no visible scrollbar */}
        <div
          className="flex-1 flex flex-col min-w-0"
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
        >
          <div
            className={cn(
              "flex-1 overflow-y-auto scrollbar-none rounded-xl p-4",
              "bg-[var(--bg-base)]",
              "border-2 border-dashed",
              isDragOver
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border-default)]",
              "shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]",
              "transition-all duration-200"
            )}
          >
            {schema.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full py-16 pointer-events-none">
                <div
                  className={cn(
                    "w-16 h-16 rounded-xl flex items-center justify-center mb-4",
                    "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
                    isDragOver && "border-[var(--accent)] bg-[var(--accent)]/10"
                  )}
                >
                  <Icon
                    name={isDragOver ? "download" : "plus"}
                    size={28}
                    className={isDragOver ? "text-[var(--accent)] animate-bounce" : "text-[var(--fg-muted)]"}
                  />
                </div>
                <p className="text-sm font-medium text-[var(--fg-secondary)] mb-1">
                  {isDragOver ? "Drop field here" : "No fields yet"}
                </p>
                <p className="text-xs text-[var(--fg-muted)] text-center max-w-xs">
                  Drag fields from the toolbox or click to add them to your form.
                </p>
              </div>
            ) : (
              /* Field list */
              <div className="space-y-3">
                {schema.map((field, index) => (
                  <FieldPreview
                    key={field.id}
                    field={field}
                    isSelected={selectedFieldId === field.id}
                    onSelect={setSelectedFieldId}
                    onRemove={removeField}
                    onMoveUp={(id) => moveField(id, -1)}
                    onMoveDown={(id) => moveField(id, 1)}
                    isFirst={index === 0}
                    isLast={index === schema.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Properties Panel — independent scroll, no visible scrollbar */}
        {selectedField && (
          <div className="w-72 shrink-0 overflow-hidden">
            <FieldPropertiesPanel
              field={selectedField}
              onChange={updateField}
              onClose={() => setSelectedFieldId(null)}
              allFields={schema}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export { FIELD_DEFAULTS };
