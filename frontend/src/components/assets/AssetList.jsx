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
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1.5">Assign To *</label>
          <input
            type="text" value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); if (!e.target.value) setUserId(""); }}
            placeholder="Search users..."
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          {userSearch && !userId && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg">
              {filteredUsers.slice(0, 8).map((u) => (
                <button key={u.id} type="button"
                  onClick={() => { setUserId(u.id); setUserSearch(u.full_name || u.email); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-base)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <span className="font-medium">{u.full_name || u.email}</span>
                    {u.title && <span className="text-xs text-[var(--fg-muted)] ml-2">{u.title}</span>}
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="px-3 py-2 text-sm text-[var(--fg-muted)]">No users found</p>
              )}
            </div>
          )}
          {userId && (
            <div className="mt-1 flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--accent)]/5 border border-[var(--accent)]/20">
              <span className="text-xs text-[var(--accent)] font-medium">Selected:</span>
              <span className="text-xs text-[var(--fg-primary)]">{userSearch}</span>
              <button type="button" onClick={() => { setUserId(""); setUserSearch(""); }} className="ml-auto text-[var(--fg-muted)] hover:text-rose-400">
                <Icon name="close" size={12} />
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1.5">Location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this going?"
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg-secondary)] mb-1.5">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes"
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" />
        </div>
      </div>
    </Modal>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────
function BulkBar({ selected, onClear, onBulkAction }) {
  const n = selected.length;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25">
      <span className="text-sm font-medium text-[var(--accent)]">{n} selected</span>
      <div className="flex gap-2 ml-auto">
        {[
          { label:"Set Active",      v:"active",      tone:"emerald" },
          { label:"Set Maintenance", v:"maintenance", tone:"amber" },
          { label:"Set Retired",     v:"retired",     tone:"rose" },
        ].map((a) => (
          <button key={a.v} onClick={() => onBulkAction("status", a.v)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)] transition-all">
            {a.label}
          </button>
        ))}
        <button onClick={() => onBulkAction("delete")}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all">
          Delete
        </button>
        <button onClick={onClear} className="px-3 py-1.5 text-xs font-medium rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-all">
          Clear
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
    : <Icon name="chevronDown" size={12} className="text-[var(--fg-muted)] opacity-40" />;

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

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {[
          { label: "Total Assets", value: totalAssets, icon: "box", color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Active", value: activeCount, icon: "check", color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Assigned", value: assignedCount, icon: "userCheck", color: "text-violet-400", bg: "bg-violet-500/10" },
          { label: "Maintenance", value: maintenanceCount, icon: "tool", color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", s.bg)}>
              <Icon name={s.icon} size={18} className={s.color} />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--fg-primary)]">{s.value}</p>
              <p className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, tag, serial, manufacturer…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]">
              <Icon name="close" size={13} />
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
              className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer transition-all">
              {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <Icon name="chevronDown" size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
          </div>
        ))}

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div className="flex rounded-lg border border-[var(--border-default)] overflow-hidden">
            {[["table","list"], ["grid","grid"]].map(([v, icon]) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={cn("px-3 py-2 transition-all", viewMode===v ? "bg-[var(--accent)] text-white" : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]")}>
                <Icon name={icon} size={15} />
              </button>
            ))}
          </div>
          <Badge tone="slate">{assets.length} assets</Badge>
          <Button icon={<Icon name="plus" size={15} />} onClick={openCreate}>Add Asset</Button>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 && (
        <BulkBar selected={selected} onClear={() => setSelected([])} onBulkAction={handleBulkAction} />
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent)] animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <Icon name="assets" size={36} className="text-[var(--fg-muted)] mb-3" />
            <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No assets found</p>
            <p className="text-sm text-[var(--fg-muted)] mb-4">Try adjusting filters or add a new asset</p>
            <Button icon={<Icon name="plus" size={14} />} onClick={openCreate}>Add Asset</Button>
          </div>
        ) : viewMode === "table" ? (
          /* ── TABLE VIEW ── */
          <div className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={selected.length === sorted.length && sorted.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  {COLS.map((c) => (
                    <th key={c.key} onClick={() => c.sortable && toggleSort(c.key)}
                      className={cn("text-left px-4 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider whitespace-nowrap", c.sortable && "cursor-pointer hover:text-[var(--fg-primary)]")}>
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
                      className={cn("group transition-colors cursor-pointer", isSelected ? "bg-[var(--accent)]/5" : "hover:bg-[var(--bg-base)]")}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(asset.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--fg-primary)]">{asset.name}</p>
                          <p className="text-xs text-[var(--fg-muted)] font-mono">{asset.asset_tag}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <Badge tone="blue" size="sm">{asset.type_name}</Badge>
                          {asset.category_name && <p className="text-xs text-[var(--fg-muted)] mt-0.5">{asset.category_name}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--fg-secondary)]">
                          {[asset.manufacturer, asset.model].filter(Boolean).join(" / ") || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {asset.condition
                          ? <Badge tone={COND_TONE[asset.condition] || "slate"}>{asset.condition}</Badge>
                          : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[asset.status] || "slate"}>{asset.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {isAssigned ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]">
                              {(asset.assigned_user_name || asset.assigned_org_name || "?")[0].toUpperCase()}
                            </div>
                            <span className="text-sm text-[var(--fg-secondary)] truncate max-w-[120px]">
                              {asset.assigned_user_name || asset.assigned_org_name}
                            </span>
                          </div>
                        ) : <span className="text-sm text-[var(--fg-muted)]">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-[var(--fg-muted)] truncate max-w-[100px] block">{asset.location || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {wDays !== null ? (
                          <span className={cn("text-xs font-medium", wDays < 0 ? "text-rose-400" : wDays < 30 ? "text-amber-400" : "text-emerald-400")}>
                            {wDays < 0 ? `Expired` : `${wDays}d`}
                          </span>
                        ) : <span className="text-xs text-[var(--fg-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(asset)}
                            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all" title="Edit">
                            <Icon name="pencil" size={13} />
                          </button>
                          {isAssigned ? (
                            <button onClick={() => handleCheckin(asset)}
                              className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-amber-400 hover:bg-amber-500/10 transition-all" title="Check In">
                              <Icon name="download" size={13} />
                            </button>
                          ) : (
                            <button onClick={() => setCheckoutAsset(asset)}
                              className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Check Out">
                              <Icon name="userPlus" size={13} />
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
        ) : (
          /* ── GRID VIEW ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((asset) => {
              const isAssigned = !!(asset.assigned_to_user_id || asset.assigned_to_org_id);
              return (
                <div key={asset.id} onClick={() => setDetailAsset(asset)}
                  className="group relative p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--accent)]/40 hover:shadow-[0_0_12px_rgba(230,0,0,0.08)] transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center">
                      <Icon name="monitor" size={20} className="text-[var(--fg-muted)]" />
                    </div>
                    <Badge tone={STATUS_TONE[asset.status] || "slate"}>{asset.status}</Badge>
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg-primary)] mb-0.5 truncate">{asset.name}</p>
                  <p className="text-xs text-[var(--fg-muted)] font-mono mb-2">{asset.asset_tag}</p>
                  <p className="text-xs text-[var(--fg-secondary)]">{asset.type_name}</p>
                  {asset.manufacturer && <p className="text-xs text-[var(--fg-muted)]">{asset.manufacturer} {asset.model}</p>}
                  <div className="mt-3 pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
                    <span className="text-xs text-[var(--fg-muted)]">
                      {isAssigned ? `👤 ${asset.assigned_user_name || "Org"}` : "Unassigned"}
                    </span>
                    {asset.condition && <Badge tone={COND_TONE[asset.condition] || "slate"} size="sm">{asset.condition}</Badge>}
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
