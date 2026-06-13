/**
 * Input Component
 * Linear/Modern Design System
 *
 * Features:
 * - Dark elevated background
 * - Subtle border with accent focus
 * - Accent glow ring on focus
 * - Icon support (left/right)
 * - Error state styling
 */

import Icon from "./Icon";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function Input({
  className,
  error,
  label,
  helperText,
  icon,
  iconPosition = "left",
  size = "md",
  ...props
}) {
  const hasError = !!error;

  const sizeStyles = {
    sm: "px-3 py-2 text-sm min-h-[36px]",
    md: "px-4 py-2.5 text-sm min-h-[40px]",
    lg: "px-4 py-3 text-base min-h-[48px]",
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && iconPosition === "left" && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
            {typeof icon === "string" ? <Icon name={icon} size={18} /> : icon}
          </div>
        )}
        <input
          className={cn(
            // Base styles
            "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
            "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
            "placeholder:text-[var(--fg-muted)]",
            // Size
            sizeStyles[size],
            // Focus state
            "focus:outline-none focus:border-[var(--accent)]",
            "focus:ring-2 focus:ring-[var(--accent)]/20",
            // Transition
            "transition-all duration-200",
            // Error state
            hasError && "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/20",
            // Icon padding
            icon && iconPosition === "left" && "pl-10",
            icon && iconPosition === "right" && "pr-10",
            // Disabled
            props.disabled && "opacity-50 cursor-not-allowed bg-[var(--bg-surface)]",
            className
          )}
          {...props}
        />
        {icon && iconPosition === "right" && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
            {typeof icon === "string" ? <Icon name={icon} size={18} /> : icon}
          </div>
        )}
      </div>
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1.5 text-sm",
            hasError ? "text-[var(--error)]" : "text-[var(--fg-secondary)]"
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

/**
 * Textarea Component
 */
