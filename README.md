# Lakbay — PUJ Tracking System

A full‑stack demo for tracking Public Utility Jeepneys (drivers) and viewing them in real time (commuters).  
This repository contains a Node/Express backend, a PostgreSQL database, and static front‑end files served from `public/` that use Leaflet and leaflet‑routing‑machine.

This README shows how to clone the repository, set up the database, run the app locally, configure ngrok for remote testing, and share the project with teammates.

---

## Table of contents

- Project overview
- Prerequisites
- Clone the repo
- Environment variables (`.env`)
- Database setup (Postgres)
- Install & run (development)
- ngrok: remote testing (setup + usage)
- Frontend pages & assets
- API quick guide + example requests
- Common issues & troubleshooting
- Sharing with teammates
- Helpful commands
- Contributing
- License

---

## Project overview

- Backend: Node.js + Express
- Database: PostgreSQL
- Frontend: static files in `public/` (HTML/CSS/vanilla JS with Leaflet)
- Key API endpoints:
  - `POST /api/register/:role` — register driver or commuter
  - `POST /api/login/:role` — login and receive JWT
  - `POST /api/jeepney-location` — protected, drivers post location (Bearer token)
  - `GET  /api/jeepney-location` — public, commuters poll locations
  - `GET  /api/routes` — saved routes for commuter UI

---

## Prerequisites

- Node.js 16+ and npm (or yarn)
- PostgreSQL 12+
- Optional but useful:
  - nodemon (used in development script)
  - ngrok (for exposing localhost to remote devices)
  - psql or a GUI DB client (pgAdmin, DBeaver)
  - VS Code

Verify installations:
```bash
node --version
npm --version
psql --version
```

---

## Clone the repo

HTTPS:
```bash
git clone https://github.com/gabgabgabgabgabgab11/lakbayapp-main.git
cd lakbayapp-main
```

SSH:
```bash
git clone git@github.com:gabgabgabgabgabgab11/lakbayapp-main.git
cd lakbayapp-main
```

---

## Environment variables

Create a `.env` in the project root (do NOT commit `.env`). Example values:

```
# .env
PORT=3000
DATABASE_URL=postgres://lakbay_user:strongpassword@localhost:5432/lakbaydb
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:3000
```

Notes:
- `DATABASE_URL` can be a managed PostgreSQL URL (ElephantSQL, Supabase, Heroku Postgres).
- `CORS_ORIGIN` can contain a comma-separated list of allowed origins. For local dev `http://localhost:3000` is typical.
- If you use ngrok leave `CORS_ORIGIN` blank or add your ngrok URL.

---

## Database setup (Postgres)

1. Start PostgreSQL (platform specific).

2. Create database and user (example using `psql`):
```sql
-- run as postgres user: psql
CREATE USER lakbay_user WITH PASSWORD 'strongpassword';
CREATE DATABASE lakbaydb OWNER lakbay_user;
GRANT ALL PRIVILEGES ON DATABASE lakbaydb TO lakbay_user;
\q
```

