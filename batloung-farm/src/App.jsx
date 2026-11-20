import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

// ─── Components & Pages (must exist in your src/ tree) ─────────
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ProtectedRoute from "./components/ProtectedRoute";

import AdminDashboard from "./pages/AdminDashboard";
import StockDashboard from "./pages/StockDashboard";
import SalesDashboard from "./pages/SalesDashboard";
import AccountantDashboard from "./pages/AccountantDashboard";
import Suppliers from "./pages/Suppliers";
import Products from "./pages/Products";
import Stock from "./pages/Stock";
import Purchases from "./pages/Purchases";
import Vendors from "./pages/Vendors";
import Sales from "./pages/Sales";
import Payments from "./pages/Payments";
import Users from "./pages/Users";
import Reports from "./pages/Reports";

const API_URL = "http://localhost:5000/api/auth";

function App() {
    // LOGIN AND SIGNUP INPUTS
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");

    // UI STATES
    const [showPassword, setShowPassword] = useState(false);
    const [isSignup, setIsSignup] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // AUTHENTICATED USER
    const [user, setUser] = useState(() => {
        try {
            const savedUser = localStorage.getItem("user");
            const savedToken = localStorage.getItem("token");

            if (savedUser && savedToken) {
                return JSON.parse(savedUser);
            }
        } catch {
            localStorage.removeItem("user");
            localStorage.removeItem("token");
        }

        return null;
    });

    // =================================
    // LOGIN FUNCTION
    // =================================

    const handleLogin = async (e) => {
        e.preventDefault();

        setError("");
        setSuccess("");

        if (!username.trim() || !password) {
            setError("Please enter your username and password.");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username.trim(),
                    password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Login failed.");
            }

            // SAVE LOGIN DETAILS
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            setUser(data.user);

            setUsername("");
            setPassword("");
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the server. Check your backend."
                    : err.message
            );
        } finally {
            setLoading(false);
        }
    };

    // =================================
    // SIGNUP FUNCTION
    // =================================

    const handleSignup = async (e) => {
        e.preventDefault();

        setError("");
        setSuccess("");

        if (!fullName.trim() || !username.trim() || !email.trim() || !password) {
            setError("Please complete all the fields.");
            return;
        }

        if (password.length < 8) {
            setError("Password must contain at least 8 characters.");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    username: username.trim(),
                    email: email.trim(),
                    password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Signup failed.");
            }

            // SIGNUP SUCCESSFUL
            setSuccess(
                data.message || "Account created successfully. You can now sign in."
            );

            // CLEAR SIGNUP INPUTS
            setFullName("");
            setEmail("");
            setUsername("");
            setPassword("");
            setShowPassword(false);

            // RETURN TO LOGIN
            setIsSignup(false);
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the server. Check your backend."
                    : err.message
            );
        } finally {
            setLoading(false);
        }
    };

    // =================================
    // LOGOUT FUNCTION
    // =================================

    const handleLogout = async () => {
        const token = localStorage.getItem("token");

        try {
            if (token) {
                await fetch(`${API_URL}/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        } catch {
            // best-effort; ignore network errors during logout
        }

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        setUser(null);
        setPassword("");
        setUsername("");
        setError("");
        setSuccess("");
    };

    // =================================
    // SWITCH BETWEEN LOGIN AND SIGNUP
    // =================================

    const switchToSignup = () => {
        setIsSignup(true);
        setError("");
        setSuccess("");
        setUsername("");
        setPassword("");
        setFullName("");
        setEmail("");
    };

    const switchToLogin = () => {
        setIsSignup(false);
        setError("");
        setSuccess("");
        setUsername("");
        setPassword("");
        setFullName("");
        setEmail("");
    };

    // =================================
    // ROLE DASHBOARD
    // =================================

    const roleDashboard = {
        ADMIN: {
            title: "Administrator Dashboard",
            description: ""
        },

        STOCK_MANAGER: {
            title: "Stock Management Dashboard",
            description: "Manage fruit stock, suppliers and purchases."
        },

        SALES_CLERK: {
            title: "Sales Dashboard",
            description: "Manage vendors and record fruit sales."
        },

        ACCOUNTANT: {
            title: "Accountant Dashboard",
            description: "Manage payments and financial records."
        }
    };

    // =================================
    // DISPLAY DASHBOARD AFTER LOGIN
    // Your welcome card is still the first thing on screen.
    // Below it, the routed pages render inside the Sidebar shell.
    // =================================

    if (user) {
        const dashboard =
            roleDashboard[user.role] || roleDashboard["ADMIN"];

        const roleLabel = (user.role || "ADMIN").replaceAll("_", " ");

        const homePath =
            user.role === "STOCK_MANAGER" ? "/stock-dashboard" :
            user.role === "SALES_CLERK"   ? "/sales-dashboard" :
            user.role === "ACCOUNTANT"    ? "/accountant-dashboard" :
            "/dashboard";

        return (
            <BrowserRouter>
                <div className="app-layout">
                    <Sidebar />

                    <div className="app-main">
                        <Topbar title={dashboard.title} onLogout={handleLogout} />

                        <main className="app-content">
                            {/* Your original welcome card — kept as the top of every page */}
                            <div className="welcome-card" style={{ marginBottom: 20 }}>
                                <div className="welcome-icon">✓</div>

                                <p className="welcome-label">LOGIN SUCCESSFUL</p>

                                <h1>Welcome, {user.fullName || user.username}</h1>

                                <p>
                                    {dashboard?.description ||
                                        "Your account is authenticated."}
                                </p>

                                <div className="role-label">{roleLabel}</div>

                                <h2>{dashboard?.title || "User Dashboard"}</h2>
                            </div>

                            {/* Routed pages */}
                            <Routes>
                                <Route element={<ProtectedRoute />}>
                                    <Route path="/" element={<Navigate to={homePath} replace />} />
                                    <Route path="/dashboard" element={<AdminDashboard />} />
                                    <Route path="/stock-dashboard" element={<StockDashboard />} />
                                    <Route path="/sales-dashboard" element={<SalesDashboard />} />
                                    <Route path="/accountant-dashboard" element={<AccountantDashboard />} />
                                    <Route path="/suppliers" element={<Suppliers />} />
                                    <Route path="/products" element={<Products />} />
                                    <Route path="/stock" element={<Stock />} />
                                    <Route path="/purchases" element={<Purchases />} />
                                    <Route path="/vendors" element={<Vendors />} />
                                    <Route path="/sales" element={<Sales />} />
                                    <Route path="/payments" element={<Payments />} />
                                    <Route path="/users" element={<Users />} />
                                    <Route path="/reports" element={<Reports />} />
                                    <Route path="*" element={<Navigate to={homePath} replace />} />
                                </Route>
                            </Routes>
                        </main>
                    </div>
                </div>
            </BrowserRouter>
        );
    }

    // =================================
    // LOGIN AND SIGNUP PAGE
    // =================================

    return (
        <div className="login-page">
            <div className="login-container">
                {/* LEFT SIDE */}

                <div className="login-left">
                    <div className="login-brand">
                        <div className="brand-icon">BF</div>

                        <div>
                            <h2>Batloung Farm</h2>
                            <span>Distribution Management</span>
                        </div>
                    </div>

                    <div className="login-introduction">
                        <span className="intro-tag">
                            FRESH PRODUCE DISTRIBUTION
                        </span>

                        <h1>
                            Manage your
                            <span> distribution </span>
                            operations efficiently.
                        </h1>

                        <p>
                            A centralized platform for managing
                            suppliers, fruits, stock, vendors,
                            purchases and sales.
                        </p>
                    </div>

                    <div className="login-footer">
                        © 2026 Batloung Farm. All rights reserved.
                    </div>
                </div>

                {/* RIGHT SIDE */}

                <div className="login-right">
                    <div className="login-form-container">
                        {/* FORM HEADING */}

                        <div className="form-heading">
                            <span className="welcome-text">
                                {isSignup
                                    ? "CREATE YOUR ACCOUNT"
                                    : "WELCOME BACK"}
                            </span>

                            <h2>
                                {isSignup
                                    ? "Create an account"
                                    : "Sign in to your account"}
                            </h2>

                            <p>
                                {isSignup
                                    ? "Enter your details to register."
                                    : "Enter your account details to continue."}
                            </p>
                        </div>

                        {/* LOGIN FORM */}

                        {!isSignup && (
                            <form onSubmit={handleLogin}>
                                {/* USERNAME */}

                                <div className="form-group">
                                    <label htmlFor="username">Username</label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <circle cx="12" cy="8" r="4" />
                                                <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                                            </svg>
                                        </span>

                                        <input
                                            id="username"
                                            type="text"
                                            placeholder="Enter your username"
                                            value={username}
                                            onChange={(e) =>
                                                setUsername(e.target.value)
                                            }
                                            autoComplete="username"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* PASSWORD */}

                                <div className="form-group">
                                    <label htmlFor="password">Password</label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <rect
                                                    x="4"
                                                    y="10"
                                                    width="16"
                                                    height="11"
                                                    rx="2"
                                                />
                                                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                            </svg>
                                        </span>

                                        <input
                                            id="password"
                                            type={
                                                showPassword ? "text" : "password"
                                            }
                                            placeholder="Enter your password"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            autoComplete="current-password"
                                            required
                                        />

                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                        >
                                            {showPassword ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                </div>

                                {/* LOGIN ERROR */}

                                {error && (
                                    <div className="error-message">{error}</div>
                                )}

                                {/* SIGNUP SUCCESS */}

                                {success && (
                                    <div className="success-message">
                                        {success}
                                    </div>
                                )}

                                {/* LOGIN BUTTON */}

                                <button
                                    type="submit"
                                    className="login-button"
                                    disabled={loading}
                                >
                                    {loading ? "Signing in..." : "Sign In"}

                                    {!loading && <span>→</span>}
                                </button>

                                {/* SIGNUP LINK */}

                                <div className="signup-switch">
                                    <p>Don't have an account?</p>

                                    <button
                                        type="button"
                                        onClick={switchToSignup}
                                    >
                                        Sign Up
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* SIGNUP FORM */}

                        {isSignup && (
                            <form onSubmit={handleSignup}>
                                {/* FULL NAME */}

                                <div className="form-group">
                                    <label htmlFor="fullName">Full Name</label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <circle cx="12" cy="8" r="4" />
                                                <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                                            </svg>
                                        </span>

                                        <input
                                            id="fullName"
                                            type="text"
                                            placeholder="Enter your full name"
                                            value={fullName}
                                            onChange={(e) =>
                                                setFullName(e.target.value)
                                            }
                                            autoComplete="name"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* USERNAME */}

                                <div className="form-group">
                                    <label htmlFor="signupUsername">
                                        Username
                                    </label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <circle cx="12" cy="8" r="4" />
                                                <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                                            </svg>
                                        </span>

                                        <input
                                            id="signupUsername"
                                            type="text"
                                            placeholder="Choose a username"
                                            value={username}
                                            onChange={(e) =>
                                                setUsername(e.target.value)
                                            }
                                            autoComplete="username"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* EMAIL */}

                                <div className="form-group">
                                    <label htmlFor="email">
                                        Email Address
                                    </label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <rect
                                                    x="3"
                                                    y="5"
                                                    width="18"
                                                    height="14"
                                                    rx="2"
                                                />
                                                <path d="m3 7 9 6 9-6" />
                                            </svg>
                                        </span>

                                        <input
                                            id="email"
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) =>
                                                setEmail(e.target.value)
                                            }
                                            autoComplete="email"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* PASSWORD */}

                                <div className="form-group">
                                    <label htmlFor="signupPassword">
                                        Password
                                    </label>

                                    <div className="input-wrapper">
                                        <span className="input-icon">
                                            <svg viewBox="0 0 24 24">
                                                <rect
                                                    x="4"
                                                    y="10"
                                                    width="16"
                                                    height="11"
                                                    rx="2"
                                                />
                                                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                            </svg>
                                        </span>

                                        <input
                                            id="signupPassword"
                                            type={
                                                showPassword ? "text" : "password"
                                            }
                                            placeholder="Create a password (minimum 8 characters)"
                                            value={password}
                                            onChange={(e) =>
                                                setPassword(e.target.value)
                                            }
                                            autoComplete="new-password"
                                            minLength={8}
                                            required
                                        />

                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                        >
                                            {showPassword ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                </div>

                                {/* SIGNUP ERROR */}

                                {error && (
                                    <div className="error-message">{error}</div>
                                )}

                                {/* SIGNUP BUTTON */}

                                <button
                                    type="submit"
                                    className="login-button"
                                    disabled={loading}
                                >
                                    {loading
                                        ? "Creating account..."
                                        : "Create Account"}

                                    {!loading && <span>→</span>}
                                </button>

                                {/* RETURN TO LOGIN */}

                                <div className="signup-switch">
                                    <p>Already have an account?</p>

                                    <button
                                        type="button"
                                        onClick={switchToLogin}
                                    >
                                        Sign In
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* SECURITY FOOTER */}

                        <div className="login-security">
                            <span></span>
                        
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;