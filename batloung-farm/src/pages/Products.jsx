import { useEffect, useState } from "react";
import api from "../services/api";
import Modal from "../components/Modal";

const emptyForm = {
    fruit_name: "",
    description: "",
    status: "AVAILABE",
    default_price: "",
};
const SIZES = ["SMALL", "MEDIUM", "LARGE"];

export default function Products() {
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const [editCell, setEditCell] = useState(null);
    const [cellBusy, setCellBusy] = useState(false);
    const [cellError, setCellError] = useState("");

    const load = async () => {
        try {
            const data = await api.get("/fruits/with-stock");
            setRows(data.fruits);
        } catch (e) { setError(e.message); }
    };

    useEffect(() => { load(); }, []);

    // ---------- FRUIT CRUD ----------
    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setError("");
        setOpen(true);
    };

    const openEdit = (r) => {
        setEditing(r);
        setForm({
            fruit_name: r.fruit_name,
            description: r.description || "",
            status: r.status,
            default_price: String(Number(r.default_price) || 0),
        });
        setError("");
        setOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const payload = {
                fruit_name: form.fruit_name,
                description: form.description,
                status: form.status,
                default_price: Number(form.default_price || 0),
            };
            if (editing) await api.put(`/fruits/${editing.fruit_id}`, payload);
            else await api.post("/fruits", payload);
            setOpen(false);
            await load();
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    };

    // ---------- INLINE STOCK / PRICE EDIT ----------
    const startEditCell = (fruitId, size, currentQty, currentPrice) => {
        setEditCell({
            fruitId,
            size,
            quantity: String(currentQty),
            price: String(currentPrice),
        });
        setCellError("");
    };
    const cancelEditCell = () => {
        setEditCell(null);
        setCellError("");
    };
    const saveCell = async () => {
        if (!editCell) return;
        const qty = Number(editCell.quantity);
        const price = Number(editCell.price);

        if (!Number.isInteger(qty) || qty < 0) {
            setCellError("Available quantity must be a non-negative integer.");
            return;
        }
        if (!Number.isFinite(price) || price < 0) {
            setCellError("Selling price must be a non-negative number.");
            return;
        }

        setCellBusy(true);
        setCellError("");
        try {
            await api.put(`/stock/${editCell.fruitId}/${editCell.size}`, {
                available_quantity: qty,
                selling_price: Math.round(price * 100) / 100,
            });
            setEditCell(null);
            await load();
        } catch (err) {
            setCellError(err.message);
        } finally {
            setCellBusy(false);
        }
    };

    const stockFor = (fruit, size) => {
        const found = (fruit.stock || []).find((s) => s.packaging_size === size);
        return {
            quantity: found ? Number(found.available_quantity) : 0,
            explicitPrice: found ? Number(found.selling_price) : 0,
            resolvedPrice: found
                ? Number(found.resolved_price)
                : Number(fruit.default_price) || 0,
        };
    };

    return (
        <div className="page">
            <div className="page-header">
                <h2>Fruits &amp; Stock</h2>
                <button className="btn-primary" onClick={openCreate}>+ New fruit</button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {rows.length === 0 && (
                <div className="data-table-wrapper" style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>
                    No fruits yet. Click “+ New fruit” to add one.
                </div>
            )}

            {rows.map((fruit) => {
                const defaultPrice = Number(fruit.default_price) || 0;

                return (
                    <div key={fruit.fruit_id} className="fruit-card">
                        <div className="fruit-card-head">
                            <div>
                                <h3 className="fruit-name">{fruit.fruit_name}</h3>
                                <p className="fruit-desc">{fruit.description || "—"}</p>
                                <span
                                    className={
                                        fruit.status === "AVAILABE"
                                            ? "fruit-status availabe"
                                            : "fruit-status inactive"
                                    }
                                >
                                    {fruit.status}
                                </span>
                                <span className="fruit-price-chip">
                                    Default price:{" "}
                                    {defaultPrice > 0
                                        ? `R ${defaultPrice.toFixed(2)}`
                                        : "not set"}
                                </span>
                            </div>
                            <div className="fruit-card-actions">
                                <button className="btn-link" onClick={() => openEdit(fruit)}>
                                    Edit fruit
                                </button>
                            </div>
                        </div>

                        <table className="stock-mini-table">
                            <thead>
                                <tr>
                                    <th>Packaging</th>
                                    <th>Available boxes</th>
                                    <th>Selling price (R)</th>
                                    <th>Last updated</th>
                                    <th style={{ width: 160 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SIZES.map((size) => {
                                    const stockRow = (fruit.stock || []).find((s) => s.packaging_size === size);
                                    const { quantity, explicitPrice, resolvedPrice } = stockFor(fruit, size);
                                    const isEditing =
                                        editCell &&
                                        editCell.fruitId === fruit.fruit_id &&
                                        editCell.size === size;
                                    const isInherited = explicitPrice === 0 && resolvedPrice > 0;

                                    return (
                                        <tr key={size}>
                                            <td>
                                                <span className={`size-pill ${size.toLowerCase()}`}>
                                                    {size}
                                                </span>
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        className="stock-input"
                                                        value={editCell.quantity}
                                                        onChange={(e) =>
                                                            setEditCell({ ...editCell, quantity: e.target.value })
                                                        }
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <strong>{quantity}</strong>
                                                )}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        className="stock-input price"
                                                        value={editCell.price}
                                                        onChange={(e) =>
                                                            setEditCell({ ...editCell, price: e.target.value })
                                                        }
                                                    />
                                                ) : resolvedPrice > 0 ? (
                                                    <>
                                                        R {resolvedPrice.toFixed(2)}
                                                        {isInherited && (
                                                            <span className="price-hint"> (default)</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="muted">not set</span>
                                                )}
                                            </td>
                                            <td className="muted">
                                                {stockRow?.updated_at
                                                    ? String(stockRow.updated_at).replace("T", " ").slice(0, 19)
                                                    : "—"}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <div className="row-actions">
                                                        <button
                                                            className="btn-primary small"
                                                            onClick={saveCell}
                                                            disabled={cellBusy}
                                                        >
                                                            {cellBusy ? "Saving..." : "Save"}
                                                        </button>
                                                        <button
                                                            className="btn-link"
                                                            onClick={cancelEditCell}
                                                            disabled={cellBusy}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className="btn-link"
                                                        onClick={() =>
                                                            startEditCell(
                                                                fruit.fruit_id,
                                                                size,
                                                                quantity,
                                                                explicitPrice || resolvedPrice
                                                            )
                                                        }
                                                    >
                                                        Adjust
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {editCell && editCell.fruitId === fruit.fruit_id && cellError && (
                            <div className="error-message" style={{ marginTop: 8 }}>
                                {cellError}
                            </div>
                        )}
                    </div>
                );
            })}

            <Modal
                open={open}
                title={editing ? "Edit fruit" : "New fruit"}
                onClose={() => setOpen(false)}
            >
                <form onSubmit={handleSubmit} className="form-grid">
                    <label className="span-2">
                        Fruit name
                        <input
                            value={form.fruit_name}
                            onChange={(e) => setForm({ ...form, fruit_name: e.target.value })}
                            required
                        />
                    </label>
                    <label className="span-2">
                        Description
                        <input
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                        />
                    </label>
                    <label>
                        Default selling price (R)
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.default_price}
                            onChange={(e) => setForm({ ...form, default_price: e.target.value })}
                            placeholder="0.00"
                        />
                    </label>
                    <label>
                        Status
                        <select
                            value={form.status}
                            onChange={(e) => setForm({ ...form, status: e.target.value })}
                        >
                            <option>ACTIVE</option>
                            <option>INACTIVE</option>
                        </select>
                    </label>
                    {error && <div className="error-message span-2">{error}</div>}
                    <div className="form-actions span-2">
                        <button type="button" className="btn-link" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}