/**
 * AssetReportsTab — Asset analytics, stats, warranty alerts, depreciation.
 * Premium Vodafone language: KPI cards, icon-tile section headers, skeleton
 * loading, empty states, canonical tables. Stats logic preserved.
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import Badge from "../ui/Badge";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { SkeletonKpis, SkeletonCard } from "../ui/Skeleton";

function cn(...p) { return p.filter(Boolean).join(" "); }

const COLOR_BAR = {
  blue:"bg-blue-500", purple:"bg-purple-500", emerald:"bg-emerald-500",
  amber:"bg-amber-500", rose:"bg-rose-500", slate:"bg-slate-500",
  cyan:"bg-cyan-500", orange:"bg-orange-500",
};

const STAT_TONES = {
  blue:    "bg-blue-500/10 text-blue-500 border-blue-500/15",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/15",
  amber:   "bg-amber-500/10 text-amber-500 border-amber-500/15",
  rose:    "bg-rose-500/10 text-rose-500 border-rose-500/15",
  slate:   "bg-slate-500/10 text-slate-500 border-slate-500/15",
  purple:  "bg-purple-500/10 text-purple-500 border-purple-500/15",
};

function StatCard({ label, value, icon, tone = "blue", sub }) {
  return (
    <div className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-start justify-between mb-3">
        <span className="text-label">{label}</span>
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center border", STAT_TONES[tone] || STAT_TONES.blue)}>
          <Icon name={icon} size={16} />
        </div>
      </div>
      <p className="text-[26px] leading-none font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">{value ?? "—"}</p>
      {sub && <p className="text-xs text-[var(--fg-muted)] mt-2">{sub}</p>}
    </div>
  );
}

function Panel({ icon, iconTone = "blue", title, children }) {
  return (
    <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border-default)]">
        <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center", STAT_TONES[iconTone] || STAT_TONES.blue)}>
          <Icon name={icon} size={16} />
        </span>
        <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function HBar({ label, value, total, color = "blue" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-[var(--fg-secondary)] w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-surface)]">
        <div className={cn("h-2 rounded-full transition-all duration-700", COLOR_BAR[color] || "bg-blue-500")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-[var(--fg-primary)] w-8 text-right tabular-nums">{value}</span>
      <span className="text-xs text-[var(--fg-muted)] w-10 text-right tabular-nums">{pct}%</span>
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
    <div className="space-y-6 animate-fade-in">
      <SkeletonKpis count={6} />
      <SkeletonCard height="h-56" />
    </div>
  );

  if (!stats) return (
    <EmptyState
      icon="alertTriangle"
      tone="rose"
      title="Failed to load statistics"
      description="We couldn't fetch asset analytics. Please try again."
      action={<Button variant="secondary" size="sm" onClick={load} icon={<Icon name="refresh" size={14} />}>Retry</Button>}
    />
  );

  const { totals, byCategory, byType, warrantyExpiring, recentMaintenance } = stats;
  const totalAssets = Number(totals?.total || 0);

  const fmtMoney = (v) => v != null && v > 0
    ? `FJD ${Number(v).toLocaleString("en-FJ", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "FJD 0";

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-FJ", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  if (totalAssets === 0) {
    return (
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
        <EmptyState
          icon="barChart"
          title="No data yet"
          description="Add assets to see reports and analytics."
        />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto scrollbar-none h-full space-y-6">
      {/* Summary KPIs */}
      <div>
        <p className="text-label mb-3">Overview</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Assets"   value={totals?.total}       icon="assets"   tone="blue" />
          <StatCard label="Active"         value={totals?.active}      icon="check"    tone="emerald" />
          <StatCard label="Maintenance"    value={totals?.maintenance} icon="tool"     tone="amber" />
          <StatCard label="Retired"        value={totals?.retired}     icon="archive"  tone="rose" />
          <StatCard label="Assigned"       value={totals?.assigned}    icon="userPlus" tone="purple" />
          <StatCard label="Unassigned"     value={totals?.unassigned}  icon="user"     tone="slate" />
        </div>
      </div>

      {/* Financial KPIs */}
      <div>
        <p className="text-label mb-3">Financial Summary</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard label="Total Purchase Cost"  value={fmtMoney(totals?.total_cost)}          icon="creditCard"  tone="blue"
            sub="Sum of all asset purchase prices" />
          <StatCard label="Total Current Value"  value={fmtMoney(totals?.total_current_value)} icon="trendingUp"  tone="emerald"
            sub="Sum of estimated current values" />
        </div>
      </div>

      {/* By Category */}
      {byCategory?.length > 0 && (
        <Panel icon="layers" iconTone="purple" title="Assets by Category">
          <div className="px-5 py-3">
            {byCategory.map((c) => (
              <HBar key={c.name} label={c.name} value={Number(c.count)} total={totalAssets} color={c.color || "blue"} />
            ))}
          </div>
        </Panel>
      )}

      {/* By Type (top 10) */}
      {byType?.length > 0 && (
        <Panel icon="box" iconTone="blue" title="Assets by Type (Top 10)">
          <div className="px-5 py-3">
            {byType.map((t) => (
              <HBar key={t.name} label={t.name} value={Number(t.count)} total={totalAssets} color="blue" />
            ))}
          </div>
        </Panel>
      )}

      {/* Warranty expiring */}
      {warrantyExpiring?.length > 0 && (
        <Panel icon="shield" iconTone="amber" title="Warranty Expiring (next 90 days)">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                  {["Asset","Type","Expiry Date","Days Remaining"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {warrantyExpiring.map((a) => {
                  const days = Number(a.days_remaining);
                  return (
                    <tr key={a.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-[var(--fg-primary)]">{a.name}</p>
                        <p className="text-xs text-[var(--fg-muted)] font-mono">{a.asset_tag}</p>
                      </td>
                      <td className="px-5 py-3.5"><span className="text-sm text-[var(--fg-secondary)]">{a.type_name || "—"}</span></td>
                      <td className="px-5 py-3.5"><span className="text-sm text-[var(--fg-secondary)]">{fmtDate(a.warranty_expiry_date)}</span></td>
                      <td className="px-5 py-3.5">
                        <Badge tone={days <= 7 ? "rose" : days <= 30 ? "amber" : "blue"} dot>
                          {days === 0 ? "Today" : `${days} days`}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Upcoming maintenance */}
      {recentMaintenance?.length > 0 && (
        <Panel icon="tool" iconTone="blue" title="Upcoming Maintenance">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-surface)]/60 border-b border-[var(--border-default)]">
                  {["Asset","Title","Status","Scheduled"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {recentMaintenance.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-[var(--fg-primary)]">{m.asset_name}</p>
                      <p className="text-xs text-[var(--fg-muted)] font-mono">{m.asset_tag}</p>
                    </td>
                    <td className="px-5 py-3.5"><span className="text-sm text-[var(--fg-primary)]">{m.title}</span></td>
                    <td className="px-5 py-3.5">
                      <Badge tone={m.status==="in_progress"?"amber":"blue"} dot>{m.status.replace("_"," ")}</Badge>
                    </td>
                    <td className="px-5 py-3.5"><span className="text-sm text-[var(--fg-secondary)]">{fmtDate(m.scheduled_date)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
