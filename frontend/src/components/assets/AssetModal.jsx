/**
 * AssetModal — Create / Edit Asset
 * Full-featured form with all fields organized in sections
 */
import { useState, useEffect } from "react";
import { assetsApi } from "../../services/api";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Input, { Textarea, Select } from "../ui/Input";
import Icon from "../ui/Icon";

function cn(...p) { return p.filter(Boolean).join(" "); }

const STATUSES = ["active","inactive","maintenance","retired"];
const CONDITIONS = ["new","excellent","good","fair","poor","damaged"];

const SECTION = ({ title, children }) => (
  <div>
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-[var(--border-default)]" />
    </div>
    <div className="grid grid-cols-2 gap-4">{children}</div>
  </div>
);

const FULL = ({ children }) => <div className="col-span-2">{children}</div>;

export default function AssetModal({ open, onClose, asset = null, onSaved }) {
  const editing = !!asset;
  const [categories, setCategories] = useState([]);
  const [types, setTypes]           = useState([]);
  const [users, setUsers]           = useState([]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const blank = {
    asset_tag:"", name:"", asset_type_id:"", category_id:"", serial_number:"",
    manufacturer:"", model:"", status:"active", condition:"", location:"",
    department_id:"", supplier:"", order_number:"", assigned_to_user_id:"",
    assigned_to_org_id:"", purchase_date:"", purchase_cost:"", warranty_expiry_date:"",
    expected_lifespan_years:"", current_value:"", depreciation_rate:"", notes:"",
  };

  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!open) return;
    loadLookups();
    setForm(asset ? {
      asset_tag: asset.asset_tag || "",
      name: asset.name || "",
      asset_type_id: asset.asset_type_id || "",
      category_id: asset.category_id || "",
      serial_number: asset.serial_number || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      status: asset.status || "active",
      condition: asset.condition || "",
      location: asset.location || "",
      department_id: asset.department_id || "",
      supplier: asset.supplier || "",
      order_number: asset.order_number || "",
      assigned_to_user_id: asset.assigned_to_user_id || "",
      assigned_to_org_id: asset.assigned_to_org_id || "",
      purchase_date: asset.purchase_date?.split("T")[0] || "",
      purchase_cost: asset.purchase_cost || "",
      warranty_expiry_date: asset.warranty_expiry_date?.split("T")[0] || "",
      expected_lifespan_years: asset.expected_lifespan_years || "",
      current_value: asset.current_value || "",
      depreciation_rate: asset.depreciation_rate || "",
      notes: asset.notes || "",
    } : blank);
    setError("");
  }, [open, asset]);

  async function loadLookups() {
    try {
      const [cats, typs] = await Promise.all([
        assetsApi.getCategories(),
        assetsApi.getAssetTypes(),
      ]);
      setCategories(cats);
      setTypes(typs);
    } catch { /* silent */ }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const filteredTypes = form.category_id
    ? types.filter((t) => String(t.category_id) === String(form.category_id))
    : types;

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Asset name is required"); return; }
    if (!form.asset_type_id) { setError("Asset type is required"); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form };
      // Convert empty strings to null for numeric fields
      ["asset_type_id","category_id","department_id","assigned_to_user_id","assigned_to_org_id",
       "purchase_cost","expected_lifespan_years","current_value","depreciation_rate"].forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      if (editing) await assetsApi.updateAsset(asset.id, payload);
      else         await assetsApi.createAsset(payload);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || "Failed to save asset");
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit Asset" : "New Asset"}
      subtitle={editing ? `Editing ${asset.asset_tag}` : "Add a new asset to your inventory"}
      size="xl"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving}>
            {editing ? "Save Changes" : "Create Asset"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <Icon name="alert" size={14} />
            {error}
          </div>
        )}

        {/* Identity */}
        <SECTION title="Identity">
          <Input label="Asset Name" value={form.name} onChange={set("name")} required placeholder="e.g. MacBook Pro 2023" />
          <Input label="Asset Tag" value={form.asset_tag} onChange={set("asset_tag")} placeholder="Auto-generated if blank" />
          <Select label="Category" value={form.category_id} onChange={(e) => { setForm(f => ({ ...f, category_id: e.target.value, asset_type_id: "" })); }}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Asset Type" value={form.asset_type_id} onChange={set("asset_type_id")} required>
            <option value="">Select type…</option>
            {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </SECTION>

        {/* Hardware Details */}
        <SECTION title="Hardware Details">
          <Input label="Manufacturer" value={form.manufacturer} onChange={set("manufacturer")} placeholder="e.g. Apple, Dell, Cisco" />
          <Input label="Model" value={form.model} onChange={set("model")} placeholder="e.g. MacBook Pro M3" />
          <Input label="Serial Number" value={form.serial_number} onChange={set("serial_number")} placeholder="Device serial number" />
          <Select label="Condition" value={form.condition} onChange={set("condition")}>
            <option value="">Select condition…</option>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </Select>
          <Select label="Status" value={form.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </Select>
          <Input label="Location" value={form.location} onChange={set("location")} placeholder="e.g. Head Office, Room 204" />
        </SECTION>

        {/* Procurement */}
        <SECTION title="Procurement">
          <Input label="Supplier / Vendor" value={form.supplier} onChange={set("supplier")} placeholder="Vendor name" />
          <Input label="Order / PO Number" value={form.order_number} onChange={set("order_number")} placeholder="PO-2024-001" />
          <Input label="Purchase Date" type="date" value={form.purchase_date} onChange={set("purchase_date")} />
          <Input label="Purchase Cost (FJD)" type="number" min="0" step="0.01" value={form.purchase_cost} onChange={set("purchase_cost")} placeholder="0.00" />
          <Input label="Warranty Expiry" type="date" value={form.warranty_expiry_date} onChange={set("warranty_expiry_date")} />
          <Input label="Expected Lifespan (years)" type="number" min="1" max="20" value={form.expected_lifespan_years} onChange={set("expected_lifespan_years")} placeholder="e.g. 3" />
          <Input label="Current Value (FJD)" type="number" min="0" step="0.01" value={form.current_value} onChange={set("current_value")} placeholder="Estimated current value" />
          <Input label="Depreciation Rate (%/yr)" type="number" min="0" max="100" step="0.1" value={form.depreciation_rate} onChange={set("depreciation_rate")} placeholder="e.g. 25" />
        </SECTION>

        {/* Assignment */}
        <SECTION title="Assignment">
          <Input label="Assigned User ID" type="number" value={form.assigned_to_user_id} onChange={set("assigned_to_user_id")} placeholder="Leave blank if unassigned" />
          <Input label="Assigned Org ID" type="number" value={form.assigned_to_org_id} onChange={set("assigned_to_org_id")} placeholder="Leave blank if unassigned" />
        </SECTION>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider">Notes</span>
            <div className="flex-1 h-px bg-[var(--border-default)]" />
          </div>
          <Textarea label="" value={form.notes} onChange={set("notes")} rows={3} placeholder="Additional notes about this asset…" />
        </div>
      </div>
    </Modal>
  );
}
