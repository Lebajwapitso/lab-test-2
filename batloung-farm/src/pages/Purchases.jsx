import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

const emptyItem = { fruit_id: "", packaging_size: "SMALL", quantity: "", unit_cost: "" };

export default function Purchases() {
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [fruits, setFruits] = useState([]);
    const [open, setOpen] = useState(false);
    const [supplierId, setSupplierId] = useState("");
    const [items, setItems] = useState([{ ...emptyItem }]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const [p, s, f] = await Promise.all([
                api.get("/purchases"),
                api.get("/suppliers"),
                api.get("/fruits"),
            ]);
            setPurchases(p.purchases);
            setSuppliers(s.suppliers);
            setFruits(f.fruits);
        } catch (e) { setError(e.message); }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setSupplierId("");
        setItems([{ ...emptyItem }]);
        setError("");
        setOpen(true);
    };

    const setItem = (idx, patch) => {
        setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    };

    const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);
    const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const payload = {
                supplier_id: Number(supplierId),
                items: items.map((it) => ({
                    fruit_id: Number(it.fruit_id),
                    packaging_size: it.packaging_size,
                    quantity: Number(it.quantity),
                    unit_cost: Number(it.unit_cost),
                })),
            };
            await api.post("/purchases", payload);
            setOpen(false);
            await load();
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h2>Purchases</h2>
                <button className="btn-primary" onClick={openCreate}>+ New purchase</button>
            </div>
            {error && <div className="error-message">{error}</div>}
            <DataTable
                rows={purchases}
                columns={[
                    { key: "purchase_id", label: "#" },
                    { key: "business_name", label: "Supplier" },
                    { key: "purchase_date", label: "Date" },
                    { key: "total_amount", label: "Total (R)" },
                ]}
            />

            <Modal open={open} title="New purchase" onClose={() => setOpen(false)}>
                <form onSubmit={handleSubmit}>
                    <label>Supplier
                        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                            <option value="">-- choose --</option>
                            {suppliers.map((s) => (
                                <option key={s.supplier_id} value={s.supplier_id}>
                                    {s.business_name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <h4>Items</h4>
                    {items.map((it, idx) => (
                        <div className="item-row" key={idx}>
                            <select value={it.fruit_id} onChange={(e) => setItem(idx, { fruit_id: e.target.value })} required>
                                <option value="">Fruit</option>
                                {fruits.map((f) => (
                                    <option key={f.fruit_id} value={f.fruit_id}>{f.fruit_name}</option>
                                ))}
                            </select>
                            <select value={it.packaging_size} onChange={(e) => setItem(idx, { packaging_size: e.target.value })}>
                                <option>SMALL</option>
                                <option>MEDIUM</option>
                                <option>LARGE</option>
                            </select>
                            <input type="number" min="1" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} required />
                            <input type="number" min="0" step="0.01" placeholder="Unit cost" value={it.unit_cost} onChange={(e) => setItem(idx, { unit_cost: e.target.value })} required />
                            <button type="button" className="btn-link danger" onClick={() => removeItem(idx)}>×</button>
                        </div>
                    ))}
                    <button type="button" className="btn-link" onClick={addItem}>+ Add item</button>

                    {error && <div className="error-message">{error}</div>}

                    <div className="form-actions">
                        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? "Recording..." : "Record purchase"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}