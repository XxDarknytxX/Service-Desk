/**
 * Template Gallery Component
 * A categorized template browser for end-users to pick a template when creating a ticket.
 *
 * Props:
 * - onSelectTemplate(template) - called when user clicks a template card
 * - onBack - go back to mode selection
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { templatesApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Icon from "../ui/Icon";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const categoryTints = ["violet", "blue", "cyan", "teal", "indigo", "emerald", "amber", "rose"];

const iconMap = {
  lock: "lock",
  shield: "shield",
  clipboard: "clipboard",
  fileText: "fileText",
  settings: "settings",
  users: "users",
  check: "check",
  alert: "alert",
  info: "info",
  mail: "mail",
  phone: "phone",
  hash: "hash",
};

export default function TemplateGallery({ onSelectTemplate, onBack }) {
  const toast = useToast();
  const [gallery, setGallery] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loadingTemplateId, setLoadingTemplateId] = useState(null);
  const [error, setError] = useState(null);
  const categoryScrollRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const loadGallery = useCallback(async (searchTerm = "") => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const data = await templatesApi.getGallery(params);
      setGallery(data.gallery || []);
    } catch (err) {
      console.error("Failed to load template gallery:", err);
      setError("Failed to load templates. Please try again.");
      setGallery([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  function handleSearchChange(e) {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      loadGallery(value);
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  async function handleSelectTemplate(template) {
    try {
      setLoadingTemplateId(template.id);
      const fullTemplate = await templatesApi.getTemplate(template.id);
      onSelectTemplate(fullTemplate.template || fullTemplate);
    } catch (err) {
      console.error("Failed to load template:", err);
      toast.error("Failed to load template details. Please try again.");
    } finally {
      setLoadingTemplateId(null);
    }
  }

  // Build category list from gallery data
  const categories = [
    { id: "all", name: "All" },
    ...gallery.map((cat) => ({ id: cat.id, name: cat.name })),
  ];

  // Filter templates based on selected category
  const filteredTemplates =
    selectedCategory === "all"
      ? gallery.flatMap((cat) =>
          (cat.templates || []).map((t) => ({ ...t, categoryName: cat.name, categoryIcon: cat.icon }))
        )
      : gallery
          .filter((cat) => cat.id === selectedCategory)
          .flatMap((cat) =>
            (cat.templates || []).map((t) => ({ ...t, categoryName: cat.name, categoryIcon: cat.icon }))
          );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className={cn(
              "p-2 rounded-lg",
              "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]",
              "hover:bg-[var(--bg-surface)]",
              "transition-all duration-150"
            )}
          >
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <div>
          <h2 className="text-lg font-semibold text-[var(--fg-primary)] tracking-tight">
            Choose a Template
          </h2>
          <p className="text-sm text-[var(--fg-secondary)]">
            Select a template to pre-fill your ticket with the right fields
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none">
          <Icon name="search" size={18} />
        </div>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search templates..."
          className={cn(
            "w-full pl-10 pr-4 py-2.5 text-sm",
            "bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-lg",
            "border border-[var(--border-default)]",
            "placeholder:text-[var(--fg-muted)]",
            "focus:outline-none focus:border-[var(--accent)]",
            "focus:ring-2 focus:ring-[var(--accent)]/20",
            "transition-all duration-200"
          )}
        />
      </div>

      {/* Category Pills */}
      {!loading && gallery.length > 0 && (
        <div
          ref={categoryScrollRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {categories.map((cat, idx) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium",
                  "transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                    : cn(
                        "bg-[var(--bg-surface)] text-[var(--fg-secondary)]",
                        "border border-[var(--border-default)]",
                        "hover:bg-[var(--bg-surface-hover)] hover:text-[var(--fg-primary)]",
                        "hover:border-[var(--border-hover)]"
                      )
                )}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3" />
            <p className="text-sm text-[var(--fg-secondary)]">Loading templates...</p>
          </div>
        </div>
      ) : error ? (
        <div className={cn(
          "text-center py-16 rounded-xl",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]"
        )}>
          <div className={cn(
            "inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4",
            "bg-red-500/10 border border-red-500/20"
          )}>
            <Icon name="alert" size={28} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">Something went wrong</p>
          <p className="text-sm text-[var(--fg-secondary)] mb-4">{error}</p>
          <Button variant="secondary" onClick={() => loadGallery(search)} icon={<Icon name="refresh" size={16} />}>
            Retry
          </Button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className={cn(
          "text-center py-16 rounded-xl",
          "bg-[var(--bg-elevated)]",
          "border border-[var(--border-default)]"
        )}>
          <div className={cn(
            "inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4",
            "bg-[var(--bg-base)] border border-[var(--border-default)]"
          )}>
            <Icon name="fileText" size={28} className="text-[var(--fg-muted)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No templates found</p>
          <p className="text-sm text-[var(--fg-secondary)]">
            {search ? "Try adjusting your search or category filter" : "No templates are available yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template, idx) => {
            const isLoadingThis = loadingTemplateId === template.id;
            const tint = categoryTints[idx % categoryTints.length];
            const iconName = iconMap[template.icon] || iconMap[template.categoryIcon] || "fileText";
            const fieldCount = template.field_count || template.fields_count || 0;
            const usageCount = template.usage_count || 0;

            return (
              <Card
                key={template.id}
                tint={tint}
                spotlight
                hover
                onClick={() => !isLoadingThis && handleSelectTemplate(template)}
                className={cn(
                  "cursor-pointer",
                  isLoadingThis && "opacity-70 pointer-events-none"
                )}
              >
                <div className="flex flex-col h-full">
                  {/* Icon and Title */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      "bg-[var(--bg-base)] border border-[var(--border-default)]",
                      "transition-transform duration-200 group-hover:scale-110"
                    )}>
                      {isLoadingThis ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--border-default)] border-t-[var(--accent)]" />
                      ) : (
                        <Icon name={iconName} size={18} className="text-[var(--fg-secondary)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate">
                        {template.name}
                      </h3>
                      {template.categoryName && (
                        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                          {template.categoryName}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-xs text-[var(--fg-secondary)] leading-relaxed mb-4 line-clamp-2 flex-1">
                      {template.description}
                    </p>
                  )}
                  {!template.description && <div className="flex-1" />}

                  {/* Footer Stats */}
                  <div className="flex items-center gap-3 pt-3 border-t border-[var(--border-default)]">
                    <span className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1.5">
                      <Icon name="list" size={12} />
                      {fieldCount} {fieldCount === 1 ? "field" : "fields"}
                    </span>
                    <span className="text-[var(--border-default)]">|</span>
                    <span className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1.5">
                      <Icon name="activity" size={12} />
                      {usageCount} {usageCount === 1 ? "use" : "uses"}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
