/**
 * FieldToolbox Component
 * Left panel with draggable field type buttons organized by category.
 *
 * Used in the template form builder to add new fields to the canvas.
 */

import Icon from "../ui/Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const FIELD_CATEGORIES = [
  {
    label: "Layout",
    types: [
      { type: "section_header", label: "Section Header", icon: "hash" },
      { type: "info_text", label: "Info Text", icon: "info" },
      { type: "divider", label: "Divider", icon: "list" },
    ],
  },
  {
    label: "Input",
    types: [
      { type: "text", label: "Text Input", icon: "pencil" },
      { type: "textarea", label: "Text Area", icon: "fileText" },
      { type: "richtext", label: "Rich Text", icon: "fileText" },
      { type: "number", label: "Number", icon: "hash" },
    ],
  },
  {
    label: "Choice",
    types: [
      { type: "select", label: "Dropdown", icon: "chevronDown" },
      { type: "multiselect", label: "Multi-Select", icon: "check" },
      { type: "checkbox_group", label: "Checkbox Group", icon: "checkCircle" },
      { type: "radio", label: "Radio Buttons", icon: "activity" },
    ],
  },
  {
    label: "Date & Time",
    types: [
      { type: "date", label: "Date Picker", icon: "calendar" },
      { type: "daterange", label: "Date Range", icon: "calendar" },
    ],
  },
  {
    label: "Advanced",
    types: [
      { type: "file_upload", label: "File Upload", icon: "upload" },
      { type: "user_lookup", label: "User Lookup", icon: "userPlus" },
      { type: "hidden", label: "Hidden Field", icon: "eye" },
    ],
  },
];

export default function FieldToolbox({ onAddField }) {
  return (
    <div
      className={cn(
        "h-full flex flex-col overflow-hidden",
        "bg-[var(--bg-elevated)]",
        "border border-[var(--border-default)] rounded-xl",
        "shadow-[0_0_0_1px_var(--border-default),0_2px_8px_rgba(0,0,0,0.3)]"
      )}
    >
      {/* Header — pinned */}
      <div className="px-4 py-3.5 border-b border-[var(--border-default)] shrink-0">
        <h3 className="text-sm font-semibold text-[var(--fg-primary)] tracking-tight">
          Field Toolbox
        </h3>
        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
          Drag or click to add
        </p>
      </div>

      {/* Categories — scrollable, no visible scrollbar */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-4">
        {FIELD_CATEGORIES.map((category) => (
          <div key={category.label}>
            <h4 className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2 px-1">
              {category.label}
            </h4>
            <div className="space-y-1">
              {category.types.map((field) => (
                <button
                  key={field.type}
                  type="button"
                  onClick={() => onAddField(field.type)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("fieldType", field.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
                    "text-sm text-[var(--fg-secondary)]",
                    "bg-[var(--bg-surface)]",
                    "border border-[var(--border-default)]",
                    "hover:bg-[var(--bg-surface-hover)] hover:text-[var(--fg-primary)]",
                    "hover:border-[var(--border-hover)]",
                    "active:scale-[0.98]",
                    "transition-all duration-150",
                    "cursor-grab active:cursor-grabbing",
                    "group"
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                      "bg-[var(--bg-base)] border border-[var(--border-default)]",
                      "text-[var(--fg-muted)] group-hover:text-[var(--accent)]",
                      "transition-colors duration-150"
                    )}
                  >
                    <Icon name={field.icon} size={14} />
                  </div>
                  <span className="text-left text-xs font-medium truncate">
                    {field.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { FIELD_CATEGORIES };
