// server.js

require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const crypto = require("crypto");
const { promisify } = require("util");

const app = express();
const PORT = process.env.PORT || 5000;

const scryptAsync = promisify(crypto.scrypt);

// ==============================
// MIDDLEWARE
// ==============================

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==============================
// MYSQL CONNECTION
// ==============================

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "batloung_distribution",
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    decimalNumbers: true
});

// ==============================
// PASSWORD HASHING (SCRYPT)
// ==============================

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(password, salt, 64);
    return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
    try {
        const parts = String(storedPassword).split(":");
        if (parts.length !== 2) return false;

        const salt = parts[0];
        const storedHash = Buffer.from(parts[1], "hex");
        const derivedKey = await scryptAsync(password, salt, 64);

        if (storedHash.length !== derivedKey.length) return false;
        return crypto.timingSafeEqual(storedHash, derivedKey);
    } catch (error) {
        return false;
    }
}

// ==============================
// VALIDATION
// ==============================

function validUsername(username) {
    return /^[A-Za-z0-9_]{3,50}$/.test(username);
}
function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

// ==============================
// SCHEMA INSPECTION HELPERS
// ==============================

async function columnExists(table, column) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = ?
            AND column_name = ?
          LIMIT 1`,
        [table, column]
    );
    return rows.length > 0;
}

async function tableExists(table) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name = ?
          LIMIT 1`,
        [table]
    );
    return rows.length > 0;
}

let HAS_ROLE_ID = false;
let HAS_ROLES_TABLE = false;
let HAS_ACCOUNT_STATUS = false;

async function inspectSchema() {
    try {
        HAS_ROLES_TABLE = await tableExists("roles");
        HAS_ROLE_ID = await columnExists("users", "role_id");
        HAS_ACCOUNT_STATUS = await columnExists("users", "account_status");
        console.log(
            `[schema] roles_table=${HAS_ROLES_TABLE} users.role_id=${HAS_ROLE_ID} users.account_status=${HAS_ACCOUNT_STATUS}`
        );
    } catch (err) {
        console.error("[schema] inspection failed:", err.code || err.message);
    }
}

// ==============================
// DATABASE INITIALIZATION
// ==============================

async function initializeDatabase() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS roles (
                role_id INT AUTO_INCREMENT PRIMARY KEY,
                role_name VARCHAR(50) NOT NULL UNIQUE
            )
        `);

        if (!(await tableExists("users"))) {
            await db.query(`
                CREATE TABLE users (
                    user_id INT AUTO_INCREMENT PRIMARY KEY,
                    full_name VARCHAR(100) NOT NULL,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    email VARCHAR(100) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    role_id INT NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (role_id) REFERENCES roles(role_id)
                )
            `);
        }

        const roles = ["ADMIN", "STOCK_MANAGER", "SALES_CLERK", "ACCOUNTANT"];
        for (const role of roles) {
            await db.query(
                `INSERT IGNORE INTO roles (role_name) VALUES (?)`,
                [role]
            );
        }
        console.log("Roles initialized.");

        await inspectSchema();
        await createInitialAdmin();
    } catch (error) {
        console.error(
            "initializeDatabase warning (non-fatal):",
            error.code || error.message
        );
    }
}

// ==============================
// INITIAL ADMIN
// ==============================

async function createInitialAdmin() {
    const fullName = process.env.ADMIN_NAME || "System Administrator";
    const username = process.env.ADMIN_USERNAME || "admin";
    const email = (process.env.ADMIN_EMAIL || "admin@batloung.local").toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
        console.log(
            "ADMIN_PASSWORD is not configured. Initial admin creation skipped."
        );
        return;
    }

    const [existingAdmin] = await db.query(
        `SELECT user_id FROM users
         WHERE username = ? OR email = ?
         LIMIT 1`,
        [username, email]
    );

    if (existingAdmin.length > 0) {
        console.log("Initial admin already exists.");
        return;
    }

    let adminRoleId = null;
    if (HAS_ROLES_TABLE && HAS_ROLE_ID) {
        const [roles] = await db.query(
            `SELECT role_id FROM roles WHERE role_name = 'ADMIN' LIMIT 1`
        );
        if (roles.length > 0) adminRoleId = roles[0].role_id;
    }

    const passwordHash = await hashPassword(password);

    if (HAS_ROLE_ID && adminRoleId !== null) {
        const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";
        await db.query(
            `INSERT INTO users
                (full_name, username, email, password_hash, role_id, ${statusColumn})
             VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
            [fullName, username, email, passwordHash, adminRoleId]
        );
    } else {
        await db.query(
            `INSERT INTO users
                (full_name, username, email, password_hash, account_status)
             VALUES (?, ?, ?, ?, 'ACTIVE')`,
            [fullName, username, email, passwordHash]
        );
    }

    console.log("Initial administrator created.");
}

// ==============================
// JWT AUTHENTICATION
// ==============================

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.headers.cookie) {
        const match = /(?:^|;\s*)batloung_token=([^;]+)/.exec(req.headers.cookie);
        if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Access token is required."
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token."
            });
        }
        req.user = decoded;
        next();
    });
}

// ==============================
// ROLE AUTHORIZATION
// ==============================

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({
                success: false,
                message: "Role information is missing."
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to access this resource."
            });
        }
        next();
    };
}

// ==============================
// HEALTH CHECK
// ==============================

