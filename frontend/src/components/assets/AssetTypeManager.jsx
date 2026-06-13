/**
 * AssetTypeManager — Manage asset categories and types
 * Left panel: categories | Right panel: types within selected category
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Input from "../ui/Input";
import Skeleton from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";
import useConfirm from "../ui/useConfirm";

function cn(...p) { return p.filter(Boolean).join(" "); }

const COLORS = ["blue","purple","emerald","amber","rose","slate","cyan","orange"];

const SWATCH_STYLES = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
};
const ICONS  = ["box","monitor","wifi","phone","code","briefcase","server","database","shield","tool","layers","cpu"];

const COLOR_STYLES = {
  blue:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  purple:"bg-purple-500/10 text-purple-400 border-purple-500/20",
  emerald:"bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  amber:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  rose:"bg-rose-500/10 text-rose-400 border-rose-500/20",
  slate:"bg-slate-500/10 text-slate-400 border-slate-500/20",
  cyan:"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  orange:"bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ── Inline form ───────────────────────────────────────────────────────────────
function InlineForm({ title, initial = {}, onSave, onCancel }) {
  const [name, setName]   = useState(initial.name || "");
  const [desc, setDesc]   = useState(initial.description || "");
  const [icon, setIcon]   = useState(initial.icon || "box");
  const [color, setColor] = useState(initial.color || "blue");
  const [saving, setSav]  = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSav(true);
    await onSave({ name, description: desc, icon, color });
    setSav(false);
  }

  return (
    <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent)]/30 shadow-[var(--shadow-card)] space-y-3.5 animate-fade-up">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
          <Icon name="tag" size={14} />
        </span>
        <p className="text-sm font-semibold text-[var(--fg-primary)] tracking-tight">{title}</p>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" size="sm" />
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" size="sm" />
      <div>
        <p className="text-label mb-2">Color</p>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} title={c} aria-label={`Color ${c}`}
              className={cn("w-6 h-6 rounded-full border-2 transition-all", SWATCH_STYLES[c], color===c ? "border-[var(--fg-primary)] scale-110" : "border-transparent opacity-60 hover:opacity-100")} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-label mb-2">Icon</p>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((ic) => (
            <button key={ic} onClick={() => setIcon(ic)}
              className={cn("p-1.5 rounded-lg border transition-all", icon===ic ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]" : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)]")}>
              <Icon name={ic} size={14} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} loading={saving} disabled={!name.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ── Type form ─────────────────────────────────────────────────────────────────
function TypeForm({ categoryId, initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || "");
  const [desc, setDesc] = useState(initial.description || "");
  const [icon, setIcon] = useState(initial.icon || "box");
  const [saving, setSav] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSav(true);
    await onSave({ name, description: desc, icon, category_id: categoryId });
    setSav(false);
  }

  return (
    <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent)]/30 shadow-[var(--shadow-card)] space-y-3 mb-2 animate-fade-up">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type name *" size="sm" />
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" size="sm" />
      <div>
        <p className="text-label mb-2">Icon</p>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((ic) => (
            <button key={ic} onClick={() => setIcon(ic)}
              className={cn("p-1.5 rounded-md border transition-all", icon===ic ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]" : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)]")}>
              <Icon name={ic} size={13} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} loading={saving} disabled={!name.trim()}>Add</Button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssetTypeManager() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [categories, setCategories] = useState([]);
  const [types, setTypes]           = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [addingCat, setAddingCat]   = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [addingType, setAddingType] = useState(false);
  const [editingType, setEditingType] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [cats, typs] = await Promise.all([assetsApi.getCategories(), assetsApi.getAssetTypes()]);
      setCategories(cats);
      setTypes(typs);
      if (!selectedCat && cats.length) setSelectedCat(cats[0].id);
    } catch (e) {
      toast.error(e?.message || "Failed to load asset categories");
    }
    finally { setLoading(false); }
  }

  const catTypes = types.filter((t) => String(t.category_id) === String(selectedCat));
  const selectedCategory = categories.find((c) => c.id === selectedCat);

  async function handleSaveCategory(data) {
    try {
      if (editingCat) { await assetsApi.updateCategory(editingCat.id, data); toast.success("Category updated"); }
      else            { const r = await assetsApi.createCategory(data); setSelectedCat(r.id); toast.success("Category created"); }
      setEditingCat(null); setAddingCat(false);
      load();
    } catch (e) {
      toast.error(e?.message || "Failed to save category");
    }
  }

  function handleDeleteCategory(cat) {
    confirm({
      title: "Delete category?",
      message: (
        <>
          This will delete <strong className="text-[var(--fg-primary)]">{cat.name}</strong>
          {cat.type_count > 0 && <> and its {cat.type_count} type{cat.type_count > 1 ? "s" : ""}</>}.
        </>
      ),
      confirmText: "Delete",
      onConfirm: async () => {
        try { await assetsApi.deleteCategory(cat.id); toast.success("Category deleted"); load(); }
        catch (e) { toast.error(e?.message || "Cannot delete — assets may still use this category"); }
      },
    });
  }

  async function handleSaveType(data) {
    try {
      if (editingType) { await assetsApi.updateAssetType(editingType.id, data); toast.success("Type updated"); }
      else             { await assetsApi.createAssetType(data); toast.success("Type created"); }
      setEditingType(null); setAddingType(false);
      load();
    } catch (e) {
      toast.error(e?.message || "Failed to save type");
    }
  }

  function handleDeleteType(type) {
    confirm({
      title: "Delete asset type?",
      message: (
        <>
          This will delete <strong className="text-[var(--fg-primary)]">{type.name}</strong>
          {type.asset_count > 0 && <>. {type.asset_count} asset{type.asset_count > 1 ? "s" : ""} currently use it</>}.
        </>
      ),
      confirmText: "Delete",
      onConfirm: async () => {
        try { await assetsApi.deleteAssetType(type.id); toast.success("Type deleted"); load(); }
        catch (e) { toast.error(e?.message || "Cannot delete — assets may still use this type"); }
      },
    });
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-5">
      {/* Left: Categories */}
      <div className="lg:w-80 shrink-0 flex flex-col rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up">
        <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-[var(--border-default)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Icon name="folder" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Categories</h2>
            {!loading && <Badge tone="slate" size="sm">{categories.length}</Badge>}
          </div>
          <Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => { setAddingCat(true); setEditingCat(null); }}>Add</Button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-1.5">
          {addingCat && !editingCat && (
            <InlineForm title="New Category" onSave={handleSaveCategory} onCancel={() => setAddingCat(false)} />
          )}
          {editingCat && (
            <InlineForm title="Edit Category" initial={editingCat} onSave={handleSaveCategory} onCancel={() => setEditingCat(null)} />
          )}

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--border-default)]">
                <Skeleton className="h-9 w-9" rounded="rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" rounded="rounded-md" />
                  <Skeleton className="h-2.5 w-32" rounded="rounded-md" />
                </div>
              </div>
            ))
          ) : categories.map((cat) => {
            const isActive = selectedCat === cat.id;
            return (
              <div key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all duration-150",
                  isActive
                    ? "bg-[var(--accent)]/8 border-[var(--accent)]/30"
                    : "bg-transparent border-transparent hover:bg-[var(--bg-surface)] hover:border-[var(--border-default)]"
                )}>
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border shrink-0", COLOR_STYLES[cat.color] || COLOR_STYLES.blue)}>
                  <Icon name={cat.icon || "box"} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", isActive ? "text-[var(--accent)]" : "text-[var(--fg-primary)]")}>{cat.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{cat.type_count} types · {cat.asset_count} assets</p>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditingCat(cat); setAddingCat(false); }}
                    className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] transition-all">
                    <Icon name="pencil" size={13} />
                  </button>
                  <button onClick={() => handleDeleteCategory(cat)}
                    className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Types */}
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between gap-2.5 px-5 py-4 border-b border-[var(--border-default)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Icon name="tag" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight truncate">
              {selectedCategory ? `${selectedCategory.name} — Types` : "Select a Category"}
            </h2>
          </div>
          {selectedCat && (
            <Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => { setAddingType(true); setEditingType(null); }}>Add Type</Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none p-4">
          {!selectedCat ? (
            <EmptyState icon="tag" title="Select a category" description="Choose a category on the left to manage its asset types." compact />
          ) : (
            <div className="space-y-2.5">
              {addingType && !editingType && (
                <TypeForm categoryId={selectedCat} onSave={handleSaveType} onCancel={() => setAddingType(false)} />
              )}

              {catTypes.length === 0 && !addingType ? (
                <EmptyState
                  icon="box"
                  title="No types yet"
                  description="This category doesn't have any asset types. Add the first one to get started."
                  action={<Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => setAddingType(true)}>Add First Type</Button>}
                  compact
                />
              ) : catTypes.map((type) => (
                <div key={type.id}>
                  {editingType?.id === type.id ? (
                    <TypeForm categoryId={selectedCat} initial={type} onSave={handleSaveType} onCancel={() => setEditingType(null)} />
                  ) : (
                    <div className="group flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all duration-150">
                      <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center shrink-0 text-[var(--fg-muted)]">
                        <Icon name={type.icon || "box"} size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--fg-primary)] truncate">{type.name}</p>
                        {type.description && <p className="text-xs text-[var(--fg-muted)] truncate">{type.description}</p>}
                      </div>
                      <Badge tone="slate" size="sm">{type.asset_count} assets</Badge>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingType(type); setAddingType(false); }}
                          className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] transition-all">
                          <Icon name="pencil" size={13} />
                        </button>
                        <button onClick={() => handleDeleteType(type)}
                          className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
