import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";

export default function Stock() {
    const [rows, setRows] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const data = await api.get("/stock");
                setRows(data.stock);
            } catch (e) { setError(e.message); }
        })();
    }, []);

    return (
        <div className="page">
            <h2>Stock</h2>
            {error && <div className="error-message">{error}</div>}
            <DataTable
                rows={rows}
                columns={[
                    { key: "fruit_name", label: "Fruit" },
                    { key: "packaging_size", label: "Size" },
                    { key: "available_quantity", label: "Available boxes" },
                    { key: "updated_at", label: "Last updated" },
                ]}
            />
        </div>
    );
}