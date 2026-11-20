import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";

const money = (v) => `R ${Number(v || 0).toFixed(2)}`;

export default function Payments() {
    const [sales, setSales] = useState([]);
    const [error, setError] = useState("");

    // Payment modal
    const [payOpen, setPayOpen] = useState(false);
    const [target, setTarget] = useState(null);
    const [targetItems, setTargetItems] = useState([]);
    const [itemsError, setItemsError] = useState("");
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);

    // Items-preview modal (read-only)
    const [viewOpen, setViewOpen] = useState(false);
    const [viewTarget, setViewTarget] = useState(null);
    const [viewItems, setViewItems] = useState([]);

    const load = async () => {
        try {
            const data = await api.get("/sales");
            setSales(
                (data.sales || []).filter(
                    (s) => Number(s.outstanding) > 0
                )
            );
        } catch (e) { setError(e.message); }
    };

    useEffect(() => { load(); }, []);

    const loadSaleItems = async (saleId) => {
        const data = await api.get(`/sales/${saleId}`);
        return {
            sale: data.sale,
            items: data.items || [],
        };
    };

    const openView = async (row) => {
        setViewTarget(row);
        setViewItems([]);
        setViewOpen(true);
        try {
            const { items } = await loadSaleItems(row.sale_id);
            setViewItems(items);
        } catch (e) {
            setViewItems([]);
            setError(e.message);
        }
    };

    const openPay = async (row) => {
        setTarget(row);
        setAmount(String(Number(row.outstanding).toFixed(2)));
        setTargetItems([]);
        setItemsError("");
        setPayOpen(true);
        try {
            const { items } = await loadSaleItems(row.sale_id);
            setTargetItems(items);
        } catch (e) {
            setItemsError(e.message);
        }
    };

    const computeItemsTotal = (items) =>
        items.reduce(
            (sum, it) => sum + Number(it.quantity) * Number(it.unit_price),
            0
        );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api.post(`/sales/${target.sale_id}/pay`, {
                amount: Number(amount),
            });
            setPayOpen(false);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const itemsTotal = computeItemsTotal(targetItems);

    return (
        <div className="page">
            <h2>Record payments</h2>
            {error && <div className="error-message">{error}</div>}

            <DataTable
                rows={sales}
                columns={[
                    { key: "sale_id", label: "#" },
                    { key: "vendor_name", label: "Vendor" },
                    { key: "sale_date", label: "Date" },
                    { key: "items_summary", label: "Items (priced at sale)" },
                    { key: "total_amount", label: "Total (R)" },
                    { key: "amount_paid", label: "Paid (R)" },
                    { key: "outstanding", label: "Outstanding (R)" },
                    {
                        key: "actions", label: "Actions",
                        render: (r) => (
                            <div className="row-actions">
                                <button className="btn-link" onClick={() => openView(r)}>
                                    View items
                                </button>
                                <button className="btn-link" onClick={() => openPay(r)}>
                                    Record payment
                                </button>
                            </div>
                        ),
                    },
                ]}
            />

            {/* ------- READ-ONLY ITEMS PREVIEW ------- */}
            <Modal
                open={viewOpen}
                title={`Sale #${viewTarget?.sale_id} — items`}
                onClose={() => setViewOpen(false)}
            >
                <p className="muted" style={{ marginTop: 0 }}>
                    Vendor: <strong>{viewTarget?.vendor_name}</strong> · Sold: {viewTarget?.sale_date}
                </p>

                {viewItems.length === 0 ? (
                    <p className="muted">Loading items…</p>
                ) : (
                    <table className="stock-mini-table">
                        <thead>
                            <tr>
                                <th>Fruit</th>
                                <th>Size</th>
                                <th>Qty</th>
                                <th>Unit price (R)</th>
                                <th>Line total (R)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {viewItems.map((it) => (
                                <tr key={it.sales_detail_id}>
                                    <td>{it.fruit_name}</td>
                                    <td>{it.packaging_size}</td>
                                    <td>{it.quantity}</td>
                                    <td>{Number(it.unit_price).toFixed(2)}</td>
                                    <td>
                                        {(
                                            Number(it.quantity) * Number(it.unit_price)
                                        ).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>
                                    Sum of items
                                </td>
                                <td style={{ fontWeight: 700 }}>
                                    {computeItemsTotal(viewItems).toFixed(2)}
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={4} style={{ textAlign: "right" }}>
                                    Recorded total
                                </td>
                                <td>{Number(viewTarget?.total_amount || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan={4} style={{ textAlign: "right" }}>
                                    Paid
                                </td>
                                <td>{Number(viewTarget?.amount_paid || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td colSpan={4} style={{ textAlign: "right" }}>
                                    Outstanding
                                </td>
                                <td style={{ fontWeight: 700 }}>
                                    {Number(viewTarget?.outstanding || 0).toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}

                <div className="form-actions">
                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => setViewOpen(false)}
                    >
                        Close
                    </button>
                </div>
            </Modal>

            {/* ------- PAYMENT MODAL ------- */}
            <Modal
                open={payOpen}
                title={`Record payment — Sale #${target?.sale_id}`}
                onClose={() => setPayOpen(false)}
            >
                <p className="muted" style={{ marginTop: 0 }}>
                    Vendor: <strong>{target?.vendor_name}</strong>
                </p>

                {itemsError && <div className="error-message">{itemsError}</div>}

                {targetItems.length > 0 && (
                    <>
                        <table className="stock-mini-table">
                            <thead>
                                <tr>
                                    <th>Fruit</th>
                                    <th>Size</th>
                                    <th>Qty</th>
                                    <th>Unit price (R)</th>
                                    <th>Line total (R)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {targetItems.map((it) => (
                                    <tr key={it.sales_detail_id}>
                                        <td>{it.fruit_name}</td>
                                        <td>{it.packaging_size}</td>
                                        <td>{it.quantity}</td>
                                        <td>{Number(it.unit_price).toFixed(2)}</td>
                                        <td>
                                            {(
                                                Number(it.quantity) * Number(it.unit_price)
                                            ).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "right", fontWeight: 600 }}>
                                        Items subtotal
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{itemsTotal.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "right" }}>
                                        Sale total (recorded)
                                    </td>
                                    <td>{Number(target?.total_amount || 0).toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "right" }}>
                                        Already paid
                                    </td>
                                    <td>{Number(target?.amount_paid || 0).toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "right" }}>
                                        Outstanding
                                    </td>
                                    <td style={{ fontWeight: 700 }}>
                                        {Number(target?.outstanding || 0).toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        {Math.abs(itemsTotal - Number(target?.total_amount || 0)) > 0.01 && (
                            <div className="error-message">
                                Warning: line items sum to{" "}
                                <strong>{money(itemsTotal)}</strong> but the recorded sale total is{" "}
                                <strong>{money(target?.total_amount)}</strong>. This should not
                                happen — please report it.
                            </div>
                        )}
                    </>
                )}

                <form onSubmit={handleSubmit}>
                    <label>
                        Amount to pay
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={Number(target?.outstanding || 0)}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                        />
                    </label>

                    {error && <div className="error-message">{error}</div>}

                    <div className="form-actions">
                        <button type="button" className="btn-link" onClick={() => setPayOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? "Saving..." : "Save payment"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}