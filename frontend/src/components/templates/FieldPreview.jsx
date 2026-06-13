/**
 * FieldPreview Component
 * Renders a visual preview of a form field in the builder canvas.
 *
 * Shows a non-interactive representation of each field type with
 * selection highlight, reorder controls, and delete button.
 */

import Icon from "../ui/Icon";
import Badge from "../ui/Badge";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const WIDTH_LABELS = {
  full: "Full",
  half: "Half",
  third: "Third",
};

const WIDTH_BADGE_TONES = {
  full: "slate",
  half: "blue",
  third: "violet",
};

/**
 * Ghost input - a non-interactive placeholder input
 */
function GhostInput({ placeholder = "Enter text...", type = "text" }) {
  return (
    <div
      className={cn(
        "w-full px-3 py-2 rounded-lg text-sm",
        "bg-[var(--bg-base)] border border-[var(--border-default)]",
        "text-[var(--fg-muted)]"
      )}
    >
      {placeholder}
    </div>
  );
}

/**
 * Ghost textarea - a non-interactive placeholder textarea
 */
function GhostTextarea({ placeholder = "Enter text...", rows = 3 }) {
  return (
    <div
      className={cn(
        "w-full px-3 py-2 rounded-lg text-sm",
        "bg-[var(--bg-base)] border border-[var(--border-default)]",
        "text-[var(--fg-muted)]"
      )}
      style={{ minHeight: `${rows * 1.5}rem` }}
    >
      {placeholder}
    </div>
  );
}

/**
 * Ghost select dropdown
 */
function GhostSelect({ placeholder = "Select an option..." }) {
  return (
    <div
      className={cn(
        "w-full px-3 py-2 rounded-lg text-sm",
        "bg-[var(--bg-base)] border border-[var(--border-default)]",
        "text-[var(--fg-muted)]",
        "flex items-center justify-between"
      )}
    >
      <span>{placeholder}</span>
      <Icon name="chevronDown" size={14} className="text-[var(--fg-muted)]" />
    </div>
  );
}

/**
 * Ghost checkboxes
 */
function GhostCheckboxes({ options = [] }) {
  const displayOptions =
    options.length > 0
      ? options.slice(0, 3)
      : [
          { label: "Option 1" },
          { label: "Option 2" },
          { label: "Option 3" },
        ];

  return (
    <div className="space-y-2">
      {displayOptions.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "w-4 h-4 rounded border border-[var(--border-default)]",
              "bg-[var(--bg-base)]"
            )}
          />
          <span className="text-sm text-[var(--fg-secondary)]">
            {opt.label}
          </span>
        </div>
      ))}
      {options.length > 3 && (
        <span className="text-xs text-[var(--fg-muted)]">
          +{options.length - 3} more
        </span>
      )}
    </div>
  );
}

/**
 * Ghost radio buttons
 */
function GhostRadios({ options = [] }) {
  const displayOptions =
    options.length > 0
      ? options.slice(0, 3)
      : [{ label: "Option 1" }, { label: "Option 2" }];

  return (
    <div className="space-y-2">
      {displayOptions.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "w-4 h-4 rounded-full border border-[var(--border-default)]",
              "bg-[var(--bg-base)]"
            )}
          />
          <span className="text-sm text-[var(--fg-secondary)]">
            {opt.label}
          </span>
        </div>
      ))}
      {options.length > 3 && (
        <span className="text-xs text-[var(--fg-muted)]">
          +{options.length - 3} more
        </span>
      )}
    </div>
  );
}

/**
 * Ghost file upload zone
 */
function GhostFileUpload({ accept, multiple }) {
  return (
    <div
      className={cn(
        "w-full py-6 rounded-lg text-center",
        "bg-[var(--bg-base)] border-2 border-dashed border-[var(--border-default)]"
      )}
    >
      <Icon
        name="upload"
        size={24}
        className="text-[var(--fg-muted)] mx-auto mb-2"
      />
      <p className="text-xs text-[var(--fg-muted)]">
        {multiple ? "Drop files here or click to upload" : "Drop file here or click to upload"}
      </p>
      {accept && (
        <p className="text-[10px] text-[var(--fg-muted)] mt-1">{accept}</p>
      )}
    </div>
  );
}

/**
 * Ghost user lookup input
 */
function GhostUserLookup() {
  return (
    <div
      className={cn(
        "w-full px-3 py-2 rounded-lg text-sm",
        "bg-[var(--bg-base)] border border-[var(--border-default)]",
        "text-[var(--fg-muted)]",
        "flex items-center gap-2"
      )}
    >
      <Icon name="search" size={14} className="text-[var(--fg-muted)]" />
      <span>Search for user...</span>
    </div>
  );
}

/**
 * Ghost date input
 */
function GhostDateInput({ label }) {
  return (
    <div
      className={cn(
        "w-full px-3 py-2 rounded-lg text-sm",
        "bg-[var(--bg-base)] border border-[var(--border-default)]",
        "text-[var(--fg-muted)]",
        "flex items-center justify-between"
      )}
    >
      <span>{label || "Select date..."}</span>
      <Icon name="calendar" size={14} className="text-[var(--fg-muted)]" />
    </div>
  );
}

/**
 * Renders field label with optional required indicator
 */
function FieldLabel({ label, required }) {
  return (
    <div className="mb-2">
      <span className="text-sm font-medium text-[var(--fg-primary)]">
        {label}
      </span>
      {required && <span className="text-[var(--error)] ml-1">*</span>}
    </div>
  );
}

/**
 * Renders the field content preview based on type
 */
