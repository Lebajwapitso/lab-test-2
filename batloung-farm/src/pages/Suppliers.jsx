import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import SearchBar from "../components/SearchBar";

const PROVINCES = [
    "Gauteng", "Free State", "KwaZulu-Natal", "Western Cape",
    "Eastern Cape", "Limpopo", "Mpumalanga", "North West",
];

const emptyForm = {
    business_name: "", contact_person: "", phone: "",
    province: "Gauteng", address: "",
};

export default function Suppliers() {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const data = await api.get("/suppliers");
            setRows(data.suppliers);
        } catch (e) { setError(e.message); }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setError("");
        setOpen(true);
    };

    const openEdit = (row) => {
        setEditing(row);
        setForm({
            business_name: row.business_name,
            contact_person: row.contact_person,
            phone: row.phone,
            province: row.province,
            address: row.address,
        });
        setError("");
        setOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            if (editing) {
                await api.put(`/suppliers/${editing.supplier_id}`, form);
            } else {
                await api.post("/suppliers", form);
            }
            setOpen(false);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (row) => {
        if (!window.confirm(`Delete supplier "${row.business_name}"?`)) return;
        try {
            await api.delete(`/suppliers/${row.supplier_id}`);
            await load();
        } catch (e) {
            setError(e.message);
        }
    };

    const filtered = rows.filter(
        (r) =>
            r.business_name.toLowerCase().includes(search.toLowerCase()) ||
            r.contact_person.toLowerCase().includes(search.toLowerCase()) ||
            r.phone.includes(search)
    );

    return (
        <div className="page">
            <div className="page-header">
                <h2>Suppliers</h2>
                <div className="page-actions">
                    <SearchBar value={search} onChange={setSearch} placeholder="Search suppliers..." />
                    <button className="btn-primary" onClick={openCreate}>+ New supplier</button>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <DataTable
                rows={filtered}
                columns={[
                    { key: "business_name", label: "Business" },
                    { key: "contact_person", label: "Contact" },
                    { key: "phone", label: "Phone" },
                    { key: "province", label: "Province" },
                    { key: "address", label: "Address" },
                    {
                        key: "actions", label: "Actions",
                        render: (r) => (
                            <div className="row-actions">
                                <button className="btn-link" onClick={() => openEdit(r)}>Edit</button>
                                <button className="btn-link danger" onClick={() => handleDelete(r)}>Delete</button>
                            </div>
                        ),
                    },
                ]}
            />

            <Modal
                open={open}
                title={editing ? "Edit supplier" : "New supplier"}
                onClose={() => setOpen(false)}
            >
                <form onSubmit={handleSubmit} className="form-grid">
                    <label>Business name
                        <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
                    </label>
                    <label>Contact person
                        <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} required />
                    </label>
                    <label>Phone
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                    </label>
                    <label>Province
                        <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>
                            {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className="span-2">Address
                        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
                    </label>
                    {error && <div className="error-message span-2">{error}</div>}
                    <div className="form-actions span-2">
                        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={busy}>
                            {busy ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}