export default function DashboardCard({ title, value, subtitle }) {
    return (
        <div className="dashboard-card">
            <p className="card-title">{title}</p>
            <p className="card-value">{value}</p>
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
    );
}