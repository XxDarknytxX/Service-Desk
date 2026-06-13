/**
 * AssignmentsTab — Checkout / Checkin history across all assets
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Badge from "../ui/Badge";
import Icon from "../ui/Icon";
import Tabs from "../ui/Tabs";
import { SkeletonTable } from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";

function cn(...p) { return p.filter(Boolean).join(" "); }

export default function AssignmentsTab() {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);

  useEffect(() => { load(); }, [activeOnly]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (activeOnly) params.active_only = "true";
      const data = await assetsApi.getAssignments(params);
      setRecords(data);
    } catch (e) {
      toast.error(e?.message || "Failed to load assignment history");
    }
    finally { setLoading(false); }
  }

  async function handleCheckin(record) {
    try {
      await assetsApi.checkin(record.asset_id, {});
      toast.success("Asset checked in");
      load();
    } catch (e) {
      toast.error(e?.message || "Failed to check in asset");
    }
  }

  const fmtDate = (d) => d
    ? new Date(d).toLocaleString("en-FJ", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
    : "—";

  const duration = (outAt, inAt) => {
    const ms = (inAt ? new Date(inAt) : new Date()) - new Date(outAt);
    const days = Math.floor(ms / 86400000);
    if (days === 0) return "< 1 day";
    return `${days}d`;
  };

  return (
    <div className="flex flex-col h-full gap-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <Tabs
          variant="pills"
          size="sm"
          tabs={[
            { value: "all",    label: "All Assignments" },
            { value: "active", label: "Currently Checked Out" },
          ]}
          value={activeOnly ? "active" : "all"}
          onChange={(v) => setActiveOnly(v === "active")}
        />
        <Badge tone="slate" className="tabular-nums">{records.length} records</Badge>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : records.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <EmptyState
              icon="userPlus"
              title="No assignment records"
              description="Check out assets from the Inventory tab to start tracking assignment history here."
            />
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                    {["Asset","Assigned To","Location","Checked Out","Checked In","Duration","Status","Actioned By",""].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-label whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {records.map((r) => {
                    const isActive = !r.checked_in_at;
                    const isOverdue = isActive && ((new Date() - new Date(r.checked_out_at)) / 86400000) > 30;
                    return (
                      <tr key={r.id} className={cn("group transition-colors duration-150 hover:bg-[var(--bg-surface)]", !isActive && "opacity-75")}>
                        <td className="px-4 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-[var(--fg-primary)]">{r.asset_name}</p>
                            <p className="text-xs text-[var(--fg-muted)] font-mono">{r.asset_tag}</p>
                            <p className="text-xs text-[var(--fg-muted)]">{r.type_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {r.assigned_user_name || r.assigned_org_name ? (
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[11px] font-semibold text-[var(--accent)] shrink-0">
                                {(r.assigned_user_name || r.assigned_org_name)[0].toUpperCase()}
                              </span>
                              <span className="text-sm text-[var(--fg-secondary)]">{r.assigned_user_name || r.assigned_org_name}</span>
                            </div>
                          ) : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[var(--fg-secondary)]">{r.location || "—"}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[var(--fg-secondary)] whitespace-nowrap">{fmtDate(r.checked_out_at)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[var(--fg-secondary)] whitespace-nowrap">{fmtDate(r.checked_in_at)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", isOverdue ? "text-rose-500" : "text-[var(--fg-secondary)]")}>
                            {duration(r.checked_out_at, r.checked_in_at)}
                            {isOverdue && <Icon name="alertTriangle" size={11} />}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {isActive
                            ? <Badge tone={isOverdue ? "rose" : "emerald"} size="sm" dot>{isOverdue ? "Overdue" : "Active"}</Badge>
                            : <Badge tone="slate" size="sm">Returned</Badge>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            {r.checked_out_by_name && <p className="text-xs text-[var(--fg-muted)]">Out: {r.checked_out_by_name}</p>}
                            {r.checked_in_by_name  && <p className="text-xs text-[var(--fg-muted)]">In: {r.checked_in_by_name}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {isActive && (
                            <button onClick={() => handleCheckin(r)}
                              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)] transition-all whitespace-nowrap">
                              <Icon name="download" size={13} /> Check In
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
