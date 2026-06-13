/**
 * TemplateCategoryManager Component
 * Sidebar for managing template categories with inline CRUD operations.
 *
 * Features:
 * - Clickable category rows with selection state
 * - "All Templates" top option
 * - Inline edit and delete with confirmation
 * - Add new category inline form
 */

import { useState } from "react";
import { templatesApi } from "../../services/api";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function TemplateCategoryManager({
  categories = [],
  selectedCategoryId,
  onSelectCategory,
  onCategoriesChanged,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Start inline editing a category
   */
  function startEdit(category) {
    setEditingId(category.id);
    setEditName(category.name);
    setIsAdding(false);
    setError(null);
  }

  /**
   * Cancel inline edit
   */
  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setError(null);
  }

  /**
   * Save edited category name
   */
  async function saveEdit() {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await templatesApi.updateCategory(editingId, { name: trimmed });
      setEditingId(null);
      setEditName("");
      onCategoriesChanged();
    } catch (err) {
      setError(err.message || "Failed to update category");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Confirm and delete a category
   */
  async function confirmDelete(id) {
    try {
      setLoading(true);
      setError(null);
      await templatesApi.deleteCategory(id);
      setDeletingId(null);
      if (selectedCategoryId === id) {
        onSelectCategory(null);
      }
      onCategoriesChanged();
    } catch (err) {
      setError(err.message || "Failed to delete category");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Show inline add form
   */
  function startAdd() {
    setIsAdding(true);
    setNewName("");
    setEditingId(null);
    setError(null);
  }

  /**
   * Cancel add form
   */
  function cancelAdd() {
    setIsAdding(false);
    setNewName("");
    setError(null);
  }

  /**
   * Save new category
   */
  async function saveNewCategory() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await templatesApi.createCategory({ name: trimmed });
      setIsAdding(false);
      setNewName("");
      onCategoriesChanged();
    } catch (err) {
      setError(err.message || "Failed to create category");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle key press in inputs (Enter to save, Escape to cancel)
   */
  function handleEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  function handleAddKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveNewCategory();
    } else if (e.key === "Escape") {
      cancelAdd();
    }
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
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border-default)] shrink-0">
        <span className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
          <Icon name="folder" size={15} />
        </span>
        <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">
          Categories
        </h3>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {/* All Templates option */}
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              selectedCategoryId === null
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--fg-primary)]"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Icon name="list" size={16} />
                <span>All Templates</span>
              </div>
              {selectedCategoryId === null && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </div>
          </button>

          {/* Category rows */}
          {categories.map((cat) => {
            // Deleting state
            if (deletingId === cat.id) {
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "px-3 py-2.5 rounded-lg",
                    "bg-rose-500/10 border border-rose-500/15"
                  )}
                >
                  <p className="text-xs text-[var(--fg-secondary)] mb-2">
                    Delete "{cat.name}"?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => confirmDelete(cat.id)}
                      loading={loading}
                      className="flex-1"
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeletingId(null)}
                      disabled={loading}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            }

            // Editing state
            if (editingId === cat.id) {
              return (
                <div key={cat.id} className="px-2 py-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    autoFocus
                    className={cn(
                      "w-full px-2.5 py-1.5 text-sm rounded-md mb-2",
                      "bg-[var(--bg-base)] border border-[var(--accent)]",
                      "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                      "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
                      "transition-all duration-150"
                    )}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={saveEdit}
                      loading={loading}
                      className="flex-1"
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={cancelEdit}
                      disabled={loading}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            }

            // Normal state
            return (
              <div
                key={cat.id}
                className={cn(
                  "group flex items-center justify-between rounded-lg transition-all",
                  selectedCategoryId === cat.id
                    ? "bg-[var(--accent)]/10"
                    : "hover:bg-[var(--bg-base)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={cn(
                    "flex-1 text-left px-3 py-2.5 text-sm font-medium transition-colors min-w-0",
                    selectedCategoryId === cat.id
                      ? "text-[var(--accent)]"
                      : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon name="tag" size={16} className="shrink-0" />
                    <span className="truncate">{cat.name}</span>
                  </div>
                </button>

                {/* Action buttons (visible on hover) */}
                <div
                  className={cn(
                    "flex items-center gap-0.5 pr-2 shrink-0",
                    "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(cat);
                    }}
                    className={cn(
                      "p-1 rounded-md transition-colors duration-150",
                      "text-[var(--fg-muted)]",
                      "hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                    )}
                    title="Edit category"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(cat.id);
                    }}
                    className={cn(
                      "p-1 rounded-md transition-colors duration-150",
                      "text-[var(--fg-muted)]",
                      "hover:bg-rose-500/10 hover:text-rose-500"
                    )}
                    title="Delete category"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-2 mt-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/15">
            <p className="text-xs text-rose-500">{error}</p>
          </div>
        )}
      </div>

      {/* Add category section */}
      <div className="border-t border-[var(--border-default)] p-3 shrink-0">
        {isAdding ? (
          <div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleAddKeyDown}
              placeholder="Category name"
              autoFocus
              className={cn(
                "w-full px-2.5 py-1.5 text-sm rounded-md mb-2",
                "bg-[var(--bg-base)] border border-[var(--accent)]",
                "text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
                "transition-all duration-150"
              )}
            />
            <div className="flex gap-1.5">
              <Button
                variant="primary"
                size="xs"
                onClick={saveNewCategory}
                loading={loading}
                className="flex-1"
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={cancelAdd}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="plus" size={14} />}
            onClick={startAdd}
            className="w-full"
          >
            Add Category
          </Button>
        )}
      </div>
    </div>
  );
}