app.get("/api/health", async (req, res) => {
    try {
        await db.query("SELECT 1");
        res.status(200).json({
            status: "ok",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({
            status: "degraded",
            database: "disconnected",
            error: err.code || "DB_UNAVAILABLE",
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================
// HOME ROUTE
// ==============================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Batloung Farm Distribution Management System API is running."
    });
});

// ==============================
// SIGNUP
// ==============================

app.post("/api/auth/signup", async (req, res) => {
    try {
        const fullName =
            req.body.fullName ||
            req.body.full_name ||
            req.body.name;

        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;

        if (!fullName || !username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const cleanFullName = String(fullName).trim();
        const cleanUsername = String(username).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (!validUsername(cleanUsername)) {
            return res.status(400).json({
                success: false,
                message:
                    "Username must be 3-50 characters and contain only letters, numbers or underscores."
            });
        }
        if (!validEmail(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }
        if (!validPassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        const [existingUser] = await db.query(
            `SELECT user_id FROM users
             WHERE username = ? OR email = ?
             LIMIT 1`,
            [cleanUsername, cleanEmail]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Username or email already exists."
            });
        }

        const passwordHash = await hashPassword(password);

        let assignedRole = "ADMIN";

        if (HAS_ROLE_ID && HAS_ROLES_TABLE) {
            const [roleRows] = await db.query(
                `SELECT role_id FROM roles
                 WHERE role_name = 'SALES_CLERK'
                 LIMIT 1`
            );
            const roleId = roleRows.length > 0 ? roleRows[0].role_id : null;
            const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";

            if (roleId !== null) {
                await db.query(
                    `INSERT INTO users
                        (full_name, username, email, password_hash, role_id, ${statusColumn})
                     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                    [cleanFullName, cleanUsername, cleanEmail, passwordHash, roleId]
                );
                assignedRole = "SALES_CLERK";
            } else {
                await db.query(
                    `INSERT INTO users
                        (full_name, username, email, password_hash, ${statusColumn})
                     VALUES (?, ?, ?, ?, 'ACTIVE')`,
                    [cleanFullName, cleanUsername, cleanEmail, passwordHash]
                );
            }
        } else {
            await db.query(
                `INSERT INTO users
                    (full_name, username, email, password_hash, account_status)
                 VALUES (?, ?, ?, ?, 'ACTIVE')`,
                [cleanFullName, cleanUsername, cleanEmail, passwordHash]
            );
        }

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            user: {
                userId: null,
                fullName: cleanFullName,
                username: cleanUsername,
                email: cleanEmail,
                role: assignedRole
            },
            assignedRole
        });
    } catch (error) {
        console.error("Signup error:", error.code || error.message);
        return res.status(500).json({
            success: false,
            message: "An error occurred during signup."
        });
    }
});

// ==============================
// LOGIN
// ==============================

app.post("/api/auth/login", async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username/email and password are required."
            });
        }

        const loginValue = String(username).trim();
        let user = null;
        let userRole = "ADMIN";

        if (HAS_ROLES_TABLE && HAS_ROLE_ID) {
            const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";
            const [rows] = await db.query(
                `SELECT
                    users.user_id,
                    users.full_name,
                    users.username,
                    users.email,
                    users.password_hash,
                    users.${statusColumn} AS status_value,
                    roles.role_name
                FROM users
                INNER JOIN roles ON users.role_id = roles.role_id
                WHERE users.username = ? OR users.email = ?
                LIMIT 1`,
                [loginValue, loginValue.toLowerCase()]
            );
            if (rows.length > 0) {
                user = rows[0];
                userRole = rows[0].role_name || "ADMIN";
            }
        } else {
            const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";
            const [rows] = await db.query(
                `SELECT
                    user_id, full_name, username, email,
                    password_hash, ${statusColumn} AS status_value
                FROM users
                WHERE username = ? OR email = ?
                LIMIT 1`,
                [loginValue, loginValue.toLowerCase()]
            );
            if (rows.length > 0) {
                user = rows[0];
                userRole = "ADMIN";
            }
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username/email or password."
            });
        }

        if (user.status_value !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Contact the administrator."
            });
        }

        const passwordMatch = await verifyPassword(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username/email or password."
            });
        }

        const token = jwt.sign(
            { userId: user.user_id, username: user.username, role: userRole },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
        );

        db.query("UPDATE users SET last_login = NOW() WHERE user_id = ?", [
            user.user_id
        ]).catch(() => {});

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                userId: user.user_id,
                fullName: user.full_name,
                username: user.username,
                email: user.email,
                role: userRole
            }
        });
    } catch (error) {
        console.error("Login error:", error.code || error.message);
        return res.status(500).json({
            success: false,
            message: "An error occurred during login."
        });
    }
});

// ==============================
// USER PROFILE
// ==============================

async function profileHandler(req, res) {
    try {
        const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";
        const [users] = await db.query(
            `SELECT user_id, full_name, username, email,
                    ${statusColumn} AS status_value
             FROM users WHERE user_id = ? LIMIT 1`,
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const u = users[0];
        return res.json({
            success: true,
            user: {
                userId: u.user_id,
                fullName: u.full_name,
                username: u.username,
                email: u.email,
                role: req.user.role || "ADMIN",
                status: u.status_value
            }
        });
    } catch (error) {
        console.error("Profile error:", error.code || error.message);
        return res.status(500).json({
            success: false,
            message: "Could not retrieve profile."
        });
    }
}

app.get("/api/auth/profile", authenticateToken, profileHandler);
app.get("/api/auth/me", authenticateToken, profileHandler);

// ==============================
// LOGOUT
// ==============================

app.post("/api/auth/logout", authenticateToken, (req, res) => {
    res.clearCookie?.("batloung_token", { path: "/" });
    return res.status(200).json({
        success: true,
        message: "Logged out successfully."
    });
});

// ==============================
// ADMIN: CREATE USER
// ==============================

app.post(
    "/api/auth/create-user",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const fullName = req.body.fullName || req.body.full_name;
            const username = req.body.username;
            const email = req.body.email;
            const password = req.body.password;
            const roleName = req.body.role || req.body.role_name;

            if (!fullName || !username || !email || !password || !roleName) {
                return res.status(400).json({
                    success: false,
                    message: "All fields are required."
                });
            }

            const cleanFullName = String(fullName).trim();
            const cleanUsername = String(username).trim();
            const cleanEmail = String(email).trim().toLowerCase();
            const cleanRole = String(roleName).trim().toUpperCase();

            if (!validUsername(cleanUsername)) {
                return res.status(400).json({ success: false, message: "Invalid username." });
            }
            if (!validEmail(cleanEmail)) {
                return res.status(400).json({ success: false, message: "Invalid email." });
            }
            if (!validPassword(password)) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 8 characters."
                });
            }

            const allowedRoles = ["ADMIN", "STOCK_MANAGER", "SALES_CLERK", "ACCOUNTANT"];
            if (!allowedRoles.includes(cleanRole)) {
                return res.status(400).json({ success: false, message: "Invalid role." });
            }

            const [existingUser] = await db.query(
                `SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1`,
                [cleanUsername, cleanEmail]
            );
            if (existingUser.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Username or email already exists."
                });
            }

            const passwordHash = await hashPassword(password);

            if (HAS_ROLE_ID && HAS_ROLES_TABLE) {
                const [roles] = await db.query(
                    `SELECT role_id FROM roles WHERE role_name = ? LIMIT 1`,
                    [cleanRole]
                );
                const roleId = roles.length > 0 ? roles[0].role_id : null;
                const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";

                if (roleId !== null) {
                    await db.query(
                        `INSERT INTO users
                            (full_name, username, email, password_hash, role_id, ${statusColumn})
                         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                        [cleanFullName, cleanUsername, cleanEmail, passwordHash, roleId]
                    );
                } else {
                    await db.query(
                        `INSERT INTO users
                            (full_name, username, email, password_hash, ${statusColumn})
                         VALUES (?, ?, ?, ?, 'ACTIVE')`,
                        [cleanFullName, cleanUsername, cleanEmail, passwordHash]
                    );
                }
            } else {
                await db.query(
                    `INSERT INTO users
                        (full_name, username, email, password_hash, account_status)
                     VALUES (?, ?, ?, ?, 'ACTIVE')`,
                    [cleanFullName, cleanUsername, cleanEmail, passwordHash]
                );
            }

            return res.status(201).json({
                success: true,
                message: "User created successfully.",
                user: {
                    userId: null,
                    fullName: cleanFullName,
                    username: cleanUsername,
                    email: cleanEmail,
                    role: HAS_ROLE_ID && HAS_ROLES_TABLE ? cleanRole : "ADMIN"
                }
            });
        } catch (error) {
            console.error("Create user error:", error.code || error.message);
            return res.status(500).json({
                success: false,
                message: "Could not create user."
            });
        }
    }
);

// ==============================
// ADMIN: VIEW USERS
// ==============================

app.get(
    "/api/auth/users",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {
            const statusColumn = HAS_ACCOUNT_STATUS ? "account_status" : "status";
            let users;

            if (HAS_ROLE_ID && HAS_ROLES_TABLE) {
                const [rows] = await db.query(
                    `SELECT
                        users.user_id, users.full_name, users.username, users.email,
                        users.${statusColumn} AS status_value, users.created_at,
                        roles.role_name
                    FROM users
                    INNER JOIN roles ON users.role_id = roles.role_id
                    ORDER BY users.user_id DESC`
                );
                users = rows;
            } else {
                const [rows] = await db.query(
                    `SELECT
                        user_id, full_name, username, email,
                        ${statusColumn} AS status_value, created_at
                    FROM users
                    ORDER BY user_id DESC`
                );
                users = rows;
            }

            return res.json({
                success: true,
                users: users.map((user) => ({
                    userId: user.user_id,
                    fullName: user.full_name,
                    username: user.username,
                    email: user.email,
                    role: user.role_name || "ADMIN",
                    status: user.status_value,
                    createdAt: user.created_at
                }))
            });
        } catch (error) {
            console.error("Users list error:", error.code || error.message);
            return res.status(500).json({
                success: false,
                message: "Could not retrieve users."
            });
        }
    }
);

// ==============================
// ROLE-BASED TEST DASHBOARDS
// ==============================

app.get(
    "/api/admin/dashboard",
    authenticateToken,
    authorizeRoles("ADMIN"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome to the Admin dashboard.",
            role: req.user.role
        });
    }
);

app.get(
    "/api/stock/dashboard",
    authenticateToken,
    authorizeRoles("ADMIN", "STOCK_MANAGER"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome to the Stock dashboard.",
            role: req.user.role
        });
    }
);

