/**
 * AssetDetailPanel — Slide-out side panel showing full asset detail
 * Shows: Overview, Maintenance History, Linked Tickets, Assignment History
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Skeleton from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";

function cn(...p) { return p.filter(Boolean).join(" "); }

// Loading placeholder for the lazy-loaded sub-tab lists
function SubSkeleton() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-default)] space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-32" rounded="rounded-md" />
            <Skeleton className="h-4 w-16" rounded="rounded-full" />
          </div>
          <Skeleton className="h-2.5 w-40" rounded="rounded-md" />
        </div>
      ))}
    </div>
  );
}

const STATUS_TONE = { active:"emerald", maintenance:"amber", retired:"rose", inactive:"slate" };
const COND_TONE   = { new:"emerald", excellent:"emerald", good:"blue", fair:"amber", poor:"rose", damaged:"rose" };

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--border-default)] last:border-0">
      <span className="text-xs text-[var(--fg-muted)] w-32 shrink-0">{label}</span>
      <span className="text-xs font-medium text-[var(--fg-primary)] text-right flex-1">{value}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-label mb-2 mt-5 first:mt-0">{children}</p>
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
      "fixed inset-y-0 right-0 z-50 w-full max-w-[440px] flex flex-col",
      "bg-[var(--bg-elevated)] border-l border-[var(--border-default)]",
      "shadow-[var(--shadow-elevated)]",
      "animate-slide-in-right"
    )}>
      {/* Header */}
      <div className="relative shrink-0 px-5 py-5 border-b border-[var(--border-default)] overflow-hidden">
        <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-11 w-11 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/15 flex items-center justify-center shrink-0">
              <Icon name="monitor" size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[var(--fg-primary)] truncate tracking-tight">{asset.name}</h2>
              <p className="text-xs text-[var(--fg-muted)] font-mono mb-2">{asset.asset_tag}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge tone={STATUS_TONE[asset.status] || "slate"} size="sm" dot className="capitalize">{asset.status}</Badge>
                {asset.condition && <Badge tone={COND_TONE[asset.condition] || "slate"} size="sm" className="capitalize">{asset.condition}</Badge>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)] transition-all shrink-0">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 py-3.5 border-b border-[var(--border-default)] shrink-0">
        <Button size="sm" variant="secondary" icon={<Icon name="pencil" size={13} />} onClick={onEdit} className="flex-1">Edit</Button>
        {isAssigned
          ? <Button size="sm" variant="secondary" icon={<Icon name="download" size={13} />} onClick={onCheckin} className="flex-1">Check In</Button>
          : <Button size="sm" icon={<Icon name="userPlus" size={13} />} onClick={onCheckout} className="flex-1">Check Out</Button>
        }
      </div>

      {/* Inner tabs */}
      <div className="relative flex items-center gap-1 border-b border-[var(--border-default)] shrink-0 px-3 overflow-x-auto scrollbar-none">
        {DETAIL_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
                active ? "text-[var(--fg-primary)]" : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
              )}>
              <Icon name={t.icon} size={14} className={active ? "text-[var(--accent)]" : "text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"} />
              {t.label}
              <span className={cn(
                "absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-[var(--accent)] transition-all duration-300",
                active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50"
              )} />
            </button>
          );
        })}
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
                "flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-xs font-medium",
                warrantyDays < 0 ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" :
                warrantyDays < 30 ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              )}>
                <Icon name={warrantyDays < 0 ? "alertCircle" : "shield"} size={14} className="shrink-0" />
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
          <div className="space-y-2.5">
            {loading ? <SubSkeleton />
            : maintenance.length === 0 ? (
              <EmptyState icon="tool" title="No maintenance records" description="Maintenance work for this asset will appear here." compact />
            ) : maintenance.map((m) => (
              <div key={m.id} className="p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium text-[var(--fg-primary)] truncate">{m.title}</span>
                  <Badge size="sm" dot className="capitalize shrink-0" tone={m.status==="completed"?"emerald":m.status==="cancelled"?"slate":m.status==="in_progress"?"blue":"amber"}>
                    {m.status.replace("_"," ")}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--fg-muted)] capitalize">{m.maintenance_type} · {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : "No date"}</p>
                {m.cost && <p className="text-xs text-[var(--fg-secondary)] mt-1 tabular-nums">Cost: FJD {Number(m.cost).toFixed(2)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── TICKETS ── */}
        {tab === "tickets" && (
          <div className="space-y-2.5">
            {loading ? <SubSkeleton />
            : tickets.length === 0 ? (
              <EmptyState icon="ticket" title="No linked tickets" description="Tickets referencing this asset will show up here." compact />
            ) : tickets.map((t) => (
              <div key={t.id} className="p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono font-semibold text-[var(--accent)]">#{t.id}</span>
                  <Badge tone="blue" size="sm" className="shrink-0">{t.status_label || t.status_id}</Badge>
                </div>
                <p className="text-sm font-medium text-[var(--fg-primary)]">{t.subject}</p>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <div className="space-y-2.5">
            {loading ? <SubSkeleton />
            : history.length === 0 ? (
              <EmptyState icon="clock" title="No assignment history" description="Checkout and check-in events for this asset will be listed here." compact />
            ) : history.map((h) => (
              <div key={h.id} className="p-3.5 rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-[var(--fg-primary)] truncate">
                    {h.assigned_user_name || h.assigned_org_name || "Unknown"}
                  </span>
                  <Badge tone={h.checked_in_at ? "slate" : "emerald"} size="sm" dot={!h.checked_in_at} className="shrink-0">
                    {h.checked_in_at ? "Returned" : "Active"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">
                  Out: {new Date(h.checked_out_at).toLocaleDateString()}
                  {h.checked_in_at && ` · In: ${new Date(h.checked_in_at).toLocaleDateString()}`}
                </p>
                {h.location && (
                  <p className="text-xs text-[var(--fg-muted)] mt-0.5 flex items-center gap-1">
                    <Icon name="globe" size={11} className="shrink-0" /> {h.location}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
