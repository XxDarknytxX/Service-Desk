/**
 * AssetReportsTab — Asset analytics, stats, warranty alerts, depreciation
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import Badge from "../ui/Badge";
import Icon from "../ui/Icon";

function cn(...p) { return p.filter(Boolean).join(" "); }

const COLOR_BAR = {
  blue:"bg-blue-500", purple:"bg-purple-500", emerald:"bg-emerald-500",
  amber:"bg-amber-500", rose:"bg-rose-500", slate:"bg-slate-500",
  cyan:"bg-cyan-500", orange:"bg-orange-500",
};

function StatCard({ label, value, icon, tone = "blue", sub }) {
  const tones = {
    blue:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    rose:    "bg-rose-500/10 text-rose-400 border-rose-500/20",
    slate:   "bg-slate-500/10 text-slate-400 border-slate-500/20",
    purple:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <div className="p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", tones[tone])}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--fg-primary)] mb-0.5">{value ?? "—"}</p>
      <p className="text-sm text-[var(--fg-secondary)]">{label}</p>
      {sub && <p className="text-xs text-[var(--fg-muted)] mt-1">{sub}</p>}
    </div>
  );
}

function HBar({ label, value, total, color = "blue" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-[var(--fg-secondary)] w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-base)]">
        <div className={cn("h-2 rounded-full transition-all duration-700", COLOR_BAR[color] || "bg-blue-500")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-[var(--fg-primary)] w-8 text-right">{value}</span>
      <span className="text-xs text-[var(--fg-muted)] w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function AssetReportsTab() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setStats(await assetsApi.getStats()); }
    catch { /* silent */ }
    finally { setLoading(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent)] animate-spin" />
    </div>
  );

  if (!stats) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Icon name="alert" size={28} className="text-[var(--fg-muted)] mb-2" />
      <p className="text-sm text-[var(--fg-muted)]">Failed to load statistics</p>
    </div>
  );

  const { totals, byCategory, byType, warrantyExpiring, recentMaintenance } = stats;
  const totalAssets = Number(totals?.total || 0);

  const fmtMoney = (v) => v != null && v > 0
    ? `FJD ${Number(v).toLocaleString("en-FJ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "FJD 0";

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-FJ", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  return (
    <div className="overflow-y-auto scrollbar-none h-full space-y-6">
      {/* Summary KPIs */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3">Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Assets"   value={totals?.total}       icon="assets"   tone="blue" />
          <StatCard label="Active"         value={totals?.active}      icon="check"    tone="emerald" />
          <StatCard label="Maintenance"    value={totals?.maintenance} icon="tool"     tone="amber" />
          <StatCard label="Retired"        value={totals?.retired}     icon="archive"  tone="rose" />
          <StatCard label="Assigned"       value={totals?.assigned}    icon="userPlus" tone="purple" />
          <StatCard label="Unassigned"     value={totals?.unassigned}  icon="user"     tone="slate" />
        </div>
      </section>

      {/* Financial KPIs */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3">Financial Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Purchase Cost"  value={fmtMoney(totals?.total_cost)}          icon="creditCard"  tone="blue"
            sub="Sum of all asset purchase prices" />
          <StatCard label="Total Current Value"  value={fmtMoney(totals?.total_current_value)} icon="trendingUp"  tone="emerald"
            sub="Sum of estimated current values" />
        </div>
      </section>

      {/* By Category */}
      {byCategory?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3">Assets by Category</h3>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            {byCategory.map((c) => (
              <HBar key={c.name} label={c.name} value={Number(c.count)} total={totalAssets} color={c.color || "blue"} />
            ))}
          </div>
        </section>
      )}

      {/* By Type (top 10) */}
      {byType?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3">Assets by Type (Top 10)</h3>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            {byType.map((t) => (
              <HBar key={t.name} label={t.name} value={Number(t.count)} total={totalAssets} color="blue" />
            ))}
          </div>
        </section>
      )}

      {/* Warranty expiring */}
      {warrantyExpiring?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3 flex items-center gap-2">
            <Icon name="shield" size={15} className="text-amber-400" />
            Warranty Expiring (next 90 days)
          </h3>
          <div className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                  {["Asset","Type","Expiry Date","Days Remaining"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {warrantyExpiring.map((a) => {
                  const days = Number(a.days_remaining);
                  return (
                    <tr key={a.id} className="hover:bg-[var(--bg-base)] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-[var(--fg-primary)]">{a.name}</p>
                        <p className="text-xs text-[var(--fg-muted)] font-mono">{a.asset_tag}</p>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--fg-secondary)]">{a.type_name || "—"}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-[var(--fg-secondary)]">{fmtDate(a.warranty_expiry_date)}</span></td>
                      <td className="px-4 py-3">
                        <Badge tone={days <= 7 ? "rose" : days <= 30 ? "amber" : "blue"}>
                          {days === 0 ? "Today" : `${days} days`}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Upcoming maintenance */}
      {recentMaintenance?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[var(--fg-primary)] mb-3 flex items-center gap-2">
            <Icon name="tool" size={15} className="text-blue-400" />
            Upcoming Maintenance
          </h3>
          <div className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                  {["Asset","Title","Status","Scheduled"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {recentMaintenance.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg-base)] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[var(--fg-primary)]">{m.asset_name}</p>
                      <p className="text-xs text-[var(--fg-muted)] font-mono">{m.asset_tag}</p>
                    </td>
                    <td className="px-4 py-3"><span className="text-sm text-[var(--fg-primary)]">{m.title}</span></td>
                    <td className="px-4 py-3">
                      <Badge tone={m.status==="in_progress"?"amber":"blue"}>{m.status.replace("_"," ")}</Badge>
                    </td>
                    <td className="px-4 py-3"><span className="text-sm text-[var(--fg-secondary)]">{fmtDate(m.scheduled_date)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {totalAssets === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <Icon name="barChart" size={36} className="text-[var(--fg-muted)] mb-3" />
          <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No data yet</p>
          <p className="text-sm text-[var(--fg-muted)]">Add assets to see reports and analytics</p>
        </div>
      )}
    </div>
  );
}
