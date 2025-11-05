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
const JWT_SECRET = process.env.JWT_SECRET || "a_long_default_secret_replace_in_prod";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);

app.set("trust proxy", 1);

// In-memory storage for driver statuses (short term). Consider persisting to DB for production.
let driverStatuses = {}; // { "<driverId>": { status: 'On Route', timestamp: 167..., ... } }

// DB test
(async function testDB() {
  try {
    const { rows } = await pool.query("SELECT current_database() AS db, current_user AS user");
    console.log("✅ DB Connected:", rows[0]);
  } catch (err) {
    console.error("❌ DB connection FAILED:", err.message);
  }
})();

// Helmet CSP - allow local assets and necessary CDNs (but prefer hosting images locally in /public/icons)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.tile.openstreetmap.org",
        "https://tile.openstreetmap.org",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      connectSrc: [
        "'self'",
        "ws:",
        "wss:",
        "https://*.ngrok.io",
        "https://*.ngrok-free.app",
        "https://tile.openstreetmap.org",
        "https://router.project-osrm.org",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net"
      ],
      fontSrc: ["'self'", "https://unpkg.com", "https://fonts.gstatic.com", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"]
    }
  }
}));

app.use(express.json());

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/jeepney-location", locationLimiter);
app.use("/api/driver-status", locationLimiter);

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const defaultAllowed = ["http://localhost:3000", "http://127.0.0.1:3000"];
    const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                      defaultAllowed.some(u => origin.startsWith(u)) ||
                      (origin && (origin.includes("ngrok") || origin.includes("ngrok-free")));
    return isAllowed ? callback(null, true) : callback(new Error("CORS policy: Origin not allowed"));
  }
}));

// Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.ip} ${req.method} ${req.url}`);
  next();
});

// Static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Helpers
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

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header." });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    console.error("JWT verify failed:", err.message);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

// ---------- ENDPOINTS ----------

