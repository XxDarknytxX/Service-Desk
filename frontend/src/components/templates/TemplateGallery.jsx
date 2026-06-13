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
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* Per-card accent palette — static class strings (no dynamic Tailwind). */
const CARD_ACCENTS = [
  { tile: "bg-violet-500/10 text-violet-500 border-violet-500/15", glow: "bg-violet-500" },
  { tile: "bg-blue-500/10 text-blue-500 border-blue-500/15", glow: "bg-blue-500" },
  { tile: "bg-cyan-500/10 text-cyan-500 border-cyan-500/15", glow: "bg-cyan-500" },
  { tile: "bg-teal-500/10 text-teal-500 border-teal-500/15", glow: "bg-teal-500" },
  { tile: "bg-indigo-500/10 text-indigo-500 border-indigo-500/15", glow: "bg-indigo-500" },
  { tile: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", glow: "bg-emerald-500" },
  { tile: "bg-amber-500/10 text-amber-500 border-amber-500/15", glow: "bg-amber-500" },
  { tile: "bg-rose-500/10 text-rose-500 border-rose-500/15", glow: "bg-rose-500" },
];

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
              "p-2 rounded-lg shrink-0",
              "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]",
              "hover:bg-[var(--bg-surface)]",
              "transition-all duration-150"
            )}
          >
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <span className="h-10 w-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/15 flex items-center justify-center shrink-0">
          <Icon name="clipboard" size={18} />
        </span>
        <div className="min-w-0">
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
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <div
            ref={categoryScrollRef}
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]"
          >
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "flex-shrink-0 px-3.5 py-2 rounded-lg text-sm font-medium",
                    "transition-all duration-200 whitespace-nowrap",
                    isActive
                      ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                  )}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-5"
            >
              <div className="flex items-start gap-3 mb-3">
                <Skeleton className="h-10 w-10" rounded="rounded-xl" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3.5 w-28" rounded="rounded-md" />
                  <Skeleton className="h-2.5 w-16" rounded="rounded-md" />
                </div>
              </div>
              <Skeleton className="h-3 w-full mb-2" rounded="rounded-md" />
              <Skeleton className="h-3 w-2/3 mb-4" rounded="rounded-md" />
              <div className="pt-3 border-t border-[var(--border-default)]">
                <Skeleton className="h-3 w-32" rounded="rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="alertTriangle"
            tone="rose"
            title="Something went wrong"
            description={error}
            action={
              <Button variant="secondary" onClick={() => loadGallery(search)} icon={<Icon name="refresh" size={16} />}>
                Retry
              </Button>
            }
          />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
          <EmptyState
            icon="clipboard"
            title="No templates found"
            description={
              search
                ? "Try adjusting your search or category filter."
                : "No templates are available yet."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template, idx) => {
            const isLoadingThis = loadingTemplateId === template.id;
            const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
            const iconName = iconMap[template.icon] || iconMap[template.categoryIcon] || "fileText";
            const fieldCount = template.field_count || template.fields_count || 0;
            const usageCount = template.usage_count || 0;

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => !isLoadingThis && handleSelectTemplate(template)}
                disabled={isLoadingThis}
                className={cn(
                  "group relative text-left overflow-hidden rounded-2xl p-5 flex flex-col",
                  "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
                  "animate-fade-up",
                  isLoadingThis && "opacity-70 pointer-events-none"
                )}
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              >
                {/* decorative corner glow */}
                <div
                  className={cn(
                    "pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.14]",
                    accent.glow
                  )}
                />

                {/* Icon and Title */}
                <div className="relative flex items-start gap-3 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                    "transition-transform duration-200 group-hover:scale-110",
                    accent.tile
                  )}>
                    {isLoadingThis ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-current/30 border-t-current" />
                    ) : (
                      <Icon name={iconName} size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--fg-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {template.name}
                    </h3>
                    {template.categoryName && (
                      <p className="text-[11px] text-[var(--fg-muted)] mt-0.5 truncate">
                        {template.categoryName}
                      </p>
                    )}
                  </div>
                  <Icon
                    name="arrowRight"
                    size={15}
                    className="text-[var(--fg-muted)] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 mt-1"
                  />
                </div>

                {/* Description */}
                {template.description ? (
                  <p className="relative text-xs text-[var(--fg-secondary)] leading-relaxed mb-4 line-clamp-2 flex-1">
                    {template.description}
                  </p>
                ) : (
                  <div className="flex-1" />
                )}

                {/* Footer Stats */}
                <div className="relative flex items-center gap-3 pt-3 border-t border-[var(--border-default)]">
                  <span className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1.5">
                    <Icon name="list" size={12} />
                    {fieldCount} {fieldCount === 1 ? "field" : "fields"}
                  </span>
                  <span className="h-3 w-px bg-[var(--border-default)]" />
                  <span className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1.5">
                    <Icon name="activity" size={12} />
                    {usageCount} {usageCount === 1 ? "use" : "uses"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