app.get(
    "/api/sales/dashboard",
    authenticateToken,
    authorizeRoles("ADMIN", "SALES_CLERK"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome to the Sales dashboard.",
            role: req.user.role
        });
    }
);

app.get(
    "/api/accountant/dashboard",
    authenticateToken,
    authorizeRoles("ADMIN", "ACCOUNTANT"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome to the Accountant dashboard.",
            role: req.user.role
        });
    }
);

// ================================================================
// PART C — BUSINESS ENDPOINTS
// ================================================================

// FRUITS WITH STOCK
app.get("/api/fruits/with-stock", authenticateToken, async (req, res) => {
    try {
        const [fruits] = await db.query(
            `SELECT fruit_id, fruit_name, description, default_price, status, created_at
             FROM fruits ORDER BY fruit_id ASC`
        );
        const [stockRows] = await db.query(
            `SELECT stock_id, fruit_id, packaging_size,
                    available_quantity, selling_price, updated_at
             FROM stock`
        );

        const byFruit = {};
        for (const s of stockRows) {
            (byFruit[s.fruit_id] ||= []).push(s);
        }

        const sizeOrder = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
        const rows = fruits.map((f) => {
            const stock = (byFruit[f.fruit_id] || [])
                .sort((a, b) => sizeOrder[a.packaging_size] - sizeOrder[b.packaging_size])
                .map((s) => ({
                    ...s,
                    resolved_price:
                        Number(s.selling_price) > 0
                            ? Number(s.selling_price)
                            : Number(f.default_price) || 0
                }));
            return { ...f, stock };
        });

        res.json({ success: true, count: rows.length, fruits: rows });
    } catch (err) {
        console.error("GET /api/fruits/with-stock", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch fruits with stock." });
    }
});

// ==============================================================
// SUPPLIERS
// ==============================================================

app.post("/api/suppliers", authenticateToken, async (req, res) => {
    try {
        const { business_name, contact_person, phone, province, address } = req.body || {};
        if (!business_name || !contact_person || !phone || !province || !address) {
            return res.status(400).json({
                success: false,
                message: "business_name, contact_person, phone, province, address are required."
            });
        }

        const allowedProvinces = [
            "Gauteng", "Free State", "KwaZulu-Natal", "Western Cape",
            "Eastern Cape", "Limpopo", "Mpumalanga", "North West"
        ];
        if (!allowedProvinces.includes(province)) {
            return res.status(400).json({
                success: false,
                message: "province must be one of: " + allowedProvinces.join(", ")
            });
        }

        const [result] = await db.query(
            `INSERT INTO suppliers (business_name, contact_person, phone, province, address)
             VALUES (?, ?, ?, ?, ?)`,
            [business_name, contact_person, phone, province, address]
        );
        const [rows] = await db.query(
            `SELECT * FROM suppliers WHERE supplier_id = ?`,
            [result.insertId]
        );

        res.status(201).json({ success: true, message: "Supplier created.", supplier: rows[0] });
    } catch (err) {
        console.error("POST /api/suppliers", err.code || err.message);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "A supplier with that business name and phone already exists."
            });
        }
        return res.status(500).json({ success: false, message: "Could not create supplier." });
    }
});

