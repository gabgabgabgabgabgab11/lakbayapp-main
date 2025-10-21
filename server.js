import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./lakbaydb.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);

app.set('trust proxy', 1);

// --- DB connection debug (temporary) ---
(async function testDB() {
  try {
    const { rows } = await pool.query("SELECT current_database() AS db, current_user AS user, inet_server_addr() AS server_addr, inet_server_port() AS server_port");
    console.log("DB INFO:", rows[0]); // prints the DB name, db user, host/port server sees
  } catch (err) {
    console.error("DB connection test FAILED:", err);
  }
})();
app.get("/api/debug/dbinfo", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT current_database() AS db, current_user AS user");
    return res.json({ ok: true, db: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/debug/drivers_count", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT count(*)::int AS cnt FROM drivers");
    return res.json({ ok: true, count: rows[0].cnt });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Middleware
app.use(helmet());
app.use(express.json());

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const defaultAllowed = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || defaultAllowed.some(u => origin.startsWith(u)) || origin.includes("ngrok.io");
    return isAllowed ? callback(null, true) : callback(new Error("CORS policy: This origin is not allowed"));
  }
}));

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.url}`);
  next();
});

// Static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// -----------------------------
// Helpers
// -----------------------------
function tableForRole(role) {
  if (role === "driver") return "drivers";
  if (role === "commuter") return "commuters";
  throw new Error("Invalid role");
}

async function findUserByEmail(role, email) {
  const table = tableForRole(role);
  const q = `SELECT * FROM ${table} WHERE email = $1 LIMIT 1`;
  const { rows } = await pool.query(q, [email]);
  return rows[0];
}

// -----------------------------
// JWT auth middleware
// -----------------------------
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header." });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, role, iat, exp }
    return next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

// -----------------------------
// Registration endpoint
// -----------------------------
app.post("/api/register/:role", async (req, res) => {
  const { role } = req.params;
  const { email, password, name } = req.body;

  if (!["driver", "commuter"].includes(role)) {
    return res.status(400).json({ message: "Invalid role type." });
  }
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // Check existing
    const existing = await findUserByEmail(role, email);
    if (existing) return res.status(400).json({ message: "Email already registered." });

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Insert
    const table = tableForRole(role);
    const insertSql = `INSERT INTO ${table} (email, password_hash, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name`;
    const { rows } = await pool.query(insertSql, [email, password_hash, name || null]);
    const created = rows[0];

    console.log(`✅ New ${role} registered:`, created.email);
    return res.json({ message: `${role} registered successfully.`, user: { id: created.id, email: created.email, name: created.name } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

// -----------------------------
// Login endpoint (returns JWT)
// -----------------------------
app.post("/api/login/:role", async (req, res) => {
  const { role } = req.params;
  const { email, password } = req.body;

  if (!["driver", "commuter"].includes(role)) {
    return res.status(400).json({ message: "Invalid role type." });
  }
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await findUserByEmail(role, email);
    if (!user) return res.status(401).json({ message: "Invalid email or password." });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password." });

    const token = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: "8h" });
    console.log(`🔐 ${role} logged in: ${email}`);
    return res.json({ message: "Login successful.", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

// -----------------------------
// Save jeepney location (from driver) - stores in driver_locations table
// Protected: only authenticated drivers can update their own location
// -----------------------------
app.post("/api/jeepney-location", requireAuth, async (req, res) => {
  const { driverId, lat, lng } = req.body;

  // Basic validation
  if (!driverId || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ message: "Invalid data." });
  }

  // ensure the caller is the driver and IDs match
  if (req.user.role !== "driver" || Number(req.user.id) !== Number(driverId)) {
    return res.status(403).json({ message: "Forbidden: you may only update your own location." });
  }

  try {
    const upsertSql = `
      INSERT INTO driver_locations (driver_id, lat, lng, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (driver_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = EXCLUDED.updated_at
      RETURNING driver_id, lat, lng, updated_at
    `;
    const { rows } = await pool.query(upsertSql, [driverId, lat, lng]);
    return res.json({ message: "Location updated.", location: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
});

// -----------------------------
// Get all jeepney locations (for commuter) - read does not require auth
// -----------------------------
app.get("/api/jeepney-location", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT driver_id, lat, lng, updated_at FROM driver_locations");
    const locations = {};
    rows.forEach(r => {
      locations[r.driver_id] = { lat: Number(r.lat), lng: Number(r.lng), updatedAt: r.updated_at };
    });
    res.json({ locations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// -----------------------------
// Serve front-end
// -----------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "LandingPage.html"));
});

// Start the server, bind to all interfaces and print useful URLs
const server = app.listen(PORT, "0.0.0.0", () => {
  const addr = server.address();
  console.log(`🚀 Server listening on port ${addr.port}`);
  console.log(`Local:     http://localhost:${addr.port}`);
  console.log(`Loopback:  http://127.0.0.1:${addr.port}`);
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`LAN (${name}): http://${net.address}:${addr.port}`);
      }
    }
  }
  console.log("Press Ctrl+C to stop the server");
});