import { useEffect, useState } from "react";
import api from "../services/api";
import DashboardCard from "../components/DashboardCard";

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        suppliers: 0, fruits: 0, vendors: 0, sales: 0,
        revenue: 0, lowStock: 0,
    });

    useEffect(() => {
        (async () => {
            try {
                const [sup, fr, ven, sales, low, rev] = await Promise.all([
                    api.get("/suppliers"),
                    api.get("/fruits"),
                    api.get("/vendors"),
                    api.get("/sales"),
                    api.get("/stock/low?threshold=10"),
                    api.get("/reports/revenue?start=2000-01-01&end=2100-12-31"),
                ]);
                setStats({
                    suppliers: sup.count,
                    fruits: fr.count,
                    vendors: ven.count,
                    sales: sales.count,
                    revenue: rev.revenue ?? 0,
                    lowStock: low.count,
                });
            } catch (err) {
                console.error(err);
            }
        })();
    }, []);

    return (
        <div className="page">
            <div className="card-grid">
                <DashboardCard title="Suppliers"   value={stats.suppliers} />
                <DashboardCard title="Fruits"      value={stats.fruits} />
                <DashboardCard title="Vendors"     value={stats.vendors} />
                <DashboardCard title="Sales"       value={stats.sales} />
                <DashboardCard title="Revenue (R)" value={Number(stats.revenue).toFixed(2)} />
                <DashboardCard title="Low stock"   value={stats.lowStock} subtitle="≤ 10 boxes" />
            </div>
        </div>
    );
}