app.get("/api/suppliers", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT supplier_id, business_name, contact_person, phone, province, address, created_at
             FROM suppliers ORDER BY supplier_id DESC`
        );
        res.json({ success: true, count: rows.length, suppliers: rows });
    } catch (err) {
        console.error("GET /api/suppliers", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch suppliers." });
    }
});

app.get("/api/suppliers/:id", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM suppliers WHERE supplier_id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }
        res.json({ success: true, supplier: rows[0] });
    } catch (err) {
        console.error("GET /api/suppliers/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch supplier." });
    }
});

app.put("/api/suppliers/:id", authenticateToken, async (req, res) => {
    try {
        const { business_name, contact_person, phone, province, address } = req.body || {};
        const [existing] = await db.query(
            `SELECT supplier_id FROM suppliers WHERE supplier_id = ?`,
            [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }

        const allowedProvinces = [
            "Gauteng", "Free State", "KwaZulu-Natal", "Western Cape",
            "Eastern Cape", "Limpopo", "Mpumalanga", "North West"
        ];
        if (province && !allowedProvinces.includes(province)) {
            return res.status(400).json({
                success: false,
                message: "province must be one of: " + allowedProvinces.join(", ")
            });
        }

        await db.query(
            `UPDATE suppliers SET
                business_name  = COALESCE(?, business_name),
                contact_person = COALESCE(?, contact_person),
                phone          = COALESCE(?, phone),
                province       = COALESCE(?, province),
                address        = COALESCE(?, address)
             WHERE supplier_id = ?`,
            [business_name, contact_person, phone, province, address, req.params.id]
        );
        const [rows] = await db.query(
            `SELECT * FROM suppliers WHERE supplier_id = ?`,
            [req.params.id]
        );
        res.json({ success: true, message: "Supplier updated.", supplier: rows[0] });
    } catch (err) {
        console.error("PUT /api/suppliers/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not update supplier." });
    }
});

app.delete("/api/suppliers/:id", authenticateToken, async (req, res) => {
    try {
        const [existing] = await db.query(
            `SELECT supplier_id FROM suppliers WHERE supplier_id = ?`,
            [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Supplier not found." });
        }
        await db.query(`DELETE FROM suppliers WHERE supplier_id = ?`, [req.params.id]);
        res.json({ success: true, message: "Supplier deleted." });
    } catch (err) {
        console.error("DELETE /api/suppliers/:id", err.code || err.message);
        if (err.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                success: false,
                message: "Cannot delete: this supplier is referenced by existing purchases."
            });
        }
        res.status(500).json({ success: false, message: "Could not delete supplier." });
    }
});

// ==============================================================
// FRUITS
// ==============================================================

app.post("/api/fruits", authenticateToken, async (req, res) => {
    try {
        const { fruit_name, description, default_price } = req.body || {};
        if (!fruit_name) {
            return res.status(400).json({ success: false, message: "fruit_name is required." });
        }

        let price = 0;
        if (default_price !== undefined && default_price !== null && default_price !== "") {
            price = Number(default_price);
            if (!Number.isFinite(price) || price < 0) {
                return res.status(400).json({
                    success: false,
                    message: "default_price must be a non-negative number."
                });
            }
            price = Math.round(price * 100) / 100;
        }

        const [result] = await db.query(
            `INSERT INTO fruits (fruit_name, description, status, default_price)
             VALUES (?, ?, 'ACTIVE', ?)`,
            [fruit_name, description || null, price]
        );
        const fruitId = result.insertId;

        for (const size of ["SMALL", "MEDIUM", "LARGE"]) {
            await db.query(
                `INSERT INTO stock (fruit_id, packaging_size, available_quantity, selling_price)
                 VALUES (?, ?, 0, 0)`,
                [fruitId, size]
            );
        }
        const [rows] = await db.query(`SELECT * FROM fruits WHERE fruit_id = ?`, [fruitId]);
        res.status(201).json({ success: true, message: "Fruit created.", fruit: rows[0] });
    } catch (err) {
        console.error("POST /api/fruits", err.code || err.message);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "A fruit with that name already exists." });
        }
        res.status(500).json({ success: false, message: "Could not create fruit." });
    }
});

app.get("/api/fruits", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT fruit_id, fruit_name, description, default_price, status, created_at
             FROM fruits ORDER BY fruit_id ASC`
        );
        res.json({ success: true, count: rows.length, fruits: rows });
    } catch (err) {
        console.error("GET /api/fruits", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch fruits." });
    }
});

app.put("/api/fruits/:id", authenticateToken, async (req, res) => {
    try {
        const { fruit_name, description, status, default_price } = req.body || {};
        const [existing] = await db.query(
            `SELECT fruit_id FROM fruits WHERE fruit_id = ?`, [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Fruit not found." });
        }
        if (status && !["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({ success: false, message: "status must be ACTIVE or INACTIVE." });
        }

        let price = null;
        if (default_price !== undefined && default_price !== null && default_price !== "") {
            price = Number(default_price);
            if (!Number.isFinite(price) || price < 0) {
                return res.status(400).json({
                    success: false,
                    message: "default_price must be a non-negative number."
                });
            }
            price = Math.round(price * 100) / 100;
        }

        await db.query(
            `UPDATE fruits SET
                fruit_name    = COALESCE(?, fruit_name),
                description   = COALESCE(?, description),
                status        = COALESCE(?, status),
                default_price = COALESCE(?, default_price)
             WHERE fruit_id = ?`,
            [fruit_name, description, status, price, req.params.id]
        );
        const [rows] = await db.query(`SELECT * FROM fruits WHERE fruit_id = ?`, [req.params.id]);
        res.json({ success: true, message: "Fruit updated.", fruit: rows[0] });
    } catch (err) {
        console.error("PUT /api/fruits/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not update fruit." });
    }
});

// STOCK BY FRUIT
app.get("/api/fruits/:id/stock", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT s.stock_id, s.fruit_id, f.fruit_name, s.packaging_size,
                    s.available_quantity, s.selling_price, s.updated_at
             FROM stock s
             JOIN fruits f ON f.fruit_id = s.fruit_id
             WHERE s.fruit_id = ?
             ORDER BY FIELD(s.packaging_size,'SMALL','MEDIUM','LARGE')`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "No stock rows for that fruit." });
        }
        res.json({ success: true, stock: rows });
    } catch (err) {
        console.error("GET /api/fruits/:id/stock", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch stock." });
    }
});

// ALL STOCK
app.get("/api/stock", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT s.stock_id, s.fruit_id, f.fruit_name, s.packaging_size,
                    s.available_quantity, s.selling_price, s.updated_at
             FROM stock s
             JOIN fruits f ON f.fruit_id = s.fruit_id
             ORDER BY f.fruit_name, FIELD(s.packaging_size,'SMALL','MEDIUM','LARGE')`
        );
        res.json({ success: true, count: rows.length, stock: rows });
    } catch (err) {
        console.error("GET /api/stock", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch stock." });
    }
});

