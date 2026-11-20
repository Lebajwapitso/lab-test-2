import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";

export default function AccountantDashboard() {
    const [balances, setBalances] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const data = await api.get("/vendors/outstanding");
                setBalances(data.balances);
            } catch (e) { setError(e.message); }
        })();
    }, []);

    return (
        <div className="page">
            <h2>Outstanding balances</h2>
            {error && <div className="error-message">{error}</div>}
            <DataTable
                rows={balances}
                columns={[
                    { key: "vendor_name", label: "Vendor" },
                    { key: "phone_number", label: "Phone" },
                    { key: "sale_count", label: "Unpaid sales" },
                    { key: "outstanding", label: "Outstanding (R)" },
                ]}
            />
        </div>
    );
}