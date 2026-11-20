import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

const emptyItem = { fruit_id: "", packaging_size: "SMALL", quantity: "", unit_price: "" };

export default function Sales() {
    const [sales, setSales] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [fruits, setFruits] = useState([]);
    const [fruitsWithStock, setFruitsWithStock] = useState([]);
    const [open, setOpen] = useState(false);
    const [vendorId, setVendorId] = useState("");
    const [method, setMethod] = useState("CASH");
    const [amountPaid, setAmountPaid] = useState("");
    const [items, setItems] = useState([{ ...emptyItem }]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const [s, v, f, fws] = await Promise.all([
                api.get("/sales"),
                api.get("/vendors"),
                api.get("/fruits"),
                api.get("/fruits/with-stock"),
            ]);
            setSales(s.sales);
            setVendors(v.vendors);
            setFruits(f.fruits);
            setFruitsWithStock(fws.fruits);
        } catch (e) { setError(e.message); }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setVendorId("");
        setMethod("CASH");
        setAmountPaid("");
        setItems([{ ...emptyItem }]);
        setError("");
        setOpen(true);
    };

    const lookupPrice = (fruitId, size) => {
        const fruit = fruitsWithStock.find((f) => Number(f.fruit_id) === Number(fruitId));
        if (!fruit) return 0;
        const row = (fruit.stock || []).find((s) => s.packaging_size === size);
        if (row) {
            if (Number(row.selling_price) > 0) return Number(row.selling_price);
            if (Number(row.resolved_price) > 0) return Number(row.resolved_price);
        }
        return Number(fruit.default_price) || 0;
    };

    const setItem = (idx, patch) => {
        setItems((prev) =>
            prev.map((it, i) => {
                if (i !== idx) return it;
                const merged = { ...it, ...patch };
                const fruitOrSizeChanged =
                    patch.fruit_id !== undefined || patch.packaging_size !== undefined;
                if (fruitOrSizeChanged && merged.fruit_id && merged.packaging_size) {
                    const auto = lookupPrice(merged.fruit_id, merged.packaging_size);
                    if (auto > 0) merged.unit_price = String(auto);
                }
                return merged;
            })
        );
    };

    const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);
    const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const payload = {
                vendor_id: Number(vendorId),
                payment_method: method,
                items: items.map((it) => ({
                    fruit_id: Number(it.fruit_id),
                    packaging_size: it.packaging_size,
                    quantity: Number(it.quantity),
                    unit_price:
                        it.unit_price === "" || it.unit_price === undefined
                            ? undefined
                            : Number(it.unit_price),
                })),
            };
            if (amountPaid !== "") payload.amount_paid = Number(amountPaid);

            await api.post("/sales", payload);
            setOpen(false);
            await load();
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="page">
            <div className="page-header">
                <h2>Sales</h2>
                <button className="btn-primary" onClick={openCreate}>+ New sale</button>
            </div>
            {error && <div className="error-message">{error}</div>}
            <DataTable
                rows={sales}
                columns={[
                    { key: "sale_id", label: "#" },
                    { key: "vendor_name", label: "Vendor" },
                    { key: "sale_date", label: "Date" },
                    { key: "payment_method", label: "Method" },
                    { key: "total_amount", label: "Total (R)" },
                    { key: "amount_paid", label: "Paid (R)" },
                    { key: "outstanding", label: "Outstanding (R)" },
                    { key: "payment_status", label: "Status" },
                ]}
            />

            <Modal open={open} title="New sale" onClose={() => setOpen(false)}>
                <form onSubmit={handleSubmit}>
                    <label>Vendor
                        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
                            <option value="">-- choose --</option>
                            {vendors.map((v) => (
                                <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                            ))}
                        </select>
                    </label>

                    <label>Payment method
                        <select value={method} onChange={(e) => setMethod(e.target.value)}>
                            <option value="CASH">Cash</option>
                            <option value="MOBILE_MONEY">Mobile money</option>
                            <option value="CREDIT">Credit</option>
                        </select>
                    </label>

                    <label>Amount paid (leave blank for CASH = full)
                        <input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
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
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Unit price (auto)"
                                value={it.unit_price}
                                onChange={(e) => setItem(idx, { unit_price: e.target.value })}
                            />
                            <button type="button" className="btn-link danger" onClick={() => removeItem(idx)}>×</button>
                        </div>
                    ))}
                    <button type="button" className="btn-link" onClick={addItem}>+ Add item</button>

                    {error && <div className="error-message">{error}</div>}

                    <div className="form-actions">
                        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? "Recording..." : "Record sale"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}