import { NavLink } from "react-router-dom";

const links = [
    { to: "/dashboard",  label: "Dashboard" },
    { to: "/suppliers",  label: "Suppliers" },
    { to: "/products",   label: "Fruits & Stock" },
    { to: "/purchases",  label: "Purchases" },
    { to: "/vendors",    label: "Vendors" },
    { to: "/sales",      label: "Sales" },
    { to: "/payments",   label: "Payments" },
    { to: "/reports",    label: "Reports" },
    { to: "/users",      label: "Users" },
];

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-icon">BF</div>
                <div>
                    <h2>Batloung Farm</h2>
                    <span>Distribution System</span>
                </div>
            </div>
            <nav className="sidebar-nav">
                {links.map((l) => (
                    <NavLink
                        key={l.to}
                        to={l.to}
                        className={({ isActive }) =>
                            isActive ? "sidebar-link active" : "sidebar-link"
                        }
                    >
                        {l.label}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
}