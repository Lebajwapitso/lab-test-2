
import { useEffect, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import SearchBar from "../components/SearchBar";

const emptyForm = { vendor_name: "", phone_number: "", location: "" };

function VendorMap({ location, height = "220px" }) {
    if (!location || !location.trim()) {
        return (
            <div className="vendor-map-empty">
                Location has not been provided.
            </div>
        );
    }

    const mapQuery = encodeURIComponent(location);

    return (
        <div className="vendor-map-container">
            <iframe
                title={`Map of ${location}`}
                width="100%"
                height={height}
                style={{
                    border: 0,
                    borderRadius: "10px",
                    display: "block"
                }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
            />

            <a
                className="vendor-map-link"
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                Open in Google Maps
            </a>
        </div>
    );
}

export default function Vendors() {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [mapVendor, setMapVendor] = useState(null);

    const load = async () => {
        try {
            const data = await api.get("/vendors");
            setRows(data.vendors || []);
        } catch (e) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setError("");
        setOpen(true);
    };

    const openEdit = (r) => {
        setEditing(r);
        setForm({
            vendor_name: r.vendor_name || "",
            phone_number: r.phone_number || "",
            location: r.location || ""
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
                await api.put(`/vendors/${editing.vendor_id}`, form);
            } else {
                await api.post("/vendors", form);
            }

            setOpen(false);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const filtered = rows.filter(
        (r) =>
            (r.vendor_name || "").toLowerCase().includes(search.toLowerCase()) ||
            (r.phone_number || "").includes(search) ||
            (r.location || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="page">
            <div className="page-header">
                <h2>Vendors</h2>

                <div className="page-actions">
                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search vendors..."
                    />

                    <button
                        className="btn-primary"
                        onClick={openCreate}
                    >
                        + New vendor
                    </button>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <DataTable
                rows={filtered}
                columns={[
                    { key: "vendor_id", label: "#" },
                    { key: "vendor_name", label: "Vendor" },
                    { key: "phone_number", label: "Phone" },
                    { key: "location", label: "Location" },
                    { key: "registration_date", label: "Registered" },
                    {
                        key: "map",
                        label: "Map",
                        render: (r) => (
                            <button
                                className="btn-link"
                                onClick={() => setMapVendor(r)}
                            >
                                View Map
                            </button>
                        ),
                    },
                    {
                        key: "actions",
                        label: "Actions",
                        render: (r) => (
                            <button
                                className="btn-link"
                                onClick={() => openEdit(r)}
                            >
                                Edit
                            </button>
                        ),
                    },
                ]}
            />

            {/* Individual vendor map modal */}
            {mapVendor && (
                <Modal
                    open={true}
                    title={`Location: ${mapVendor.vendor_name}`}
                    onClose={() => setMapVendor(null)}
                >
                    <div className="vendor-map-details">
                        <p>
                            <strong>Vendor:</strong>{" "}
                            {mapVendor.vendor_name}
                        </p>

                        <p>
                            <strong>Location:</strong>{" "}
                            {mapVendor.location}
                        </p>

                        <p>
                            <strong>Phone:</strong>{" "}
                            {mapVendor.phone_number}
                        </p>

                        <VendorMap
                            location={mapVendor.location}
                            height="350px"
                        />
                    </div>
                </Modal>
            )}

            {/* Create/Edit vendor modal */}
            <Modal
                open={open}
                title={editing ? "Edit vendor" : "New vendor"}
                onClose={() => setOpen(false)}
            >
                <form onSubmit={handleSubmit} className="form-grid">
                    <label className="span-2">
                        Vendor name
                        <input
                            value={form.vendor_name}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    vendor_name: e.target.value
                                })
                            }
                            required
                        />
                    </label>

                    <label>
                        Phone
                        <input
                            value={form.phone_number}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    phone_number: e.target.value
                                })
                            }
                            required
                        />
                    </label>

                    <label>
                        Location
                        <input
                            value={form.location}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    location: e.target.value
                                })
                            }
                            required
                            placeholder="Enter address, town or village"
                        />
                    </label>

                    {/* Live location map preview */}
                    {form.location.trim() && (
                        <div className="span-2">
                            <h4>Location preview</h4>

                            <VendorMap
                                location={form.location}
                                height="250px"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="error-message span-2">
                            {error}
                        </div>
                    )}

                    <div className="form-actions span-2">
                        <button
                            type="button"
                            className="btn-link"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={busy}
                        >
                            {busy ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
