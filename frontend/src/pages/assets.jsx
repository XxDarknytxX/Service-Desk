/**
 * Assets Page — Full Asset Management Hub
 * Sub-tabs: Assets | Types & Categories | Maintenance | Assignments | Reports
 *
 * Premium Vodafone shell: branded PageHeader (assets icon) + shared underline
 * Tabs for sub-navigation. Each tab renders its own toolbar / KPIs / table.
 * All tab state and child components are preserved exactly.
 */
import { useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import AssetList from "../components/assets/AssetList";
import AssetTypeManager from "../components/assets/AssetTypeManager";
import MaintenanceTab from "../components/assets/MaintenanceTab";
import AssignmentsTab from "../components/assets/AssignmentsTab";
import AssetReportsTab from "../components/assets/AssetReportsTab";

const TABS = [
  { value: "assets",      label: "Inventory",          icon: "assets" },
  { value: "types",       label: "Types & Categories", icon: "tag" },
  { value: "maintenance", label: "Maintenance",        icon: "tool" },
  { value: "assignments", label: "Assignments",        icon: "userPlus" },
  { value: "reports",     label: "Reports",            icon: "barChart" },
];

export default function Assets() {
  const [activeTab, setActiveTab] = useState("assets");

  return (
    <div className="flex flex-col h-full">
      {/* Branded page header */}
      <div className="shrink-0 animate-fade-up">
        <PageHeader
          icon="assets"
          title="Asset Management"
          subtitle="Track, manage and report on all IT assets"
        />
      </div>

      {/* Sub-tab navigation (shared underline tabs) */}
      <div className="shrink-0 mt-5">
        <Tabs
          variant="underline"
          tabs={TABS}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 pt-5">
        {activeTab === "assets"      && <AssetList />}
        {activeTab === "types"       && <AssetTypeManager />}
        {activeTab === "maintenance" && <MaintenanceTab />}
        {activeTab === "assignments" && <AssignmentsTab />}
        {activeTab === "reports"     && <AssetReportsTab />}
      </div>
    </div>
  );
}