export function Textarea({
  className,
  error,
  label,
  helperText,
  rows = 4,
  size = "md",
  ...props
}) {
  const hasError = !!error;

  const sizeStyles = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-3 text-sm",
    lg: "px-4 py-3.5 text-base",
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={cn(
          // Base styles
          "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
          "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
          "placeholder:text-[var(--fg-muted)]",
          "resize-none",
          // Size
          sizeStyles[size],
          // Focus state
          "focus:outline-none focus:border-[var(--accent)]",
          "focus:ring-2 focus:ring-[var(--accent)]/20",
          // Transition
          "transition-all duration-200",
          // Error state
          hasError && "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/20",
          // Disabled
          props.disabled && "opacity-50 cursor-not-allowed bg-[var(--bg-surface)]",
          className
        )}
        {...props}
      />
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1.5 text-sm",
            hasError ? "text-[var(--error)]" : "text-[var(--fg-secondary)]"
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

/**
 * Select Component
 */
export function Select({
  className,
  error,
  label,
  helperText,
  children,
  size = "md",
  ...props
}) {
  const hasError = !!error;

  const sizeStyles = {
    sm: "px-3 py-2 text-sm min-h-[36px]",
    md: "px-4 py-2.5 text-sm min-h-[40px]",
    lg: "px-4 py-3 text-base min-h-[48px]",
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          className={cn(
            // Base styles
            "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
            "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
            "appearance-none cursor-pointer",
            // Size
            sizeStyles[size],
            "pr-10",
            // Focus state
            "focus:outline-none focus:border-[var(--accent)]",
            "focus:ring-2 focus:ring-[var(--accent)]/20",
            // Transition
            "transition-all duration-200",
            // Error state
            hasError && "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/20",
            // Disabled
            props.disabled && "opacity-50 cursor-not-allowed bg-[var(--bg-surface)]",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {/* Chevron icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--fg-muted)]">
          <Icon name="chevronDown" size={18} />
        </div>
      </div>
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1.5 text-sm",
            hasError ? "text-[var(--error)]" : "text-[var(--fg-secondary)]"
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

/**
 * Searchable Select Component - For large lists like managers/users
 */
import { useState, useRef, useEffect } from "react";

export function SearchableSelect({
  className,
  error,
  label,
  helperText,
  options = [], // Array of { value, label, subtitle? }
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No options found",
  size = "md",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const hasError = !!error;

  const sizeStyles = {
    sm: "px-3 py-2 text-sm min-h-[36px]",
    md: "px-4 py-2.5 text-sm min-h-[40px]",
    lg: "px-4 py-3 text-base min-h-[48px]",
  };

  // Find selected option
  const selectedOption = options.find(opt => String(opt.value) === String(value));

  // Filter options based on search
  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    (opt.subtitle && opt.subtitle.toLowerCase().includes(search.toLowerCase()))
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  function handleSelect(optionValue) {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
    setSearch("");
  }

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={cn(
            "w-full text-left bg-[var(--bg-elevated)] rounded-lg",
            "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
            sizeStyles[size],
            "pr-10",
            "focus:outline-none focus:border-[var(--accent)]",
            "focus:ring-2 focus:ring-[var(--accent)]/20",
            "transition-all duration-200",
            hasError && "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]/20",
            disabled && "opacity-50 cursor-not-allowed bg-[var(--bg-surface)]",
            !disabled && "cursor-pointer",
            className
          )}
          disabled={disabled}
        >
          {selectedOption ? (
            <span className="text-[var(--fg-primary)]">{selectedOption.label}</span>
          ) : (
            <span className="text-[var(--fg-muted)]">{placeholder}</span>
          )}
        </button>

        {/* Chevron icon */}
        <div className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--fg-muted)]",
          "transition-transform duration-200",
          isOpen && "rotate-180"
        )}>
          <Icon name="chevronDown" size={18} />
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className={cn(
            "absolute z-50 w-full mt-1.5",
            "bg-[var(--bg-elevated)] rounded-lg",
            "border border-[var(--border-default)]",
            "shadow-[var(--shadow-elevated)]",
            "overflow-hidden animate-slide-down"
          )}>
            {/* Search Input */}
            <div className="p-2 border-b border-[var(--border-default)]">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
                  <Icon name="search" size={16} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={cn(
                    "w-full pl-9 pr-3 py-2 text-sm",
                    "bg-[var(--bg-base)] text-[var(--fg-primary)] rounded-md",
                    "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                    "placeholder:text-[var(--fg-muted)]",
                    "focus:outline-none focus:border-[var(--accent)]",
                    "transition-all duration-200"
                  )}
                />
              </div>
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--fg-muted)] text-center">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full text-left px-4 py-2.5",
                      "hover:bg-[var(--bg-base)] transition-colors",
                      String(opt.value) === String(value) && "bg-[var(--accent)]/10"
                    )}
                  >
                    <div className="text-sm text-[var(--fg-primary)]">{opt.label}</div>
                    {opt.subtitle && (
                      <div className="text-xs text-[var(--fg-muted)]">{opt.subtitle}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1.5 text-sm",
            hasError ? "text-[var(--error)]" : "text-[var(--fg-secondary)]"
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
}

/**
 * Search Input - Specialized for search functionality
 */
export function SearchInput({
  className,
  placeholder = "Search...",
  size = "md",
  ...props
}) {
  const sizeStyles = {
    sm: "pl-9 pr-3 py-2 text-sm min-h-[36px]",
    md: "pl-10 pr-4 py-2.5 text-sm min-h-[40px]",
    lg: "pl-11 pr-4 py-3 text-base min-h-[48px]",
  };

  const iconSizes = {
    sm: 16,
    md: 18,
    lg: 20,
  };

  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
        <Icon name="search" size={iconSizes[size]} />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        className={cn(
          // Base styles
          "w-full bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
          "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
          "placeholder:text-[var(--fg-muted)]",
          // Size
          sizeStyles[size],
          // Focus state
          "focus:outline-none focus:border-[var(--accent)]",
          "focus:ring-2 focus:ring-[var(--accent)]/20",
          // Transition
          "transition-all duration-200",
          className
        )}
        {...props}
      />
    </div>
  );
}
