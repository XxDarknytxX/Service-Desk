/**
 * AssignmentsTab — Checkout / Checkin history across all assets
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

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
    <div className="flex flex-col h-full gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          {[
            { key: false, label: "All Assignments" },
            { key: true,  label: "Currently Checked Out" },
          ].map((o) => (
            <button key={String(o.key)} onClick={() => setActiveOnly(o.key)}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded-md transition-all",
                activeOnly === o.key
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(230,0,0,0.3)]"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
              )}>
              {o.label}
            </button>
          ))}
        </div>
        <Badge tone="slate">{records.length} records</Badge>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent)] animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <Icon name="userPlus" size={36} className="text-[var(--fg-muted)] mb-3" />
            <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No assignment records</p>
            <p className="text-sm text-[var(--fg-muted)]">Check out assets from the Assets tab</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                  {["Asset","Assigned To","Location","Checked Out","Checked In","Duration","Status","Actioned By",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {records.map((r) => {
                  const isActive = !r.checked_in_at;
                  const isOverdue = isActive && ((new Date() - new Date(r.checked_out_at)) / 86400000) > 30;
                  return (
                    <tr key={r.id} className={cn("group transition-colors", isActive ? "hover:bg-[var(--bg-base)]" : "hover:bg-[var(--bg-base)] opacity-75")}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--fg-primary)]">{r.asset_name}</p>
                          <p className="text-xs text-[var(--fg-muted)] font-mono">{r.asset_tag}</p>
                          <p className="text-xs text-[var(--fg-muted)]">{r.type_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.assigned_user_name || r.assigned_org_name ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[11px] font-bold text-[var(--accent)]">
                              {(r.assigned_user_name || r.assigned_org_name)[0].toUpperCase()}
                            </div>
                            <span className="text-sm text-[var(--fg-secondary)]">{r.assigned_user_name || r.assigned_org_name}</span>
                          </div>
                        ) : <span className="text-sm text-[var(--fg-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--fg-secondary)]">{r.location || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-[var(--fg-secondary)] whitespace-nowrap">{fmtDate(r.checked_out_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-[var(--fg-secondary)] whitespace-nowrap">{fmtDate(r.checked_in_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-medium", isOverdue ? "text-rose-400" : "text-[var(--fg-secondary)]")}>
                          {duration(r.checked_out_at, r.checked_in_at)}
                          {isOverdue && " ⚠️"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isActive
                          ? <Badge tone={isOverdue ? "rose" : "emerald"}>{isOverdue ? "Overdue" : "Active"}</Badge>
                          : <Badge tone="slate">Returned</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {r.checked_out_by_name && <p className="text-xs text-[var(--fg-muted)]">Out: {r.checked_out_by_name}</p>}
                          {r.checked_in_by_name  && <p className="text-xs text-[var(--fg-muted)]">In: {r.checked_in_by_name}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isActive && (
                          <button onClick={() => handleCheckin(r)}
                            className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:border-[var(--border-hover)] transition-all whitespace-nowrap">
                            Check In
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
