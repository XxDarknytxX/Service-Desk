/**
 * Assets Page — Full Asset Management Hub
 * Sub-tabs: Assets | Types & Categories | Maintenance | Assignments | Reports
 */
import { useState } from "react";
import Icon from "../components/ui/Icon";
import AssetList from "../components/assets/AssetList";
import AssetTypeManager from "../components/assets/AssetTypeManager";
import MaintenanceTab from "../components/assets/MaintenanceTab";
import AssignmentsTab from "../components/assets/AssignmentsTab";
import AssetReportsTab from "../components/assets/AssetReportsTab";

function cn(...p) { return p.filter(Boolean).join(" "); }

const TABS = [
  { key: "assets",      label: "Assets",          icon: "assets",    desc: "Inventory" },
  { key: "types",       label: "Types & Categories", icon: "tag",    desc: "Manage" },
  { key: "maintenance", label: "Maintenance",      icon: "tool",      desc: "Logs" },
  { key: "assignments", label: "Assignments",      icon: "userPlus",  desc: "History" },
  { key: "reports",     label: "Reports",          icon: "barChart",  desc: "Analytics" },
];

export default function Assets() {
  const [activeTab, setActiveTab] = useState("assets");

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Page header */}
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5 mb-5 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">
            Asset Management
          </h1>
          <p className="text-sm text-[var(--fg-secondary)] mt-1">
            Track, manage and report on all IT assets
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === tab.key
                ? "bg-[var(--accent)] text-white shadow-[0_0_16px_rgba(230,0,0,0.3)]"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]"
            )}
          >
            <Icon name={tab.icon} size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "assets"      && <AssetList />}
        {activeTab === "types"       && <AssetTypeManager />}
        {activeTab === "maintenance" && <MaintenanceTab />}
        {activeTab === "assignments" && <AssignmentsTab />}
        {activeTab === "reports"     && <AssetReportsTab />}
      </div>
    </div>
  );
}
