export default function DataTable({ columns, rows, emptyText = "No records." }) {
    return (
        <div className="data-table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map((c) => (
                            <th key={c.key}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={columns.length} className="empty-row">
                                {emptyText}
                            </td>
                        </tr>
                    )}
                    {rows.map((r, i) => (
                        <tr key={r.id ?? i}>
                            {columns.map((c) => (
                                <td key={c.key}>
                                    {c.render ? c.render(r) : r[c.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}