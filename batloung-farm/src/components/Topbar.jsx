import { useNavigate } from "react-router-dom";
import api from "../services/api";

export default function Topbar({ title, onLogout }) {
    const navigate = useNavigate();

    const user = (() => {
        try { return JSON.parse(localStorage.getItem("user") || "null"); }
        catch { return null; }
    })();

    const handleLogout = async () => {
        // 1. Best-effort server-side logout (clears httpOnly cookie if set)
        try {
            await api.post("/auth/logout");
        } catch {
            // Ignore network failures during logout
        }

        // 2. Clear client-side storage
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        // 3. Prefer the parent's callback (keeps React state in sync).
        //    Fall back to a router redirect if Topbar is used standalone.
        if (typeof onLogout === "function") {
            onLogout();
        } else {
            navigate("/", { replace: true });
        }
    };

    return (
        <header className="topbar">
            <h1 className="topbar-title">{title}</h1>
            <div className="topbar-right">
                <span className="topbar-user">
                    {user?.fullName || user?.username || "User"}
                </span>
                <button className="logout-button" onClick={handleLogout}>
                    Logout
                </button>
            </div>
        </header>
    );
}