// Registration
app.post("/api/register/:role", async (req, res) => {
  const { role } = req.params;
  const { email, password, name } = req.body;
  
  if (!["driver", "commuter"].includes(role)) {
    return res.status(400).json({ message: "Invalid role type." });
  }
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required." });
  }

  try {
    const password_hash = await bcrypt.hash(password, 12);
    const table = tableForRole(role);
    const insertSql = `INSERT INTO ${table} (email, password_hash, name, created_at) 
                       VALUES ($1,$2,$3,NOW()) 
                       ON CONFLICT (email) DO NOTHING 
                       RETURNING id,email,name`;
    const result = await pool.query(insertSql, [email, password_hash, name || null]);

    if (result.rowCount === 0) {
      const existing = await findUserByEmail(role, email);
      return res.status(409).json({ 
        message: "Email already registered.", 
        user: existing ? { id: existing.id, email: existing.email, name: existing.name } : null 
      });
    }

    const created = result.rows[0];
    console.log(`✅ New ${role} registered:`, created.email);
    return res.status(201).json({ 
      message: `${role} registered successfully.`, 
      user: { id: created.id, email: created.email, name: created.name } 
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

// Login
app.post("/api/login/:role", async (req, res) => {
  const { role } = req.params;
  const { email, password } = req.body;
  
  if (!["driver", "commuter"].includes(role)) {
    return res.status(400).json({ message: "Invalid role type." });
  }
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required." });
  }

  try {
    const user = await findUserByEmail(role, email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: "8h" });
    console.log(`🔐 ${role} logged in: ${email}`);
    
    return res.json({ 
      message: "Login successful.",
      token: token,
      driverId: user.id,
      userId: user.id,
      role: role
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

// Save jeepney location (protected)
app.post("/api/jeepney-location", requireAuth, async (req, res) => {
  const { driverId, lat, lng } = req.body;
  
  if (!driverId || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ message: "Invalid data." });
  }
  if (req.user.role !== "driver" || Number(req.user.id) !== Number(driverId)) {
    return res.status(403).json({ message: "Forbidden: you may only update your own location." });
  }

  try {
    const upsertSql = `
      INSERT INTO driver_locations (driver_id, lat, lng, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (driver_id) DO UPDATE
        SET lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            updated_at = EXCLUDED.updated_at
      RETURNING driver_id, lat, lng, updated_at
    `;
    const { rows } = await pool.query(upsertSql, [driverId, lat, lng]);
    console.log(`📍 Location updated for driver ${driverId}:`, { lat, lng });
    return res.json({ message: "Location updated.", location: rows[0] });
  } catch (err) {
    console.error("Location update error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

// Get all jeepney locations (public) - includes driver name, plate and current route for commuter popups
app.get("/api/jeepney-location", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT dl.driver_id,
             dl.lat,
             dl.lng,
             (extract(epoch from dl.updated_at) * 1000)::bigint AS updated_at_ms,
             d.name AS driver_name,
             d.plate_number,
             d.current_route
      FROM driver_locations dl
      LEFT JOIN drivers d ON d.id = dl.driver_id
    `);

    const locations = {};
    rows.forEach(r => {
      const id = String(r.driver_id);
      locations[id] = {
        lat: Number(r.lat),
        lng: Number(r.lng),
        updatedAt: Number(r.updated_at_ms),
        name: r.driver_name || null,
        plate: r.plate_number || null,
        current_route: r.current_route || null
      };
    });

    console.log(`📡 Serving ${Object.keys(locations).length} jeepney locations`);
    res.json({ locations });
  } catch (err) {
    console.error("Get locations error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Save driver status (protected) - stores in-memory and logs (consider persisting)
app.post("/api/driver-status", requireAuth, async (req, res) => {
  const { driverId, status, timestamp } = req.body;
  
  if (!driverId || !status) {
    return res.status(400).json({ message: "Invalid data: driverId and status required." });
  }
  
  if (req.user.role !== "driver" || Number(req.user.id) !== Number(driverId)) {
    return res.status(403).json({ message: "Forbidden: you may only update your own status." });
  }
  
  const validStatuses = ['Docking', 'Loading', 'On Route', 'End'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      message: "Invalid status. Must be: Docking, Loading, On Route, or End" 
    });
  }
  
  try {
    // Normalize key to string
    const key = String(driverId);
    driverStatuses[key] = { 
      status, 
      timestamp: Number(timestamp || Date.now())
    };
    
    console.log(`🚐 Driver ${key} status: ${status} (ts: ${driverStatuses[key].timestamp})`);
    return res.json({ 
      message: "Status updated.", 
      status: driverStatuses[key] 
    });
  } catch (err) {
    console.error("Status update error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

// Get all driver statuses (public) - returns mapping keyed by string driver id
app.get("/api/driver-status", async (req, res) => {
  try {
    const now = Date.now();
    const activeStatuses = {};

    Object.entries(driverStatuses || {}).forEach(([id, data]) => {
      const ts = Number(data.timestamp || 0);
      // extend allowance during transient delays, but you can reduce this later
      if (ts && (now - ts < 120000)) {
        activeStatuses[String(id)] = {
          status: data.status,
          timestamp: ts
        };
      }
    });

    console.debug('/api/driver-status returning:', activeStatuses);
    res.json(activeStatuses);
  } catch (err) {
    console.error("Get statuses error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

// Routes endpoint (list and optional name query) - defensive normalization of waypoints
app.get("/api/routes", async (req, res) => {
  try {
    const nameQuery = req.query.name;
    let rows;
    if (nameQuery) {
      const q = `
        SELECT id, driver_id, route_name AS name, waypoints, color
        FROM driver_routes
        WHERE LOWER(route_name) = LOWER($1)
        ORDER BY id DESC
      `;
      ({ rows } = await pool.query(q, [nameQuery]));
    } else {
      const q = `
        SELECT id, driver_id, route_name AS name, waypoints, color
        FROM driver_routes
        ORDER BY id DESC
      `;
      ({ rows } = await pool.query(q));
    }

    // Normalize waypoints: ensure each route has a JS array in .waypoints
    const normalized = rows.map(r => {
      const out = {
        id: r.id,
        driver_id: r.driver_id,
        name: r.name,
        color: r.color || null,
        waypoints: []
      };
      try {
        if (r.waypoints === null || r.waypoints === undefined) {
          out.waypoints = [];
        } else if (Array.isArray(r.waypoints)) {
          out.waypoints = r.waypoints;
        } else if (typeof r.waypoints === 'string') {
          // attempt JSON parse
          try {
            out.waypoints = JSON.parse(r.waypoints);
            if (!Array.isArray(out.waypoints)) out.waypoints = [];
          } catch (e) {
            // not JSON: maybe delimiter-separated coords or other format -> leave empty
            out.waypoints = [];
          }
        } else {
          // other types (e.g. PG jsonb already returned as object)
          out.waypoints = Array.isArray(r.waypoints) ? r.waypoints : [];
        }
      } catch (e) {
        out.waypoints = [];
      }
      return out;
    });

    return res.json(normalized);
  } catch (err) {
    console.error("GET /api/routes error (safe):", err && err.stack ? err.stack : err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Route by id endpoint - defensive
app.get("/api/routes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`
      SELECT id, driver_id, route_name AS name, waypoints, color
      FROM driver_routes
      WHERE id = $1
      LIMIT 1
    `, [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Route not found" });

    const r = rows[0];
    let waypoints = [];
    try {
      if (r.waypoints === null || r.waypoints === undefined) waypoints = [];
      else if (Array.isArray(r.waypoints)) waypoints = r.waypoints;
      else if (typeof r.waypoints === 'string') {
        try { waypoints = JSON.parse(r.waypoints); if (!Array.isArray(waypoints)) waypoints = []; } catch (e) { waypoints = []; }
      } else waypoints = Array.isArray(r.waypoints) ? r.waypoints : [];
    } catch (e) { waypoints = []; }

    const out = {
      id: r.id,
      driver_id: r.driver_id,
      name: r.name,
      color: r.color || null,
      waypoints
    };

    return res.json(out);
  } catch (err) {
    console.error("GET /api/routes/:id error (safe):", err && err.stack ? err.stack : err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Serve front-end
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "LandingPage.html"));
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  const addr = server.address();
  console.log(`🚀 Server running on port ${addr.port}`);
  console.log(`Local: http://localhost:${addr.port}`);
  
 const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      const serverAddr = server.address();
      const port = (serverAddr && typeof serverAddr === 'object' && serverAddr.port) ? serverAddr.port : PORT;
      console.log(`LAN (${name}): http://${net.address}:${port}`);
    }
  }
}
});