// LOW STOCK
app.get("/api/stock/low", authenticateToken, async (req, res) => {
    try {
        const threshold = Number(req.query.threshold ?? process.env.LOW_STOCK_THRESHOLD ?? 10);
        if (Number.isNaN(threshold) || threshold < 0) {
            return res.status(400).json({ success: false, message: "threshold must be a non-negative number." });
        }
        const [rows] = await db.query(
            `SELECT s.stock_id, s.fruit_id, f.fruit_name, s.packaging_size,
                    s.available_quantity, s.selling_price
             FROM stock s
             JOIN fruits f ON f.fruit_id = s.fruit_id
             WHERE s.available_quantity <= ?
             ORDER BY s.available_quantity ASC`,
            [threshold]
        );
        res.json({ success: true, threshold, count: rows.length, low_stock: rows });
    } catch (err) {
        console.error("GET /api/stock/low", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch low stock." });
    }
});

// MANUAL STOCK ADJUSTMENT
app.put("/api/stock/:fruitId/:size", authenticateToken, async (req, res) => {
    try {
        const fruitId = Number(req.params.fruitId);
        const size = String(req.params.size).toUpperCase();

        if (!Number.isInteger(fruitId) || fruitId <= 0) {
            return res.status(400).json({ success: false, message: "Invalid fruit id." });
        }
        if (!["SMALL", "MEDIUM", "LARGE"].includes(size)) {
            return res.status(400).json({
                success: false,
                message: "size must be SMALL, MEDIUM or LARGE."
            });
        }

        const hasQty = req.body?.available_quantity !== undefined;
        const hasPrice = req.body?.selling_price !== undefined;

        if (!hasQty && !hasPrice) {
            return res.status(400).json({
                success: false,
                message: "Provide available_quantity and/or selling_price."
            });
        }

        let qty = null;
        if (hasQty) {
            qty = Number(req.body.available_quantity);
            if (!Number.isInteger(qty) || qty < 0) {
                return res.status(400).json({
                    success: false,
                    message: "available_quantity must be a non-negative integer."
                });
            }
        }

        let price = null;
        if (hasPrice) {
            price = Number(req.body.selling_price);
            if (!Number.isFinite(price) || price < 0) {
                return res.status(400).json({
                    success: false,
                    message: "selling_price must be a non-negative number."
                });
            }
            price = Math.round(price * 100) / 100;
        }

        const [fruits] = await db.query(
            `SELECT fruit_id FROM fruits WHERE fruit_id = ?`, [fruitId]
        );
        if (fruits.length === 0) {
            return res.status(404).json({ success: false, message: "Fruit not found." });
        }

        const [current] = await db.query(
            `SELECT available_quantity, selling_price
             FROM stock WHERE fruit_id = ? AND packaging_size = ?`,
            [fruitId, size]
        );

        const existing = current[0] || { available_quantity: 0, selling_price: 0 };
        const finalQty = hasQty ? qty : Number(existing.available_quantity);
        const finalPrice = hasPrice ? price : Number(existing.selling_price);

        await db.query(
            `INSERT INTO stock (fruit_id, packaging_size, available_quantity, selling_price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                available_quantity = VALUES(available_quantity),
                selling_price      = VALUES(selling_price)`,
            [fruitId, size, finalQty, finalPrice]
        );

        const [rows] = await db.query(
            `SELECT s.stock_id, s.fruit_id, f.fruit_name, s.packaging_size,
                    s.available_quantity, s.selling_price, s.updated_at
             FROM stock s
             JOIN fruits f ON f.fruit_id = s.fruit_id
             WHERE s.fruit_id = ? AND s.packaging_size = ?`,
            [fruitId, size]
        );

        res.json({ success: true, message: "Stock updated.", stock: rows[0] });
    } catch (err) {
        console.error("PUT /api/stock/:fruitId/:size", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not update stock." });
    }
});

// ==============================================================
// VENDORS
// ==============================================================

app.post("/api/vendors", authenticateToken, async (req, res) => {
    try {
        const { vendor_name, phone_number, location } = req.body || {};
        if (!vendor_name || !phone_number || !location) {
            return res.status(400).json({
                success: false,
                message: "vendor_name, phone_number, location are required."
            });
        }
        const [result] = await db.query(
            `INSERT INTO vendors (vendor_name, phone_number, location, registration_date)
             VALUES (?, ?, ?, CURRENT_DATE)`,
            [vendor_name, phone_number, location]
        );
        const [rows] = await db.query(`SELECT * FROM vendors WHERE vendor_id = ?`, [result.insertId]);
        res.status(201).json({ success: true, message: "Vendor created.", vendor: rows[0] });
    } catch (err) {
        console.error("POST /api/vendors", err.code || err.message);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "A vendor with that phone number already exists."
            });
        }
        res.status(500).json({ success: false, message: "Could not create vendor." });
    }
});

app.get("/api/vendors", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT vendor_id, vendor_name, phone_number, location, registration_date, created_at
             FROM vendors ORDER BY vendor_id DESC`
        );
        res.json({ success: true, count: rows.length, vendors: rows });
    } catch (err) {
        console.error("GET /api/vendors", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch vendors." });
    }
});

app.get("/api/vendors/search", authenticateToken, async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        if (!q) {
            return res.status(400).json({ success: false, message: "q query parameter is required." });
        }
        const like = `%${q}%`;
        const [rows] = await db.query(
            `SELECT vendor_id, vendor_name, phone_number, location, registration_date
             FROM vendors
             WHERE vendor_name LIKE ? OR phone_number LIKE ?
             ORDER BY vendor_name ASC`,
            [like, like]
        );
        res.json({ success: true, query: q, count: rows.length, vendors: rows });
    } catch (err) {
        console.error("GET /api/vendors/search", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not search vendors." });
    }
});

app.get("/api/vendors/:id", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM vendors WHERE vendor_id = ?`, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Vendor not found." });
        }
        res.json({ success: true, vendor: rows[0] });
    } catch (err) {
        console.error("GET /api/vendors/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch vendor." });
    }
});

app.put("/api/vendors/:id", authenticateToken, async (req, res) => {
    try {
        const { vendor_name, phone_number, location } = req.body || {};
        const [existing] = await db.query(
            `SELECT vendor_id FROM vendors WHERE vendor_id = ?`, [req.params.id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Vendor not found." });
        }
        await db.query(
            `UPDATE vendors SET
                vendor_name  = COALESCE(?, vendor_name),
                phone_number = COALESCE(?, phone_number),
                location     = COALESCE(?, location)
             WHERE vendor_id = ?`,
            [vendor_name, phone_number, location, req.params.id]
        );
        const [rows] = await db.query(`SELECT * FROM vendors WHERE vendor_id = ?`, [req.params.id]);
        res.json({ success: true, message: "Vendor updated.", vendor: rows[0] });
    } catch (err) {
        console.error("PUT /api/vendors/:id", err.code || err.message);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success: false, message: "Phone number already used by another vendor." });
        }
        res.status(500).json({ success: false, message: "Could not update vendor." });
    }
});

