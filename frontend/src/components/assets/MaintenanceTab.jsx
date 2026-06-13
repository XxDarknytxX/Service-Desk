/**
 * MaintenanceTab — Log and track asset maintenance records
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import { useToast } from "../../contexts/toast";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import Input, { Textarea, Select } from "../ui/Input";
import useConfirm from "../ui/useConfirm";

function cn(...p) { return p.filter(Boolean).join(" "); }

const STATUS_TONE = { scheduled:"blue", in_progress:"amber", completed:"emerald", cancelled:"slate" };
const TYPE_ICON   = { repair:"tool", preventive:"shield", upgrade:"layers", calibration:"cpu", inspection:"eye", other:"box" };

function MaintenanceModal({ open, record, assets, onClose, onSaved }) {
  const editing = !!record;
  const toast = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? {
      asset_id: record.asset_id,
      title: record.title || "",
      maintenance_type: record.maintenance_type || "preventive",
      status: record.status || "scheduled",
      scheduled_date: record.scheduled_date?.split("T")[0] || "",
      completed_date: record.completed_date?.split("T")[0] || "",
      cost: record.cost || "",
      technician: record.technician || "",
      notes: record.notes || "",
    } : { asset_id: "", title: "", maintenance_type: "preventive", status: "scheduled", scheduled_date: "", completed_date: "", cost: "", technician: "", notes: "" });
  }, [open, record]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit() {
    if (!form.asset_id || !form.title) return;
    setSaving(true);
    try {
      if (editing) await assetsApi.updateMaintenance(record.id, { ...form, cost: form.cost || null });
      else         await assetsApi.createMaintenance({ ...form, cost: form.cost || null });
      toast.success(editing ? "Maintenance record updated" : "Maintenance logged");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e?.message || "Failed to save maintenance record");
    }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose}
      title={editing ? "Edit Maintenance Record" : "Log Maintenance"}
      subtitle="Track maintenance work for an asset"
      size="lg"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!form.asset_id || !form.title}>
            {editing ? "Save Changes" : "Log Maintenance"}
          </Button>
        </>
      }>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Select label="Asset *" value={form.asset_id} onChange={set("asset_id")}>
            <option value="">Select asset…</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.asset_tag})</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <Input label="Title *" value={form.title} onChange={set("title")} placeholder="e.g. Annual PM Check, Battery Replacement" />
        </div>
        <Select label="Type" value={form.maintenance_type} onChange={set("maintenance_type")}>
          {["repair","preventive","upgrade","calibration","inspection","other"].map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </Select>
        <Select label="Status" value={form.status} onChange={set("status")}>
          {["scheduled","in_progress","completed","cancelled"].map((s) => (
            <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </Select>
        <Input label="Scheduled Date" type="date" value={form.scheduled_date} onChange={set("scheduled_date")} />
        <Input label="Completed Date" type="date" value={form.completed_date} onChange={set("completed_date")} />
        <Input label="Cost (FJD)" type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0.00" />
        <Input label="Technician / Vendor" value={form.technician} onChange={set("technician")} placeholder="Who performed the work?" />
        <div className="col-span-2">
          <Textarea label="Notes" value={form.notes} onChange={set("notes")} rows={3} placeholder="Details about the maintenance work…" />
        </div>
      </div>
    </Modal>
  );
}

export default function MaintenanceTab() {
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [records, setRecords] = useState([]);
  const [assets, setAssets]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilter] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showModal, setShowModal]   = useState(false);
  const [editingRec, setEditing]    = useState(null);

  useEffect(() => { load(); }, [filterStatus, filterType]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType)   params.type   = filterType;
      const [recs, asts] = await Promise.all([assetsApi.getMaintenance(params), assetsApi.getAssets()]);
      setRecords(recs);
      setAssets(asts);
    } catch (e) {
      toast.error(e?.message || "Failed to load maintenance records");
    }
    finally { setLoading(false); }
  }

  async function quickStatus(id, status) {
    try {
      const rec = records.find((r) => r.id === id);
      await assetsApi.updateMaintenance(id, { ...rec, status });
      load();
    } catch (e) {
      toast.error(e?.message || "Failed to update status");
    }
  }

  function handleDelete(rec) {
    confirm({
      title: "Delete maintenance record?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{rec.title}</strong>{" "}
          {rec.asset_name && <>for {rec.asset_name} </>}from the maintenance
          history.
        </>
      ),
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          await assetsApi.deleteMaintenance(rec.id);
          toast.success("Maintenance record deleted");
          load();
        } catch (e) {
          toast.error(e?.message || "Failed to delete record");
        }
      },
    });
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-FJ", { day:"2-digit", month:"short", year:"numeric" }) : "—";

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        {[
          { value: filterStatus, set: setFilter, opts: [
            ["", "All Status"], ["scheduled","Scheduled"], ["in_progress","In Progress"],
            ["completed","Completed"], ["cancelled","Cancelled"]
          ]},
          { value: filterType, set: setFilterType, opts: [
            ["", "All Types"], ["repair","Repair"], ["preventive","Preventive"],
            ["upgrade","Upgrade"], ["calibration","Calibration"], ["inspection","Inspection"], ["other","Other"]
          ]},
        ].map((f, i) => (
          <div key={i} className="relative">
            <select value={f.value} onChange={(e) => f.set(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--fg-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer">
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Icon name="chevronDown" size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-muted)] pointer-events-none" />
          </div>
        ))}
        <Badge tone="slate" className="ml-1">{records.length} records</Badge>
        <Button icon={<Icon name="plus" size={14} />} onClick={() => { setEditing(null); setShowModal(true); }} className="ml-auto">
          Log Maintenance
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent)] animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <Icon name="tool" size={36} className="text-[var(--fg-muted)] mb-3" />
            <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No maintenance records</p>
            <p className="text-sm text-[var(--fg-muted)] mb-4">Log maintenance to track asset upkeep</p>
            <Button icon={<Icon name="plus" size={14} />} onClick={() => setShowModal(true)}>Log Maintenance</Button>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border-default)]">
                  {["Asset","Title","Type","Status","Scheduled","Completed","Cost","Technician",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {records.map((r) => (
                  <tr key={r.id} className="group hover:bg-[var(--bg-base)] transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--fg-primary)]">{r.asset_name}</p>
                        <p className="text-xs text-[var(--fg-muted)] font-mono">{r.asset_tag}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-[var(--fg-primary)] max-w-[200px] truncate">{r.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Icon name={TYPE_ICON[r.maintenance_type] || "box"} size={13} className="text-[var(--fg-muted)]" />
                        <span className="text-sm text-[var(--fg-secondary)] capitalize">{r.maintenance_type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[r.status] || "slate"}>{r.status.replace("_"," ")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--fg-secondary)]">{fmtDate(r.scheduled_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--fg-secondary)]">{fmtDate(r.completed_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--fg-secondary)]">{r.cost ? `FJD ${Number(r.cost).toFixed(2)}` : "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[var(--fg-secondary)]">{r.technician || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {r.status === "scheduled" && (
                          <button onClick={() => quickStatus(r.id, "in_progress")}
                            className="px-2 py-1 text-xs rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all whitespace-nowrap">
                            Start
                          </button>
                        )}
                        {r.status === "in_progress" && (
                          <button onClick={() => quickStatus(r.id, "completed")}
                            className="px-2 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all whitespace-nowrap">
                            Complete
                          </button>
                        )}
                        <button onClick={() => { setEditing(r); setShowModal(true); }}
                          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] transition-all">
                          <Icon name="pencil" size={13} />
                        </button>
                        <button onClick={() => handleDelete(r)}
                          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MaintenanceModal
        open={showModal}
        record={editingRec}
        assets={assets}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSaved={load}
      />

      {confirmDialog}
    </div>
  );
}
