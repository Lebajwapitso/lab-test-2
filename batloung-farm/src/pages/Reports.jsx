import { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
} from "recharts";
import api from "../services/api";
import DataTable from "../components/DataTable";

// Same green palette as App.css
const GREEN_1 = "#16a34a";
const GREEN_2 = "#22c55e";
const GREEN_3 = "#4ade80";
const GREEN_4 = "#86efac";
const SIZES = ["SMALL", "MEDIUM", "LARGE"];

const tooltipStyle = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 13,
    boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
};

export default function Reports() {
    const [tab, setTab] = useState("top-fruits");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [start, setStart] = useState("2024-01-01");
    const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));

    const run = async () => {
        setError("");
        setData(null);
        setLoading(true);
        try {
            if (tab === "top-fruits")
                setData(await api.get("/reports/top-fruits"));
            if (tab === "revenue")
                setData(
                    await api.get(`/reports/revenue?start=${start}&end=${end}`)
                );
            if (tab === "top-vendor")
                setData(await api.get("/reports/top-vendor"));
            if (tab === "current-stock")
                setData(await api.get("/reports/current-stock"));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    /* --------------------------------------------------
       Helpers to transform API payloads into chart data
       -------------------------------------------------- */

    const buildTopFruitsData = (apiData) =>
        (apiData.rows || []).map((r) => ({
            name: r.fruit_name,
            boxes: Number(r.total_boxes_sold),
        }));

    const buildCurrentStockData = (apiData) => {
        const byFruit = {};
        for (const r of apiData.rows || []) {
            if (!byFruit[r.fruit_name]) {
                byFruit[r.fruit_name] = {
                    name: r.fruit_name,
                    SMALL: 0,
                    MEDIUM: 0,
                    LARGE: 0,
                };
            }
            byFruit[r.fruit_name][r.packaging_size] = Number(
                r.available_quantity
            );
        }
        return Object.values(byFruit);
    };

    const buildTopVendorData = (apiData) =>
        apiData.row
            ? [
                  {
                      name: apiData.row.vendor_name,
                      boxes: Number(apiData.row.total_boxes),
                  },
              ]
            : [];

    /* --------------------------------------------------
       Renderers per tab
       -------------------------------------------------- */

    const renderTopFruits = () => {
        const chartData = buildTopFruitsData(data);
        return (
            <>
                <div className="chart-panel">
                    <h3 className="chart-title">Boxes sold per fruit</h3>
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
                        >
                            <CartesianGrid
                                stroke="#eef2ee"
                                strokeDasharray="3 3"
                                horizontal={false}
                            />
                            <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={100}
                                tick={{ fontSize: 12, fill: "#334155" }}
                            />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(v) => [`${v} boxes`, "Sold"]}
                            />
                            <Bar dataKey="boxes" radius={[0, 8, 8, 0]}>
                                {chartData.map((_, i) => (
                                    <Cell
                                        key={i}
                                        fill={
                                            i === 0
                                                ? GREEN_1
                                                : i === 1
                                                ? GREEN_2
                                                : i === 2
                                                ? GREEN_3
                                                : GREEN_4
                                        }
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <DataTable
                    rows={data.rows}
                    columns={[
                        { key: "fruit_name", label: "Fruit" },
                        { key: "total_boxes_sold", label: "Boxes sold" },
                    ]}
                />
            </>
        );
    };

    const renderRevenue = () => (
        <>
            <div className="card-grid">
                <div className="dashboard-card">
                    <p className="card-title">Revenue</p>
                    <p className="card-value">
                        R {Number(data.revenue).toFixed(2)}
                    </p>
                    <p className="card-subtitle">
                        {data.date_from} → {data.date_to}
                    </p>
                </div>
                <div className="dashboard-card">
                    <p className="card-title">Collected</p>
                    <p className="card-value">
                        R {Number(data.collected).toFixed(2)}
                    </p>
                </div>
                <div className="dashboard-card">
                    <p className="card-title">Outstanding</p>
                    <p className="card-value">
                        R {Number(data.outstanding).toFixed(2)}
                    </p>
                </div>
                <div className="dashboard-card">
                    <p className="card-title">Sales</p>
                    <p className="card-value">{data.sale_count}</p>
                </div>
            </div>
        </>
    );

    const renderTopVendor = () => {
        const chartData = buildTopVendorData(data);
        if (!data.row) {
            return <p className="muted">No sales yet.</p>;
        }
        return (
            <>
                <div className="welcome-card">
                    <p className="welcome-label">TOP VENDOR</p>
                    <h1>{data.row.vendor_name}</h1>
                    <p>Phone: {data.row.phone_number}</p>
                    <p>
                        Boxes purchased: <strong>{data.row.total_boxes}</strong>
                    </p>
                </div>

                <div className="chart-panel">
                    <h3 className="chart-title">Boxes purchased</h3>
                    <ResponsiveContainer width="100%" height={140}>
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
                        >
                            <CartesianGrid
                                stroke="#eef2ee"
                                strokeDasharray="3 3"
                                horizontal={false}
                            />
                            <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={160}
                                tick={{ fontSize: 12, fill: "#334155" }}
                            />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                formatter={(v) => [`${v} boxes`, "Purchased"]}
                            />
                            <Bar dataKey="boxes" fill={GREEN_1} radius={[0, 8, 8, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </>
        );
    };

    const renderCurrentStock = () => {
        const chartData = buildCurrentStockData(data);
        return (
            <>
                <div className="chart-panel">
                    <h3 className="chart-title">Available boxes per fruit</h3>
                    <ResponsiveContainer width="100%" height={340}>
                        <BarChart
                            data={chartData}
                            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
                        >
                            <CartesianGrid stroke="#eef2ee" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 12, fill: "#334155" }}
                            />
                            <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="SMALL" fill={GREEN_4} name="Small" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="MEDIUM" fill={GREEN_2} name="Medium" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="LARGE" fill={GREEN_1} name="Large" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <DataTable
                    rows={data.rows}
                    columns={[
                        { key: "fruit_name", label: "Fruit" },
                        { key: "packaging_size", label: "Size" },
                        { key: "available_quantity", label: "Available" },
                        {
                            key: "selling_price",
                            label: "Selling price (R)",
                            render: (r) =>
                                r.selling_price !== undefined
                                    ? Number(r.selling_price).toFixed(2)
                                    : "—",
                        },
                    ]}
                />
            </>
        );
    };

    const renderData = () => {
        if (!data) return null;
        if (tab === "top-fruits") return renderTopFruits();
        if (tab === "revenue") return renderRevenue();
        if (tab === "top-vendor") return renderTopVendor();
        if (tab === "current-stock") return renderCurrentStock();
        return null;
    };

    return (
        <div className="page">
            <h2>Reports</h2>

            <div className="report-tabs">
                <button
                    className={tab === "top-fruits" ? "tab active" : "tab"}
                    onClick={() => setTab("top-fruits")}
                >
                    Top 5 fruits
                </button>
                <button
                    className={tab === "revenue" ? "tab active" : "tab"}
                    onClick={() => setTab("revenue")}
                >
                    Revenue
                </button>
                <button
                    className={tab === "top-vendor" ? "tab active" : "tab"}
                    onClick={() => setTab("top-vendor")}
                >
                    Top vendor
                </button>
                <button
                    className={tab === "current-stock" ? "tab active" : "tab"}
                    onClick={() => setTab("current-stock")}
                >
                    Current stock
                </button>
            </div>

            {tab === "revenue" && (
                <div className="report-filters">
                    <label>
                        From
                        <input
                            type="date"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                        />
                    </label>
                    <label>
                        To
                        <input
                            type="date"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                        />
                    </label>
                </div>
            )}

            <button className="btn-primary" onClick={run} disabled={loading}>
                {loading ? "Running..." : "Run report"}
            </button>

            {error && <div className="error-message">{error}</div>}
            {renderData()}
        </div>
    );
}