function FieldContent({ field }) {
  switch (field.type) {
    case "text":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostInput placeholder={field.placeholder || "Enter text..."} />
        </>
      );

    case "textarea":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostTextarea
            placeholder={field.placeholder || "Enter text..."}
            rows={field.rows || 3}
          />
        </>
      );

    case "richtext":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostTextarea placeholder="Rich text editor..." rows={4} />
        </>
      );

    case "number":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostInput placeholder={field.placeholder || "0"} type="number" />
        </>
      );

    case "select":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostSelect placeholder="Select an option..." />
        </>
      );

    case "multiselect":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostCheckboxes options={field.options || []} />
        </>
      );

    case "checkbox_group":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          {(field.groups || []).map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {field.groups.length > 1 && (
                <p className="text-xs font-medium text-[var(--fg-secondary)] mb-1.5">
                  {group.name}
                </p>
              )}
              <GhostCheckboxes options={group.options || []} />
            </div>
          ))}
        </>
      );

    case "radio":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostRadios options={field.options || []} />
        </>
      );

    case "date":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostDateInput />
        </>
      );

    case "daterange":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-xs text-[var(--fg-muted)] mb-1">
                {field.startLabel || "Start Date"}
              </p>
              <GhostDateInput />
            </div>
            <div className="flex-1">
              <p className="text-xs text-[var(--fg-muted)] mb-1">
                {field.endLabel || "End Date"}
              </p>
              <GhostDateInput />
            </div>
          </div>
        </>
      );

    case "file_upload":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostFileUpload accept={field.accept} multiple={field.multiple} />
        </>
      );

    case "user_lookup":
      return (
        <>
          <FieldLabel label={field.label} required={field.required} />
          <GhostUserLookup />
        </>
      );

    case "section_header":
      return (
        <div>
          <h3 className="text-base font-semibold text-[var(--fg-primary)] tracking-tight">
            {field.label || "Section Title"}
          </h3>
          {field.description && (
            <p className="text-sm text-[var(--fg-secondary)] mt-1">
              {field.description}
            </p>
          )}
        </div>
      );

    case "info_text": {
      const variantStyles = {
        info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        warning: "bg-amber-500/10 border-amber-500/20 text-amber-400",
        success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      };
      const variantIcons = {
        info: "info",
        warning: "alert",
        success: "checkCircle",
      };
      const variant = field.variant || "info";

      return (
        <div
          className={cn(
            "px-4 py-3 rounded-lg border text-sm",
            variantStyles[variant] || variantStyles.info
          )}
        >
          <div className="flex items-start gap-2">
            <Icon
              name={variantIcons[variant] || "info"}
              size={16}
              className="shrink-0 mt-0.5"
            />
            <span>{field.content || "Information text goes here."}</span>
          </div>
        </div>
      );
    }

    case "divider":
      return (
        <div className="py-2">
          <hr className="border-[var(--border-default)]" />
        </div>
      );

    case "hidden":
      return (
        <div className="flex items-center gap-2 py-1">
          <Icon name="eye" size={14} className="text-[var(--fg-muted)]" />
          <span className="text-xs text-[var(--fg-muted)] italic">
            Hidden: {field.defaultValue || "(no default value)"}
          </span>
        </div>
      );

    default:
      return (
        <p className="text-sm text-[var(--fg-muted)]">
          Unknown field type: {field.type}
        </p>
      );
  }
}

export default function FieldPreview({
  field,
  isSelected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const isLayout = ["section_header", "info_text", "divider"].includes(
    field.type
  );
  const widthKey = field.width || "full";

  return (
    <div
      onClick={() => onSelect(field.id)}
      className={cn(
        "relative group rounded-xl p-4 cursor-pointer",
        "border transition-all duration-200",
        "bg-[var(--bg-elevated)]",
        // Selected state
        isSelected
          ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent),0_0_12px_rgba(230,0,0,0.15)]"
          : "border-[var(--border-default)] hover:border-[var(--border-hover)]",
        // Hover shadow
        !isSelected && "hover:shadow-[var(--shadow-card)]"
      )}
    >
      {/* Top-right controls */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        )}
      >
        {/* Width badge (only for non-layout fields) */}
        {!isLayout && widthKey && (
          <Badge
            tone={WIDTH_BADGE_TONES[widthKey] || "slate"}
            size="sm"
            className="mr-1"
          >
            {WIDTH_LABELS[widthKey] || widthKey}
          </Badge>
        )}

        {/* Move up */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp(field.id);
          }}
          disabled={isFirst}
          className={cn(
            "p-1 rounded-md transition-all duration-150",
            "text-[var(--fg-muted)]",
            isFirst
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
          )}
          title="Move up"
        >
          <Icon name="chevron-up" size={14} />
        </button>

        {/* Move down */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown(field.id);
          }}
          disabled={isLast}
          className={cn(
            "p-1 rounded-md transition-all duration-150",
            "text-[var(--fg-muted)]",
            isLast
              ? "opacity-30 cursor-not-allowed"
              : "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
          )}
          title="Move down"
        >
          <Icon name="chevron-down" size={14} />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(field.id);
          }}
          className={cn(
            "p-1 rounded-md transition-all duration-150",
            "text-[var(--fg-muted)]",
            "hover:bg-rose-500/10 hover:text-rose-500"
          )}
          title="Remove field"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {/* Field content */}
      <FieldContent field={field} />

      {/* Help text */}
      {field.helpText && (
        <p className="text-xs text-[var(--fg-muted)] mt-2">{field.helpText}</p>
      )}
    </div>
  );
}
