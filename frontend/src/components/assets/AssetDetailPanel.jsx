/**
 * AssetDetailPanel — Slide-out side panel showing full asset detail
 * Shows: Overview, Maintenance History, Linked Tickets, Assignment History
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

function cn(...p) { return p.filter(Boolean).join(" "); }

const STATUS_TONE = { active:"emerald", maintenance:"amber", retired:"rose", inactive:"slate" };
const COND_TONE   = { new:"emerald", excellent:"emerald", good:"blue", fair:"amber", poor:"rose", damaged:"rose" };

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[var(--border-default)] last:border-0">
      <span className="text-xs text-[var(--fg-muted)] w-32 shrink-0">{label}</span>
      <span className="text-xs text-[var(--fg-primary)] text-right flex-1">{value}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-2 mt-4">{children}</p>
  );
}

export default function AssetDetailPanel({ asset, onClose, onEdit, onCheckout, onCheckin, onRefresh }) {
  const [tab, setTab]           = useState("overview");
  const [maintenance, setMaint] = useState([]);
  const [tickets, setTickets]   = useState([]);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!asset) return;
    setTab("overview");
    loadSub("maintenance");
  }, [asset?.id]);

  useEffect(() => {
    if (!asset) return;
    if (tab === "maintenance" && !maintenance.length) loadSub("maintenance");
    if (tab === "tickets"     && !tickets.length)     loadSub("tickets");
    if (tab === "history"     && !history.length)     loadSub("history");
  }, [tab]);

  async function loadSub(type) {
    setLoading(true);
    try {
      if (type === "maintenance") setMaint(await assetsApi.getAssetMaintenance(asset.id));
      if (type === "tickets")     setTickets(await assetsApi.getAssetTickets(asset.id));
      if (type === "history")     setHistory(await assetsApi.getAssetAssignments(asset.id));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  if (!asset) return null;

  const isAssigned = !!(asset.assigned_to_user_id || asset.assigned_to_org_id);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-FJ", { year:"numeric", month:"short", day:"numeric" }) : "—";
  const fmtMoney = (v) => v != null ? `FJD ${Number(v).toLocaleString("en-FJ", { minimumFractionDigits:2 })}` : "—";

  const warrantyDays = asset.warranty_expiry_date
    ? Math.ceil((new Date(asset.warranty_expiry_date) - new Date()) / 86400000)
    : null;

  const DETAIL_TABS = [
    { key:"overview",    label:"Overview",    icon:"info" },
    { key:"maintenance", label:"Maintenance", icon:"tool" },
    { key:"tickets",     label:"Tickets",     icon:"ticket" },
    { key:"history",     label:"History",     icon:"clock" },
  ];

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 z-50 w-[420px] flex flex-col",
      "bg-[var(--bg-elevated)] border-l border-[var(--border-default)]",
      "shadow-[-8px_0_32px_rgba(0,0,0,0.4)]",
      "animate-slide-in-right"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border-default)] shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={STATUS_TONE[asset.status] || "slate"}>{asset.status}</Badge>
            {asset.condition && <Badge tone={COND_TONE[asset.condition] || "slate"}>{asset.condition}</Badge>}
          </div>
          <h2 className="text-base font-semibold text-[var(--fg-primary)] truncate">{asset.name}</h2>
          <p className="text-xs text-[var(--fg-muted)] font-mono">{asset.asset_tag}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)] transition-all">
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 py-3 border-b border-[var(--border-default)] shrink-0">
        <Button size="sm" variant="secondary" icon={<Icon name="pencil" size={13} />} onClick={onEdit} className="flex-1">Edit</Button>
        {isAssigned
          ? <Button size="sm" variant="secondary" icon={<Icon name="download" size={13} />} onClick={onCheckin} className="flex-1">Check In</Button>
          : <Button size="sm" icon={<Icon name="userPlus" size={13} />} onClick={onCheckout} className="flex-1">Check Out</Button>
        }
      </div>

      {/* Inner tabs */}
      <div className="flex border-b border-[var(--border-default)] shrink-0 px-3 pt-2">
        {DETAIL_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-all",
              tab === t.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            )}>
            <Icon name={t.icon} size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-5">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-1">
            <SectionTitle>Asset Info</SectionTitle>
            <Row label="Type"        value={asset.type_name} />
            <Row label="Category"    value={asset.category_name} />
            <Row label="Manufacturer" value={asset.manufacturer} />
            <Row label="Model"       value={asset.model} />
            <Row label="Serial No."  value={asset.serial_number} />

            <SectionTitle>Location & Assignment</SectionTitle>
            <Row label="Location"    value={asset.location || "—"} />
            <Row label="Department"  value={asset.department_name} />
            <Row label="Assigned To" value={asset.assigned_user_name || asset.assigned_org_name || "Unassigned"} />

            <SectionTitle>Financial</SectionTitle>
            <Row label="Supplier"    value={asset.supplier} />
            <Row label="Order No."   value={asset.order_number} />
            <Row label="Purchase Date" value={fmtDate(asset.purchase_date)} />
            <Row label="Purchase Cost" value={fmtMoney(asset.purchase_cost)} />
            <Row label="Current Value" value={fmtMoney(asset.current_value)} />
            <Row label="Depreciation"  value={asset.depreciation_rate ? `${asset.depreciation_rate}% / yr` : null} />
            <Row label="Expected Life"  value={asset.expected_lifespan_years ? `${asset.expected_lifespan_years} years` : null} />

            <SectionTitle>Warranty</SectionTitle>
            <Row label="Expiry Date"   value={fmtDate(asset.warranty_expiry_date)} />
            {warrantyDays !== null && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                warrantyDays < 0 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                warrantyDays < 30 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              )}>
                <Icon name={warrantyDays < 0 ? "alert" : "shield"} size={13} />
                {warrantyDays < 0 ? `Expired ${Math.abs(warrantyDays)} days ago` :
                 warrantyDays === 0 ? "Expires today" :
                 `${warrantyDays} days remaining`}
              </div>
            )}

            {asset.notes && (
              <>
                <SectionTitle>Notes</SectionTitle>
                <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{asset.notes}</p>
              </>
            )}
          </div>
        )}

        {/* ── MAINTENANCE ── */}
        {tab === "maintenance" && (
          <div className="space-y-2">
            {loading ? <p className="text-xs text-[var(--fg-muted)] text-center py-8">Loading…</p>
            : maintenance.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="tool" size={28} className="text-[var(--fg-muted)] mx-auto mb-2" />
                <p className="text-xs text-[var(--fg-muted)]">No maintenance records</p>
              </div>
            ) : maintenance.map((m) => (
              <div key={m.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--fg-primary)]">{m.title}</span>
                  <Badge tone={m.status==="completed"?"emerald":m.status==="cancelled"?"slate":m.status==="in_progress"?"blue":"amber"}>
                    {m.status.replace("_"," ")}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">{m.maintenance_type} · {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "No date"}</p>
                {m.cost && <p className="text-xs text-[var(--fg-secondary)] mt-1">Cost: FJD {Number(m.cost).toFixed(2)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── TICKETS ── */}
        {tab === "tickets" && (
          <div className="space-y-2">
            {loading ? <p className="text-xs text-[var(--fg-muted)] text-center py-8">Loading…</p>
            : tickets.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="ticket" size={28} className="text-[var(--fg-muted)] mx-auto mb-2" />
                <p className="text-xs text-[var(--fg-muted)]">No linked tickets</p>
              </div>
            ) : tickets.map((t) => (
              <div key={t.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-[var(--fg-muted)]">#{t.id}</span>
                  <Badge tone="blue">{t.status_label || t.status_id}</Badge>
                </div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">{t.subject}</p>
                <p className="text-xs text-[var(--fg-muted)]">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <div className="space-y-2">
            {loading ? <p className="text-xs text-[var(--fg-muted)] text-center py-8">Loading…</p>
            : history.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="clock" size={28} className="text-[var(--fg-muted)] mx-auto mb-2" />
                <p className="text-xs text-[var(--fg-muted)]">No assignment history</p>
              </div>
            ) : history.map((h) => (
              <div key={h.id} className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--fg-primary)]">
                    {h.assigned_user_name || h.assigned_org_name || "Unknown"}
                  </span>
                  <Badge tone={h.checked_in_at ? "slate" : "emerald"}>
                    {h.checked_in_at ? "Returned" : "Active"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">
                  Out: {new Date(h.checked_out_at).toLocaleDateString()}
                  {h.checked_in_at && ` · In: ${new Date(h.checked_in_at).toLocaleDateString()}`}
                </p>
                {h.location && <p className="text-xs text-[var(--fg-muted)]">📍 {h.location}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