3. Create schema (run inside `psql -d lakbaydb` or via a GUI). Example core schema:

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commuters (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id INTEGER PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_routes (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  route_name TEXT,
  waypoints JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

4. Seed or register users:
- Use the `/api/register/driver` endpoint (Postman, curl) to create a driver account, or insert a hashed password directly into DB (recommended to use API to avoid hashing manually).

Example curl to register:
```bash
curl -X POST http://localhost:3000/api/register/driver \
  -H "Content-Type: application/json" \
  -d '{"email":"driver1@example.com","password":"password123","name":"Driver One"}'
```

---

## Install & run (development)

1. Install dependencies:
```bash
npm install
```

2. Add `.env` as described above.

3. Start the server (development):
```bash
npm run dev
```
This typically runs nodemon and restarts the server on changes. If your package.json uses another script, use `npm start` or the project-specific dev command.

4. Open the app in your browser:
- Landing / index: `http://localhost:3000/`
- Commuter page: `/CommuterHomepage.html`
- Driver page: `/DriverHomepage.html`

---

## ngrok — remote testing (setup & usage)

Ngrok exposes your local server to the internet. Useful to test on mobile devices or share a running instance with teammates.

1. Install ngrok:
- macOS (Homebrew): `brew install --cask ngrok` or download from https://ngrok.com
- Windows: download from https://ngrok.com and unzip to a folder on PATH
- Linux: download appropriate binary

2. Authenticate ngrok (one-time):
- Sign up for a free ngrok account, copy your authtoken from the dashboard.
```bash
ngrok authtoken <YOUR_NGROK_AUTHTOKEN>
```

3. Start ngrok to forward HTTP port 3000:
```bash
ngrok http 3000
```

4. Copy the forward URL (e.g. `https://abcd1234.ngrok.io`) and:
- Add it to your `.env` CORS_ORIGIN (or use it in the client as API base).
- Example `.env`:
```
CORS_ORIGIN=https://abcd1234.ngrok.io
```
or in frontend, set API_BASE to the ngrok URL.

5. Important tips:
- Use `https://` ngrok URL in mobile browsers.
- If you need to test drivers sending location updates from mobile, ensure the Driver page (served via ngrok) handles the Authorization flow (login token) and posts to the ngrok URL.
- Free ngrok tunnels restart each session (use a paid account for persistent subdomain).

---

## Frontend assets & paths

- Static files served from `public/`.
  - Scripts: `public/scripts/`
  - Styles: `public/styles/`
  - Images: `public/img/`
  - Icons: `public/icons/`

Important:
- Use absolute paths for local assets in client JS/HTML (e.g. `/icons/Jeep.png`) so paths resolve regardless of the page path.
- If Leaflet assets (marker images, .map) are blocked by CSP in your environment, either add the CDN to CSP or host the assets locally (recommended for production).

---

## API quick guide & examples

- Register (driver or commuter):
```bash
POST /api/register/driver
Content-Type: application/json
{ "email": "driver1@example.com", "password": "password123", "name": "Driver One" }
```

- Login:
```bash
POST /api/login/driver
Content-Type: application/json
{ "email": "driver1@example.com", "password": "password123" }
# Response contains { token: "<JWT>" }
```

- Send authenticated location (driver):
```bash
POST /api/jeepney-location
Authorization: Bearer <token>
Content-Type: application/json
{ "driverId": 1, "lat": 14.799, "lng": 120.987 }
```

- Poll locations (commuter):
```bash
GET /api/jeepney-location
# returns JSON: { locations: { "1": { lat: ..., lng: ..., updatedAt: 166... } } }
```

- Get saved routes:
```bash
GET /api/routes
```

---

## Common issues & troubleshooting

- Map shows blank or L is not defined:
  - Check DevTools Network: confirm Leaflet JS/CSS loaded (CDN or local).
  - If CSP blocks CDN, update server CSP or host Leaflet locally.

- Buttons not clickable:
  - Confirm there is no overlay element capturing pointer events (use `document.elementFromPoint(x,y)` in console).
  - Confirm scripts initialize after DOM (scripts should run on DOMContentLoaded).

- Driver POST `/api/jeepney-location` returns 401:
  - Ensure driver logged in and `Authorization: Bearer <token>` header is included.
  - Confirm JWT_SECRET matches between env and server.

- 429 Too Many Requests:
  - Polling or driver sends may be too frequent; increase client intervals (e.g., poll every 2s).
  - Adjust rate limiter in `server.js` for `/api/jeepney-location` if necessary.

- Marker images 404:
  - Verify file exists at `public/icons/Jeep.png` and client uses `/icons/Jeep.png`. Filenames are case-sensitive on many hosts.

- Routing fails (OSRM requests blocked or CORS error):
  - Ensure server CSP `connect-src` includes `https://router.project-osrm.org` or host a routing service/provider.

---

## Sharing the project with teammates

1. Create a `.env.example` with safe placeholders (do not include secrets) and commit it:
```
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/lakbaydb
JWT_SECRET=your_jwt_secret_here
CORS_ORIGIN=http://localhost:3000
```

2. Push code to GitHub and ask teammate to:
```bash
git clone https://github.com/gabgabgabgabgabgab11/lakbayapp-main.git
cd lakbayapp-main
cp .env.example .env  # then edit .env with real values
npm install
# setup DB using schema.sql or run SQL statements in README
npm run dev
```

3. If sharing running instance (temporary), start `ngrok http 3000` and share the ngrok URL.

---

## Helpful commands

- Install dependencies:
  ```bash
  npm install
  ```
- Run in dev (nodemon):
  ```bash
  npm run dev
  ```
- Create DB and run schema (example):
  ```bash
  psql -U postgres -c "CREATE DATABASE lakbaydb;" 
  psql -U postgres -d lakbaydb -f schema.sql
  ```
- Test API (register/login):
  ```bash
  curl -X POST http://localhost:3000/api/register/driver -H "Content-Type: application/json" -d '{"email":"driver1@example.com","password":"password123"}'
  ```

---

## Contributing

- Create a feature branch: `git checkout -b feat/your-change`
- Commit changes with clear messages
- Push and open a Pull Request
- Add testing or manual verification instructions to the PR

---

## License

Driver's License
- or open a PR with these files and the README improvements.

Tell me which you'd prefer and I will prepare those files or the PR.