// ==============================================================
// PURCHASES
// ==============================================================

app.post("/api/purchases", authenticateToken, async (req, res) => {
    const conn = await db.getConnection();
    try {
        const { supplier_id, purchase_date, items } = req.body || {};
        if (!supplier_id || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "supplier_id and non-empty items[] are required."
            });
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it.fruit_id || !it.quantity || !it.packaging_size) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] requires fruit_id, quantity, packaging_size.`
                });
            }
            if (it.unit_cost === undefined || it.unit_cost === null || it.unit_cost === "") {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] requires unit_cost.`
                });
            }
            if (!["SMALL", "MEDIUM", "LARGE"].includes(it.packaging_size)) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}].packaging_size must be SMALL, MEDIUM or LARGE.`
                });
            }
            if (Number(it.quantity) <= 0 || Number(it.unit_cost) < 0) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] quantity must be > 0 and unit_cost >= 0.`
                });
            }
        }

        await conn.beginTransaction();

        const [supplier] = await conn.query(
            `SELECT supplier_id FROM suppliers WHERE supplier_id = ?`, [supplier_id]
        );
        if (supplier.length === 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: "Supplier does not exist." });
        }

        for (let i = 0; i < items.length; i++) {
            const [f] = await conn.query(
                `SELECT fruit_id FROM fruits WHERE fruit_id = ?`, [items[i].fruit_id]
            );
            if (f.length === 0) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `items[${i}].fruit_id ${items[i].fruit_id} does not exist.`
                });
            }
        }

        let total = 0;
        for (const it of items) total += Number(it.quantity) * Number(it.unit_cost);
        total = Math.round(total * 100) / 100;

        const [purchaseResult] = await conn.query(
            `INSERT INTO purchases (supplier_id, purchase_date, total_amount)
             VALUES (?, COALESCE(?, NOW()), ?)`,
            [supplier_id, purchase_date || null, total]
        );
        const purchaseId = purchaseResult.insertId;

        for (const it of items) {
            await conn.query(
                `INSERT INTO purchase_details
                    (purchase_id, fruit_id, quantity, unit_cost, packaging_size)
                 VALUES (?, ?, ?, ?, ?)`,
                [purchaseId, it.fruit_id, it.quantity, it.unit_cost, it.packaging_size]
            );
            await conn.query(
                `INSERT INTO stock (fruit_id, packaging_size, available_quantity)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    available_quantity = available_quantity + VALUES(available_quantity)`,
                [it.fruit_id, it.packaging_size, it.quantity]
            );
        }

        await conn.commit();

        const [details] = await db.query(
            `SELECT pd.*, f.fruit_name
             FROM purchase_details pd
             JOIN fruits f ON f.fruit_id = pd.fruit_id
             WHERE pd.purchase_id = ?`,
            [purchaseId]
        );

        res.status(201).json({
            success: true,
            message: "Purchase recorded. Stock updated.",
            purchase: {
                purchase_id: purchaseId,
                supplier_id,
                total_amount: total,
                items: details
            }
        });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error("POST /api/purchases", err.code || err.message);
        res.status(500).json({
            success: false,
            message: "Purchase failed and was rolled back. " + (err.message || "")
        });
    } finally {
        conn.release();
    }
});

