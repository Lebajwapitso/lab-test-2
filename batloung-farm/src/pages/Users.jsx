import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";

export default function Users() {
    const [rows, setRows] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const data = await api.get("/auth/users");
                setRows(data.users);
            } catch (e) { setError(e.message); }
        })();
    }, []);

    return (
        <div className="page">
            <h2>Users</h2>
            {error && <div className="error-message">{error}</div>}
            <DataTable
                rows={rows}
                columns={[
                    { key: "userId", label: "#" },
                    { key: "fullName", label: "Full name" },
                    { key: "username", label: "Username" },
                    { key: "email", label: "Email" },
                    { key: "role", label: "Role" },
                    { key: "status", label: "Status" },
                ]}
            />
        </div>
    );
}