import pkg from "pg";
import dotenv from "dotenv";
dotenv.config(); // ensure .env is loaded before we build the pool

const { Pool } = pkg;

function createPool() {
  // Prefer DATABASE_URL if present (common for deployments / ngrok testing)
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
      // reasonable defaults; override via env if needed
      max: process.env.DB_MAX_CLIENTS ? parseInt(process.env.DB_MAX_CLIENTS, 10) : 20,
      idleTimeoutMillis: process.env.DB_IDLE_MS ? parseInt(process.env.DB_IDLE_MS, 10) : 30000,
    });
  }

  // Fallback to individual DB_* env vars
  return new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "lakbaydb",
    password: process.env.DB_PASSWORD || "",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    max: process.env.DB_MAX_CLIENTS ? parseInt(process.env.DB_MAX_CLIENTS, 10) : 20,
    idleTimeoutMillis: process.env.DB_IDLE_MS ? parseInt(process.env.DB_IDLE_MS, 10) : 30000,
  });
}

const pool = createPool();

// Temporary startup check (helps debug env/connection issues).
// Remove or lower logging in production.
(async function verifyConnection() {
  try {
    const { rows } = await pool.query("SELECT current_database() AS db, current_user AS user, inet_server_addr() AS server_addr, inet_server_port() AS server_port");
    console.log("DB pool connected:", rows[0]);
  } catch (err) {
    console.error("DB pool connection test FAILED:", err.message);
  }
})();

export default pool;