app.get("/api/purchases", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.purchase_id, p.supplier_id, s.business_name,
                    p.purchase_date, p.total_amount
             FROM purchases p
             JOIN suppliers s ON s.supplier_id = p.supplier_id
             ORDER BY p.purchase_id DESC`
        );
        res.json({ success: true, count: rows.length, purchases: rows });
    } catch (err) {
        console.error("GET /api/purchases", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch purchases." });
    }
});

app.get("/api/purchases/:id", authenticateToken, async (req, res) => {
    try {
        const [head] = await db.query(
            `SELECT p.*, s.business_name
             FROM purchases p
             JOIN suppliers s ON s.supplier_id = p.supplier_id
             WHERE p.purchase_id = ?`,
            [req.params.id]
        );
        if (head.length === 0) {
            return res.status(404).json({ success: false, message: "Purchase not found." });
        }
        const [details] = await db.query(
            `SELECT pd.*, f.fruit_name
             FROM purchase_details pd
             JOIN fruits f ON f.fruit_id = pd.fruit_id
             WHERE pd.purchase_id = ?`,
            [req.params.id]
        );
        res.json({ success: true, purchase: head[0], items: details });
    } catch (err) {
        console.error("GET /api/purchases/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch purchase." });
    }
});

// ==============================================================
// SALES
// ==============================================================

app.post("/api/sales", authenticateToken, async (req, res) => {
    const conn = await db.getConnection();
    try {
        const { vendor_id, sale_date, payment_method, amount_paid, items } = req.body || {};
        if (!vendor_id || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "vendor_id and non-empty items[] are required."
            });
        }

        const method = payment_method ? String(payment_method).toUpperCase() : "CASH";
        if (!["CASH", "MOBILE_MONEY", "CREDIT"].includes(method)) {
            return res.status(400).json({
                success: false,
                message: "payment_method must be CASH, MOBILE_MONEY or CREDIT."
            });
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it.fruit_id || !it.quantity || !it.packaging_size) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] requires fruit_id, quantity, packaging_size (unit_price optional).`
                });
            }
            if (!["SMALL", "MEDIUM", "LARGE"].includes(it.packaging_size)) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}].packaging_size must be SMALL, MEDIUM or LARGE.`
                });
            }
            if (Number(it.quantity) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] quantity must be > 0.`
                });
            }
            if (it.unit_price !== undefined && it.unit_price !== null &&
                (Number(it.unit_price) < 0 || Number.isNaN(Number(it.unit_price)))) {
                return res.status(400).json({
                    success: false,
                    message: `items[${i}] unit_price must be a non-negative number.`
                });
            }
        }

        await conn.beginTransaction();

        const [vendor] = await conn.query(
            `SELECT vendor_id FROM vendors WHERE vendor_id = ?`, [vendor_id]
        );
        if (vendor.length === 0) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: "Vendor does not exist." });
        }

        const storedPrices = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const [stockRows] = await conn.query(
                `SELECT available_quantity, selling_price FROM stock
                 WHERE fruit_id = ? AND packaging_size = ?
                 FOR UPDATE`,
                [it.fruit_id, it.packaging_size]
            );
            if (stockRows.length === 0) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `items[${i}]: no stock row for fruit ${it.fruit_id} / ${it.packaging_size}.`
                });
            }
            if (stockRows[0].available_quantity < Number(it.quantity)) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `items[${i}]: insufficient stock. Requested ${it.quantity}, available ${stockRows[0].available_quantity}.`
                });
            }
            storedPrices.push(Number(stockRows[0].selling_price) || 0);
        }

        // Fill in missing unit_price: stock.selling_price → fruits.default_price → error
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.unit_price === undefined || it.unit_price === null || it.unit_price === "") {
                let price = storedPrices[i];

                if (price <= 0) {
                    const [fruitRows] = await conn.query(
                        `SELECT default_price FROM fruits WHERE fruit_id = ?`,
                        [it.fruit_id]
                    );
                    price = fruitRows.length > 0 ? Number(fruitRows[0].default_price) : 0;
                }

                if (price <= 0) {
                    await conn.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `items[${i}]: no price configured. Set a selling price for this fruit/size, set the fruit's default price, or provide unit_price.`
                    });
                }

                items[i].unit_price = price;
            } else {
                items[i].unit_price = Number(it.unit_price);
            }
        }

        let total = 0;
        for (const it of items) total += Number(it.quantity) * Number(it.unit_price);
        total = Math.round(total * 100) / 100;

        let paid = 0;
        if (amount_paid !== undefined && amount_paid !== null) {
            paid = Number(amount_paid);
            if (Number.isNaN(paid) || paid < 0 || paid > total) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: "amount_paid must be between 0 and total."
                });
            }
        } else if (method === "CASH") {
            paid = total;
        }

        let status = "UNPAID";
        if (paid >= total) status = "PAID";
        else if (paid > 0) status = "PARTIALLY_PAID";

        const [saleResult] = await conn.query(
            `INSERT INTO sales
                (vendor_id, sale_date, payment_status, payment_method, total_amount, amount_paid)
             VALUES (?, COALESCE(?, NOW()), ?, ?, ?, ?)`,
            [vendor_id, sale_date || null, status, method, total, paid]
        );
        const saleId = saleResult.insertId;

        for (const it of items) {
            await conn.query(
                `INSERT INTO sales_details
                    (sale_id, fruit_id, packaging_size, quantity, unit_price)
                 VALUES (?, ?, ?, ?, ?)`,
                [saleId, it.fruit_id, it.packaging_size, it.quantity, it.unit_price]
            );
            await conn.query(
                `UPDATE stock
                 SET available_quantity = available_quantity - ?
                 WHERE fruit_id = ? AND packaging_size = ?`,
                [it.quantity, it.fruit_id, it.packaging_size]
            );
        }

        await conn.commit();

        const [details] = await db.query(
            `SELECT sd.*, f.fruit_name
             FROM sales_details sd
             JOIN fruits f ON f.fruit_id = sd.fruit_id
             WHERE sd.sale_id = ?`,
            [saleId]
        );

        res.status(201).json({
            success: true,
            message: "Sale recorded. Stock updated.",
            sale: {
                sale_id: saleId,
                vendor_id,
                payment_status: status,
                payment_method: method,
                total_amount: total,
                amount_paid: paid,
                outstanding: Math.round((total - paid) * 100) / 100,
                items: details
            }
        });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error("POST /api/sales", err.code || err.message);
        res.status(500).json({
            success: false,
            message: "Sale failed and was rolled back. " + (err.message || "")
        });
    } finally {
        conn.release();
    }
});

app.get("/api/sales", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT s.sale_id, s.vendor_id, v.vendor_name,
                    s.sale_date, s.payment_status, s.payment_method,
                    s.total_amount, s.amount_paid,
                    ROUND(s.total_amount - s.amount_paid, 2) AS outstanding
             FROM sales s
             JOIN vendors v ON v.vendor_id = s.vendor_id
             ORDER BY s.sale_id DESC`
        );
        res.json({ success: true, count: rows.length, sales: rows });
    } catch (err) {
        console.error("GET /api/sales", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch sales." });
    }
});

app.get("/api/sales/:id", authenticateToken, async (req, res) => {
    try {
        const [head] = await db.query(
            `SELECT s.*, v.vendor_name,
                    ROUND(s.total_amount - s.amount_paid, 2) AS outstanding
             FROM sales s
             JOIN vendors v ON v.vendor_id = s.vendor_id
             WHERE s.sale_id = ?`,
            [req.params.id]
        );
        if (head.length === 0) {
            return res.status(404).json({ success: false, message: "Sale not found." });
        }
        const [details] = await db.query(
            `SELECT sd.*, f.fruit_name
             FROM sales_details sd
             JOIN fruits f ON f.fruit_id = sd.fruit_id
             WHERE sd.sale_id = ?`,
            [req.params.id]
        );
        res.json({ success: true, sale: head[0], items: details });
    } catch (err) {
        console.error("GET /api/sales/:id", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch sale." });
    }
});

app.post("/api/sales/:id/pay", authenticateToken, async (req, res) => {
    const conn = await db.getConnection();
    try {
        const amount = Number(req.body?.amount);
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "amount must be a positive number." });
        }

        await conn.beginTransaction();

        const [rows] = await conn.query(
            `SELECT sale_id, total_amount, amount_paid FROM sales WHERE sale_id = ? FOR UPDATE`,
            [req.params.id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Sale not found." });
        }

        const sale = rows[0];
        const newPaid = Number(sale.amount_paid) + amount;

        if (newPaid > Number(sale.total_amount)) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Payment exceeds outstanding balance. Outstanding: ${(sale.total_amount - sale.amount_paid).toFixed(2)}`
            });
        }

        const status = newPaid >= Number(sale.total_amount) ? "PAID" : "PARTIALLY_PAID";
        await conn.query(
            `UPDATE sales SET amount_paid = ?, payment_status = ? WHERE sale_id = ?`,
            [newPaid, status, req.params.id]
        );

        await conn.commit();

        res.json({
            success: true,
            message: "Payment recorded.",
            sale: {
                sale_id: Number(req.params.id),
                total_amount: Number(sale.total_amount),
                amount_paid: newPaid,
                outstanding: Math.round((sale.total_amount - newPaid) * 100) / 100,
                payment_status: status
            }
        });
    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error("POST /api/sales/:id/pay", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not record payment." });
    } finally {
        conn.release();
    }
});

