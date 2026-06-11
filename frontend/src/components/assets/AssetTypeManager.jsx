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

function cn(...p) { return p.filter(Boolean).join(" "); }

const COLORS = ["blue","purple","emerald","amber","rose","slate","cyan","orange"];
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
    <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent)]/30 space-y-3">
      <p className="text-sm font-semibold text-[var(--fg-primary)]">{title}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *"
        className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)"
        className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]" />
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={cn("w-6 h-6 rounded-full border-2 transition-all", `bg-${c}-500`, color===c ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100")} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ICONS.map((ic) => (
          <button key={ic} onClick={() => setIcon(ic)}
            className={cn("p-1.5 rounded-lg border transition-all", icon===ic ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]" : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]")}>
            <Icon name={ic} size={14} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
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
    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent)]/30 space-y-2 mb-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type name *"
        className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description"
        className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]" />
      <div className="flex flex-wrap gap-1">
        {ICONS.map((ic) => (
          <button key={ic} onClick={() => setIcon(ic)}
            className={cn("p-1 rounded-md border transition-all", icon===ic ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 text-[var(--accent)]" : "bg-[var(--bg-base)] border-[var(--border-default)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)]")}>
            <Icon name={ic} size={12} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} loading={saving} disabled={!name.trim()}>Add</Button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssetTypeManager() {
  const toast = useToast();
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
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const catTypes = types.filter((t) => String(t.category_id) === String(selectedCat));
  const selectedCategory = categories.find((c) => c.id === selectedCat);

  async function handleSaveCategory(data) {
    try {
      if (editingCat) await assetsApi.updateCategory(editingCat.id, data);
      else            { const r = await assetsApi.createCategory(data); setSelectedCat(r.id); }
      setEditingCat(null); setAddingCat(false);
      load();
    } catch { /* silent */ }
  }

  async function handleDeleteCategory(cat) {
    try { await assetsApi.deleteCategory(cat.id); load(); } catch { /* silent */ }
  }

  async function handleSaveType(data) {
    try {
      if (editingType) await assetsApi.updateAssetType(editingType.id, data);
      else             await assetsApi.createAssetType(data);
      setEditingType(null); setAddingType(false);
      load();
    } catch { /* silent */ }
  }

  async function handleDeleteType(type) {
    try { await assetsApi.deleteAssetType(type.id); load(); } catch (e) {
      toast.error(e?.message || "Cannot delete — assets may still use this type");
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left: Categories */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Categories</h3>
          <Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => { setAddingCat(true); setEditingCat(null); }}>Add</Button>
        </div>

        {addingCat && !editingCat && (
          <InlineForm title="New Category" onSave={handleSaveCategory} onCancel={() => setAddingCat(false)} />
        )}
        {editingCat && (
          <InlineForm title="Edit Category" initial={editingCat} onSave={handleSaveCategory} onCancel={() => setEditingCat(null)} />
        )}

        <div className="flex-1 overflow-y-auto scrollbar-none space-y-1.5">
          {loading ? (
            <p className="text-sm text-[var(--fg-muted)] text-center py-8">Loading…</p>
          ) : categories.map((cat) => {
            const isActive = selectedCat === cat.id;
            return (
              <div key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all",
                  isActive
                    ? "bg-[var(--accent)]/8 border-[var(--accent)]/30 shadow-[0_0_0_1px_var(--accent)]/10"
                    : "bg-[var(--bg-elevated)] border-[var(--border-default)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
                )}>
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border shrink-0", COLOR_STYLES[cat.color] || COLOR_STYLES.blue)}>
                  <Icon name={cat.icon || "box"} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--fg-primary)] truncate">{cat.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{cat.type_count} types · {cat.asset_count} assets</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditingCat(cat); setAddingCat(false); }}
                    className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)]">
                    <Icon name="pencil" size={12} />
                  </button>
                  <button onClick={() => handleDeleteCategory(cat)}
                    className="p-1 rounded text-[var(--fg-muted)] hover:text-rose-400">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Types */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">
            {selectedCategory ? `${selectedCategory.name} — Types` : "Select a Category"}
          </h3>
          {selectedCat && (
            <Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => { setAddingType(true); setEditingType(null); }}>Add Type</Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          {!selectedCat ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Icon name="tag" size={28} className="text-[var(--fg-muted)] mb-2" />
              <p className="text-sm text-[var(--fg-muted)]">Select a category to manage its types</p>
            </div>
          ) : (
            <div className="space-y-2">
              {addingType && !editingType && (
                <TypeForm categoryId={selectedCat} onSave={handleSaveType} onCancel={() => setAddingType(false)} />
              )}

              {catTypes.length === 0 && !addingType ? (
                <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-[var(--bg-elevated)] border border-dashed border-[var(--border-default)]">
                  <Icon name="box" size={28} className="text-[var(--fg-muted)] mb-2" />
                  <p className="text-sm text-[var(--fg-muted)] mb-3">No types in this category yet</p>
                  <Button size="sm" icon={<Icon name="plus" size={13} />} onClick={() => setAddingType(true)}>Add First Type</Button>
                </div>
              ) : catTypes.map((type) => (
                <div key={type.id}>
                  {editingType?.id === type.id ? (
                    <TypeForm categoryId={selectedCat} initial={type} onSave={handleSaveType} onCancel={() => setEditingType(null)} />
                  ) : (
                    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-all">
                      <div className="w-9 h-9 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                        <Icon name={type.icon || "box"} size={16} className="text-[var(--fg-muted)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--fg-primary)]">{type.name}</p>
                        {type.description && <p className="text-xs text-[var(--fg-muted)] truncate">{type.description}</p>}
                      </div>
                      <Badge tone="slate">{type.asset_count} assets</Badge>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingType(type); setAddingType(false); }}
                          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all">
                          <Icon name="pencil" size={13} />
                        </button>
                        <button onClick={() => handleDeleteType(type)}
                          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all">
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
    </div>
  );
}
