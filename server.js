import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";



const app = express();
const PORT = 3000;

// Enable JSON + CORS
app.use(cors());
app.use(express.json());

// Static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Temporary local “database”
const users = {
  commuter: [],
  driver: [],
  fleet: []
};

let jeepneyLocations = {}; // { driverId: { lat, lng, updatedAt } }

// -----------------------------
// Registration endpoint
// -----------------------------
app.post("/api/register/:role", (req, res) => {
  const { role } = req.params;
  const data = req.body;

  if (!users[role]) {
    return res.status(400).json({ message: "Invalid role type." });
  }

  // Check for duplicate email
  const existing = users[role].find(u => u.email === data.email);
  if (existing) {
    return res.status(400).json({ message: "Email already registered." });
  }

  users[role].push(data);
  console.log(`✅ New ${role} registered:`, data);
  res.json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully.` });
});

// -----------------------------
// Login endpoint
// -----------------------------
app.post("/api/login/:role", (req, res) => {
  const { role } = req.params;
  const { email, password } = req.body;

  if (!users[role]) {
    return res.status(400).json({ message: "Invalid role type." });
  }

  const user = users[role].find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  console.log(`🔐 ${role} logged in: ${email}`);
  res.json({ message: "Login successful." });
});

// -----------------------------
// Save jeepney location (from driver)
// -----------------------------
app.post("/api/jeepney-location", (req, res) => {
  const { driverId, lat, lng } = req.body;
  if (!driverId || typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ message: "Invalid data." });
  }
  jeepneyLocations[driverId] = { lat, lng, updatedAt: Date.now() };
  res.json({ message: "Location updated." });
});

// -----------------------------
// Get all jeepney locations (for commuter)
// -----------------------------
app.get("/api/jeepney-location", (req, res) => {
  res.json({ locations: jeepneyLocations });
});

// -----------------------------
// Serve front-end 
// -----------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "LandingPage.html"));
});

// Start the server
app.listen(PORT, '0.0.0.0', () => 
  console.log(`🚀 Server running on http://192.168.1.73:${PORT}`)
);

// Note: Use 'npm run dev' to start the server with nodemon
