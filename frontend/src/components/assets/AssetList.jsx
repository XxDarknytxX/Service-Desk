/**
 * AssetList — Main inventory tab
 * Features: search, multi-filter, table/card view, bulk ops, detail panel, checkout/checkin
 */
import { useState, useEffect, useCallback } from "react";
import { assetsApi, api } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import { Textarea } from "../ui/Input";
import { SkeletonTable } from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";
import useConfirm from "../ui/useConfirm";
import AssetModal from "./AssetModal";
import AssetDetailPanel from "./AssetDetailPanel";

function cn(...p) { return p.filter(Boolean).join(" "); }

const STATUS_TONE = { active:"emerald", maintenance:"amber", retired:"rose", inactive:"slate" };
const COND_TONE   = { new:"emerald", excellent:"emerald", good:"blue", fair:"amber", poor:"rose", damaged:"rose" };

// ── Checkout / Checkin modal ──────────────────────────────────────────────────
function CheckoutModal({ open, asset, onClose, onDone }) {
  const [userId, setUserId]       = useState("");
  const [location, setLocation]   = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [users, setUsers]         = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setUserId(""); setLocation(asset?.location || ""); setNotes(""); setUserSearch("");
      api("/users").then((d) => setUsers(d.items || d.users || [])).catch(() => {});
    }
  }, [open]);

  const filteredUsers = users.filter((u) =>
    !userSearch || (u.full_name || u.email || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  async function submit() {
    if (!userId) { toast.error("Please select a user to assign"); return; }
    setSaving(true);
    try {
      await assetsApi.checkout(asset.id, { assigned_to_user_id: Number(userId), location, notes });
      toast.success("Asset checked out successfully");
      onDone();
    } catch (e) {
      toast.error(e?.message || "Failed to check out asset");
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open && !!asset} onClose={onClose}
      title="Check Out Asset"
      subtitle={asset ? `${asset.name} · ${asset.asset_tag}` : ""}
      size="md"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={!userId}>Check Out</Button>
        </>
      }>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Assign To *</label>
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              type="text" value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); if (!e.target.value) setUserId(""); }}
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
            />
          </div>
          {userSearch && !userId && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-elevated)] p-1">
              {filteredUsers.slice(0, 8).map((u) => (
                <button key={u.id} type="button"
                  onClick={() => { setUserId(u.id); setUserSearch(u.full_name || u.email); }}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[var(--bg-surface)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[11px] font-semibold text-[var(--accent)] shrink-0">
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{u.full_name || u.email}</span>
                    {u.title && <span className="text-xs text-[var(--fg-muted)] ml-2">{u.title}</span>}
                  </span>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">No users found</p>
              )}
            </div>
          )}
          {userId && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20">
              <Icon name="userCheck" size={14} className="text-[var(--accent)]" />
              <span className="text-xs text-[var(--fg-muted)] font-medium">Selected</span>
              <span className="text-sm text-[var(--fg-primary)] font-medium">{userSearch}</span>
              <button type="button" onClick={() => { setUserId(""); setUserSearch(""); }} className="ml-auto p-1 rounded-md text-[var(--fg-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">Location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this going?"
            className="w-full px-4 py-2.5 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-hover)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all" />
        </div>
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes" />
      </div>
    </Modal>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────
function BulkBar({ selected, onClear, onBulkAction }) {
  const n = selected.length;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--accent)]/8 border border-[var(--accent)]/25 shadow-[var(--shadow-card)] animate-fade-up">
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold tabular-nums">{n}</span>
      <span className="text-sm font-medium text-[var(--fg-primary)]">selected</span>
      <div className="h-5 w-px bg-[var(--accent)]/20 hidden sm:block" />
      <div className="flex gap-2 ml-auto flex-wrap justify-end">
        {[
          { label:"Set Active",      v:"active",      tone:"emerald" },
          { label:"Set Maintenance", v:"maintenance", tone:"amber" },
          { label:"Set Retired",     v:"retired",     tone:"rose" },
        ].map((a) => (
          <button key={a.v} onClick={() => onBulkAction("status", a.v)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)] transition-all">
            {a.label}
          </button>
        ))}
        <button onClick={() => onBulkAction("delete")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all">
          <Icon name="trash" size={13} /> Delete
        </button>
        <button onClick={onClear} className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all" title="Clear selection">
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AssetList() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [assets, setAssets]           = useState([]);
  const [categories, setCategories]   = useState([]);
  const [types, setTypes]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterCat, setFilterCat]     = useState("");
  const [filterType, setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCond, setFilterCond]   = useState("");
  const [viewMode, setViewMode]       = useState("table"); // table | grid
  const [selected, setSelected]       = useState([]);
  const [showModal, setShowModal]     = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [detailAsset, setDetailAsset] = useState(null);
  const [checkoutAsset, setCheckoutAsset] = useState(null);
  const [sortCol, setSortCol]         = useState("updated_at");
  const [sortDir, setSortDir]         = useState("desc");

  useEffect(() => { loadLookups(); }, []);
  useEffect(() => { loadAssets(); }, [search, filterCat, filterType, filterStatus, filterCond]);

  async function loadLookups() {
    try {
      const [cats, typs] = await Promise.all([assetsApi.getCategories(), assetsApi.getAssetTypes()]);
      setCategories(cats);
      setTypes(typs);
    } catch (e) {
      toast.error(e?.message || "Failed to load asset filters");
    }
  }

  async function loadAssets() {
    setLoading(true);
    try {
      const params = {};
      if (search)       params.search      = search;
      if (filterCat)    params.category_id = filterCat;
      if (filterType)   params.type_id     = filterType;
      if (filterStatus) params.status      = filterStatus;
      if (filterCond)   params.condition   = filterCond;
      const data = await assetsApi.getAssets(params);
      setAssets(data);
      setSelected([]);
    } catch (e) {
      toast.error(e?.message || "Failed to load assets");
    }
    finally { setLoading(false); }
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filteredTypes = filterCat
    ? types.filter((t) => String(t.category_id) === String(filterCat))
    : types;

  // Client-side sort
  const sorted = [...assets].sort((a, b) => {
    const av = a[sortCol] ?? "";
    const bv = b[sortCol] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(col) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function toggleSelect(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAll() {
    setSelected(selected.length === sorted.length ? [] : sorted.map((a) => a.id));
  }

  async function handleBulkAction(action, value) {
    if (!selected.length) return;
    if (action === "delete") {
      confirm({
        title: `Delete ${selected.length} asset${selected.length > 1 ? "s" : ""}?`,
        message: (
          <>
            This will permanently delete the selected asset
            {selected.length > 1 ? "s" : ""} along with their assignment and
            maintenance history. This action cannot be undone.
          </>
        ),
        confirmText: "Delete Assets",
        onConfirm: async () => {
          try {
            await assetsApi.bulkUpdate({ ids: selected, action, value });
            toast.success(`${selected.length} asset${selected.length > 1 ? "s" : ""} deleted`);
            loadAssets();
          } catch (e) {
            toast.error(e?.message || "Bulk delete failed");
          }
        },
      });
      return;
    }
    try {
      await assetsApi.bulkUpdate({ ids: selected, action, value });
      toast.success(`${selected.length} asset${selected.length > 1 ? "s" : ""} updated`);
      loadAssets();
    } catch (e) {
      toast.error(e?.message || "Bulk update failed");
    }
  }

  async function handleCheckin(asset) {
    try {
      await assetsApi.checkin(asset.id, {});
      toast.success("Asset checked in");
      loadAssets();
      if (detailAsset?.id === asset.id) setDetailAsset((prev) => ({ ...prev, assigned_to_user_id: null }));
    } catch (e) {
      toast.error(e?.message || "Failed to check in asset");
    }
  }

  function openEdit(asset) { setEditingAsset(asset); setShowModal(true); }
  function openCreate()    { setEditingAsset(null);  setShowModal(true); }

  const SortIcon = ({ col }) => sortCol === col
    ? <Icon name={sortDir === "asc" ? "chevron-up" : "chevron-down"} size={12} className="text-[var(--accent)]" />
    : <Icon name="chevronDown" size={12} className="text-[var(--fg-muted)] opacity-40 group-hover/th:opacity-70" />;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-FJ", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  const COLS = [
    { key:"name",         label:"Asset",       sortable:true  },
    { key:"type_name",    label:"Type",        sortable:true  },
    { key:"manufacturer", label:"Manufacturer",sortable:true  },
    { key:"condition",    label:"Condition",   sortable:true  },
    { key:"status",       label:"Status",      sortable:true  },
    { key:"assigned_user_name", label:"Assigned To", sortable:false },
    { key:"location",     label:"Location",    sortable:false },
    { key:"warranty_expiry_date", label:"Warranty", sortable:true },
    { key:"actions",      label:"",            sortable:false },
  ];

  // Quick stats from loaded data
  const totalAssets = assets.length;
  const activeCount = assets.filter(a => a.status === "active").length;
  const assignedCount = assets.filter(a => a.assigned_user_name || a.assigned_org_name).length;
  const maintenanceCount = assets.filter(a => a.status === "maintenance").length;

  const hasFilters = !!(search || filterCat || filterType || filterStatus || filterCond);

  const KPIS = [
    { label: "Total Assets", value: totalAssets,      icon: "box",       iconCls: "bg-blue-500/10 text-blue-500 border-blue-500/15",        bar: "bg-blue-500" },
    { label: "Active",       value: activeCount,      icon: "check",     iconCls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15", bar: "bg-emerald-500" },
    { label: "Assigned",     value: assignedCount,    icon: "userCheck", iconCls: "bg-violet-500/10 text-violet-500 border-violet-500/15",   bar: "bg-violet-500" },
    { label: "Maintenance",  value: maintenanceCount, icon: "tool",      iconCls: "bg-amber-500/10 text-amber-500 border-amber-500/15",      bar: "bg-amber-500" },
  ];

  return (
    <div className="flex flex-col h-full gap-5">
      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {KPIS.map((s, i) => (
          <div
            key={s.label}
            className="group relative overflow-hidden rounded-2xl p-5 bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)] animate-kpi-rise"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-label">{s.label}</span>
              <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-110", s.iconCls)}>
                <Icon name={s.icon} size={16} />
              </span>
            </div>
            <p className="text-[32px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">{s.value}</p>
            <div className="mt-4 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700 ease-out", s.bar)}
                style={{ width: `${totalAssets > 0 ? Math.max(Math.round((s.value / totalAssets) * 100), s.value > 0 ? 6 : 0) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] p-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, tag, serial, manufacturer…"
              className="w-full pl-10 pr-9 py-2.5 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(""); setSearch(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)]">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {/* Filters */}
          {[
            { value: filterCat,    set: (v) => { setFilterCat(v); setFilterType(""); }, options: [{ id:"", name:"All Categories" }, ...categories], label:"category" },
            { value: filterType,   set: setFilterType, options: [{ id:"", name:"All Types" }, ...filteredTypes], label:"type" },
            { value: filterStatus, set: setFilterStatus, options: [
              { id:"", name:"All Status" }, { id:"active", name:"Active" },
              { id:"maintenance", name:"Maintenance" }, { id:"retired", name:"Retired" }, { id:"inactive", name:"Inactive" }
            ], label:"status" },
            { value: filterCond, set: setFilterCond, options: [
              { id:"", name:"All Conditions" }, { id:"new", name:"New" }, { id:"excellent", name:"Excellent" },
              { id:"good", name:"Good" }, { id:"fair", name:"Fair" }, { id:"poor", name:"Poor" }, { id:"damaged", name:"Damaged" }
            ], label:"condition" },
          ].map((f, i) => (
            <div key={i} className="relative">
              <select value={f.value} onChange={(e) => f.set(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-2.5 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] hover:border-[var(--border-hover)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 cursor-pointer transition-all">
                {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <Icon name="chevronDown" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
            </div>
          ))}

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
              {[["table","list"], ["grid","grid"]].map(([v, icon]) => (
                <button key={v} onClick={() => setViewMode(v)} title={v === "table" ? "Table view" : "Card view"}
                  className={cn("px-3 py-2.5 transition-all", viewMode===v ? "bg-[var(--accent)] text-white" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]")}>
                  <Icon name={icon} size={15} />
                </button>
              ))}
            </div>
            <Badge tone="slate" className="hidden sm:inline-flex tabular-nums">{assets.length} assets</Badge>
            <Button icon={<Icon name="plus" size={15} />} onClick={openCreate}>Add Asset</Button>
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 && (
        <div className="shrink-0">
          <BulkBar selected={selected} onClear={() => setSelected([])} onBulkAction={handleBulkAction} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <EmptyState
              icon="assets"
              title="No assets found"
              description={hasFilters ? "Try adjusting your filters or add a new asset." : "Get started by adding your first asset to the inventory."}
              action={<Button icon={<Icon name="plus" size={15} />} onClick={openCreate}>Add Asset</Button>}
            />
          </div>
        ) : viewMode === "table" ? (
          /* ── TABLE VIEW ── */
          <div className="rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={selected.length === sorted.length && sorted.length > 0}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer" />
                    </th>
                    {COLS.map((c) => (
                      <th key={c.key} onClick={() => c.sortable && toggleSort(c.key)}
                        className={cn("group/th text-left px-4 py-3 text-label whitespace-nowrap", c.sortable && "cursor-pointer hover:text-[var(--fg-secondary)] transition-colors")}>
                        <div className="flex items-center gap-1">
                          {c.label}
                          {c.sortable && <SortIcon col={c.key} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {sorted.map((asset) => {
                    const isSelected = selected.includes(asset.id);
                    const isAssigned = !!(asset.assigned_to_user_id || asset.assigned_to_org_id);
                    const wDays = asset.warranty_expiry_date
                      ? Math.ceil((new Date(asset.warranty_expiry_date) - new Date()) / 86400000)
                      : null;
                    return (
                      <tr key={asset.id}
                        onClick={() => setDetailAsset(asset)}
                        className={cn("group transition-colors duration-150 cursor-pointer", isSelected ? "bg-[var(--accent)]/5" : "hover:bg-[var(--bg-surface)]")}>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(asset.id)}
                            className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]/30 cursor-pointer" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="h-9 w-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center shrink-0 text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors">
                              <Icon name="monitor" size={16} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--fg-primary)] group-hover:text-[var(--accent)] transition-colors truncate">{asset.name}</p>
                              <p className="text-xs font-mono text-[var(--fg-muted)]">{asset.asset_tag}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div>
                            <Badge tone="blue" size="sm">{asset.type_name}</Badge>
                            {asset.category_name && <p className="text-xs text-[var(--fg-muted)] mt-1">{asset.category_name}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[var(--fg-secondary)]">
                            {[asset.manufacturer, asset.model].filter(Boolean).join(" / ") || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {asset.condition
                            ? <Badge tone={COND_TONE[asset.condition] || "slate"} size="sm" className="capitalize">{asset.condition}</Badge>
                            : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge tone={STATUS_TONE[asset.status] || "slate"} size="sm" dot className="capitalize">{asset.status}</Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          {isAssigned ? (
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[10px] font-semibold text-[var(--accent)] shrink-0">
                                {(asset.assigned_user_name || asset.assigned_org_name || "?")[0].toUpperCase()}
                              </span>
                              <span className="text-sm text-[var(--fg-secondary)] truncate max-w-[120px]">
                                {asset.assigned_user_name || asset.assigned_org_name}
                              </span>
                            </div>
                          ) : <span className="text-sm text-[var(--fg-muted)] italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[var(--fg-muted)] truncate max-w-[100px] block">{asset.location || "—"}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {wDays !== null ? (
                            <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md",
                              wDays < 0 ? "bg-rose-500/10 text-rose-500" : wDays < 30 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500")}>
                              <Icon name={wDays < 0 ? "alertCircle" : "shield"} size={11} />
                              {wDays < 0 ? `Expired` : `${wDays}d`}
                            </span>
                          ) : <span className="text-xs text-[var(--fg-muted)]">—</span>}
                        </td>
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(asset)}
                              className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] transition-all" title="Edit">
                              <Icon name="pencil" size={14} />
                            </button>
                            {isAssigned ? (
                              <button onClick={() => handleCheckin(asset)}
                                className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition-all" title="Check In">
                                <Icon name="download" size={14} />
                              </button>
                            ) : (
                              <button onClick={() => setCheckoutAsset(asset)}
                                className="p-1.5 rounded-md text-[var(--fg-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-all" title="Check Out">
                                <Icon name="userPlus" size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((asset) => {
              const isAssigned = !!(asset.assigned_to_user_id || asset.assigned_to_org_id);
              return (
                <div key={asset.id} onClick={() => setDetailAsset(asset)}
                  className="group relative p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <span className="w-11 h-11 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors">
                      <Icon name="monitor" size={20} />
                    </span>
                    <Badge tone={STATUS_TONE[asset.status] || "slate"} size="sm" dot className="capitalize">{asset.status}</Badge>
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg-primary)] mb-0.5 truncate group-hover:text-[var(--accent)] transition-colors">{asset.name}</p>
                  <p className="text-xs text-[var(--fg-muted)] font-mono mb-2">{asset.asset_tag}</p>
                  <p className="text-xs text-[var(--fg-secondary)]">{asset.type_name}</p>
                  {asset.manufacturer && <p className="text-xs text-[var(--fg-muted)]">{asset.manufacturer} {asset.model}</p>}
                  <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--fg-muted)] truncate flex items-center gap-1.5">
                      {isAssigned
                        ? <><Icon name="userCheck" size={12} className="text-[var(--accent)] shrink-0" /> {asset.assigned_user_name || "Org"}</>
                        : "Unassigned"}
                    </span>
                    {asset.condition && <Badge tone={COND_TONE[asset.condition] || "slate"} size="sm" className="capitalize shrink-0">{asset.condition}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <AssetModal
        open={showModal}
        asset={editingAsset}
        onClose={() => setShowModal(false)}
        onSaved={loadAssets}
      />

      <CheckoutModal
        open={!!checkoutAsset}
        asset={checkoutAsset}
        onClose={() => setCheckoutAsset(null)}
        onDone={() => { setCheckoutAsset(null); loadAssets(); }}
      />

      {/* Detail panel overlay */}
      {detailAsset && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setDetailAsset(null)} />
          <AssetDetailPanel
            asset={detailAsset}
            onClose={() => setDetailAsset(null)}
            onEdit={() => { openEdit(detailAsset); setDetailAsset(null); }}
            onCheckout={() => { setCheckoutAsset(detailAsset); setDetailAsset(null); }}
            onCheckin={() => { handleCheckin(detailAsset); setDetailAsset(null); }}
            onRefresh={loadAssets}
          />
        </>
      )}

      {confirmDialog}
    </div>
  );
}
