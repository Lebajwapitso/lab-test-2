import { useEffect, useState } from "react";
import api from "../services/api";
import DashboardCard from "../components/DashboardCard";
import DataTable from "../components/DataTable";

export default function SalesDashboard() {
    const [sales, setSales] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const data = await api.get("/sales");
                setSales(data.sales);
            } catch (e) { setError(e.message); }
        })();
    }, []);

    const totalRevenue = sales.reduce((s, r) => s + Number(r.total_amount), 0);
    const outstanding  = sales.reduce((s, r) => s + Number(r.outstanding), 0);

    return (
        <div className="page">
            <div className="card-grid">
                <DashboardCard title="Sales" value={sales.length} />
                <DashboardCard title="Revenue (R)" value={totalRevenue.toFixed(2)} />
                <DashboardCard title="Outstanding (R)" value={outstanding.toFixed(2)} />
            </div>

            {error && <div className="error-message">{error}</div>}

            <DataTable
                rows={sales}
                columns={[
                    { key: "sale_id", label: "#" },
                    { key: "vendor_name", label: "Vendor" },
                    { key: "sale_date", label: "Date" },
                    { key: "total_amount", label: "Total (R)" },
                    { key: "amount_paid", label: "Paid (R)" },
                    { key: "outstanding", label: "Outstanding (R)" },
                    { key: "payment_status", label: "Status" },
                ]}
            />
        </div>
    );
}