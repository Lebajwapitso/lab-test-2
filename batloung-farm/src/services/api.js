const API_BASE = `${(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")}/api`;

export { API_BASE };

function authHeader() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json",
            ...authHeader(),
        },
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, options);

    let data = null;
    try { data = await res.json(); } catch { /* non-json */ }

    if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
        throw new Error("Session expired. Please sign in again.");
    }

    if (!res.ok) {
        const msg = data?.message || `Request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }

    return data;
}

export const api = {
    get:    (p)    => request("GET", p),
    post:   (p, b) => request("POST", p, b),
    put:    (p, b) => request("PUT", p, b),
    delete: (p)    => request("DELETE", p),
};

export default api;