// ==============================================================
// OUTSTANDING BALANCES PER VENDOR
// ==============================================================

app.get("/api/vendors/outstanding", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT v.vendor_id, v.vendor_name, v.phone_number,
                    ROUND(SUM(s.total_amount - s.amount_paid), 2) AS outstanding,
                    COUNT(s.sale_id) AS sale_count
             FROM vendors v
             JOIN sales s ON s.vendor_id = v.vendor_id
             WHERE s.total_amount > s.amount_paid
             GROUP BY v.vendor_id, v.vendor_name, v.phone_number
             ORDER BY outstanding DESC`
        );
        res.json({ success: true, count: rows.length, balances: rows });
    } catch (err) {
        console.error("GET /api/vendors/outstanding", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not fetch balances." });
    }
});

// ==============================================================
// REPORTS
// ==============================================================

app.get("/api/reports/top-fruits", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT f.fruit_id, f.fruit_name, SUM(sd.quantity) AS total_boxes_sold
             FROM sales_details sd
             JOIN fruits f ON f.fruit_id = sd.fruit_id
             GROUP BY f.fruit_id, f.fruit_name
             ORDER BY total_boxes_sold DESC
             LIMIT 5`
        );
        res.json({ success: true, report: "Top 5 most frequently sold fruits", rows });
    } catch (err) {
        console.error("GET /api/reports/top-fruits", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not run report." });
    }
});

app.get("/api/reports/revenue", authenticateToken, async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({
                success: false,
                message: "start and end query parameters required (YYYY-MM-DD)."
            });
        }
        const [rows] = await db.query(
            `SELECT
                ? AS date_from,
                ? AS date_to,
                COALESCE(SUM(total_amount), 0) AS revenue,
                COALESCE(SUM(amount_paid), 0) AS collected,
                COALESCE(SUM(total_amount - amount_paid), 0) AS outstanding,
                COUNT(*) AS sale_count
             FROM sales
             WHERE DATE(sale_date) BETWEEN ? AND ?`,
            [start, end, start, end]
        );
        res.json({ success: true, report: "Revenue for date range", ...rows[0] });
    } catch (err) {
        console.error("GET /api/reports/revenue", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not run report." });
    }
});

app.get("/api/reports/top-vendor", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT v.vendor_id, v.vendor_name, v.phone_number,
                    SUM(sd.quantity) AS total_boxes
             FROM sales_details sd
             JOIN sales s ON s.sale_id = sd.sale_id
             JOIN vendors v ON v.vendor_id = s.vendor_id
             GROUP BY v.vendor_id, v.vendor_name, v.phone_number
             ORDER BY total_boxes DESC
             LIMIT 1`
        );
        res.json({ success: true, report: "Vendor who purchased the most boxes", row: rows[0] || null });
    } catch (err) {
        console.error("GET /api/reports/top-vendor", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not run report." });
    }
});

app.get("/api/reports/current-stock", authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT f.fruit_name, s.packaging_size, s.available_quantity, s.selling_price
             FROM stock s
             JOIN fruits f ON f.fruit_id = s.fruit_id
             ORDER BY f.fruit_name, FIELD(s.packaging_size,'SMALL','MEDIUM','LARGE')`
        );
        res.json({ success: true, report: "Current stock levels", count: rows.length, rows });
    } catch (err) {
        console.error("GET /api/reports/current-stock", err.code || err.message);
        res.status(500).json({ success: false, message: "Could not run report." });
    }
});

// ==============================
// 404 FALLBACK
// ==============================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// ==============================
// GLOBAL ERROR MIDDLEWARE
// ==============================

app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error";

    switch (err.code) {
        case "ER_DUP_ENTRY":
            statusCode = 409;
            message = "A record with those unique details already exists.";
            break;
        case "ER_NO_REFERENCED_ROW_2":
            statusCode = 400;
            message = "Referenced record does not exist.";
            break;
        case "ER_ROW_IS_REFERENCED_2":
            statusCode = 409;
            message = "Cannot delete: this record is used elsewhere.";
            break;
        case "ECONNREFUSED":
        case "PROTOCOL_CONNECTION_LOST":
        case "ER_ACCESS_DENIED_ERROR":
            statusCode = 503;
            message = "Database unavailable. Please try again later.";
            break;
        case "ER_CHECK_CONSTRAINT_VIOLATED":
            statusCode = 400;
            message = "A database constraint was violated.";
            break;
        case "ER_BAD_FIELD_ERROR":
        case "ER_NO_SUCH_TABLE":
            statusCode = 500;
            message = "Database schema mismatch. Ensure schema.sql has been applied.";
            break;
    }

    if (statusCode >= 500) console.error("[error]", err);

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && statusCode >= 500
            ? { stack: err.stack }
            : {})
    });
});

// ==============================
// SERVER START
// ==============================

let server;

async function startServer() {
    console.log("====================================");
    console.log("BATLOUNG FARM DISTRIBUTION SYSTEM");
    console.log("====================================");
    console.log("Checking MySQL connection...");

    let dbOk = false;

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing in .env");
        }

        const connection = await db.getConnection();
        const [rows] = await connection.query(
            "SELECT DATABASE() AS db, VERSION() AS v"
        );
        connection.release();
        dbOk = true;
        console.log(
            `MySQL connection successful. DB: ${rows[0].db} | MySQL ${rows[0].v}`
        );

        await inspectSchema();
        await initializeDatabase();
    } catch (error) {
        console.error("Server startup error:", error.code || error.message);
        console.warn(
            "Starting in DEGRADED mode. API will return 503 on DB routes."
        );
    }

    server = app.listen(PORT, () => {
        console.log("------------------------------------");
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Health: http://localhost:${PORT}/api/health`);
        console.log(`DB status: ${dbOk ? "CONNECTED" : "DISCONNECTED"}`);
        console.log("Batloung backend is ready.");
        console.log("------------------------------------");
    });

    server.on("error", (err) => {
        console.error("HTTP server error:", err.message);
        if (err.code === "EADDRINUSE") {
            console.error(
                `Port ${PORT} is already in use. Change PORT in .env or stop the other server.`
            );
        }
    });
}

// ==============================
// GRACEFUL SHUTDOWN
// ==============================

let isShuttingDown = false;

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} received. Shutting down safely...`);

    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }

    try {
        await db.end();
        console.log("MySQL connection pool closed.");
    } catch (_) {}

    console.log("Batloung backend stopped cleanly.");
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err.message);
});

startServer().catch((error) => {
    console.error("Startup fatal error:", error.message);
    process.exitCode = 1;
});