const API_BASE = (() => {
  const origin = window.location.origin;
  return origin.includes('ngrok') || origin.startsWith('http') ? origin : 'http://localhost:3000';
})();

// --- Global variables & map init ---
const map = L.map('map').setView([14.7959, 120.8789], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const statusText = document.getElementById("location-status");
const startButton = document.getElementById("track-btn");
let userMarker = null, watchId = null, lastUserLatLng = null;
let routingControl = null, destinationMarker = null;
let jeepneyMarker = null;
const routeLines = [];
let savedRoutesControls = [];

// --- Hardcoded jeepney routes ---
let jeepneyRoutes = [];

// Load jeepney routes (Routes.json must be available in same directory)
fetch('Routes.json')
  .then(res => {
    if (!res.ok) throw new Error('Failed to fetch Routes.json');
    return res.json();
  })
  .then(data => {
    jeepneyRoutes = Array.isArray(data) ? data : [];
    drawJeepneyRoutes();
  })
  .catch(err => console.error("Failed to load jeepney routes:", err));

// --- Draw hardcoded routes ---
function drawJeepneyRoutes() {
  routeLines.forEach(line => map.removeLayer(line));
  routeLines.length = 0;

  for (const route of jeepneyRoutes) {
    const points = route.points || [];
    const polyline = L.polyline(points, { color: route.color || '#3388ff', weight: 4, opacity: 0.6 }).addTo(map);
    routeLines.push(polyline);
  }
  statusText.textContent = "All jeepney routes displayed.";
}

// --- Draw saved driver routes (from backend) ---
function drawSavedRoutes() {
  savedRoutesControls.forEach(ctrl => { try { map.removeControl(ctrl); } catch(e) {} });
  savedRoutesControls = [];

  fetch(`${API_BASE}/api/routes`)
    .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
    .then(data => {
      if (!Array.isArray(data)) return;
      data.forEach(driverRoute => {
        if (driverRoute.waypoints && driverRoute.waypoints.length > 1) {
          const waypoints = driverRoute.waypoints.map(p => L.latLng(p.lat, p.lng));
          const control = L.Routing.control({
            waypoints,
            lineOptions: { styles: [{ color: 'orange', weight: 6 }] },
            router: L.Routing.osrmv1({ profile: 'driving' }),
            addWaypoints: false,
            routeWhileDragging: false,
            showAlternatives: false,
            createMarker: () => null
          }).addTo(map);
          savedRoutesControls.push(control);
        }
      });
    })
    .catch(err => console.warn('drawSavedRoutes error:', err));
}

// --- Find nearest route to user ---
function highlightNearestRoute() {
  if (!lastUserLatLng) { statusText.textContent = "Please allow location first."; return; }

  let nearestRoute = null;
  let minDist = Infinity;

  for (const route of jeepneyRoutes) {
    for (const pt of route.points || []) {
      const dist = map.distance([lastUserLatLng.lat, lastUserLatLng.lng], pt);
      if (dist < minDist) { minDist = dist; nearestRoute = route; }
    }
  }

  if (!nearestRoute) { statusText.textContent = "No routes available to highlight."; return; }

  routeLines.forEach(line => line.setStyle({ opacity: 0.6, weight: 4 }));
  const idx = jeepneyRoutes.indexOf(nearestRoute);
  if (routeLines[idx]) routeLines[idx].setStyle({ opacity: 1, weight: 6 });

  statusText.textContent = `Nearest route: ${nearestRoute.name} (${Math.round(minDist)} m away)`;
}

// -------------------
// Recalibrate / UI
// -------------------
let autoRecalibrate = true;
const recalibrateBtn = document.getElementById("toggle-recalibrate");
if (recalibrateBtn) {
  recalibrateBtn.addEventListener("click", () => {
    autoRecalibrate = !autoRecalibrate;
    recalibrateBtn.textContent = autoRecalibrate ? "🔒 Auto Recalibrate" : "👐 Free View";
  });
}

// --- Update user location ---
function updateUserLocation(lat, lng, accuracy) {
  const coords = [lat, lng];
  const newLatLng = { lat, lng };
  lastUserLatLng = newLatLng;

  if (!userMarker) {
    userMarker = L.marker(coords).addTo(map).bindPopup("You are here!");
  } else { userMarker.setLatLng(coords); }

  if (watchId && autoRecalibrate) {
    const currentCenter = map.getCenter();
    const moved = map.distance([currentCenter.lat, currentCenter.lng], coords);
    if (moved > 5) { map.setView(coords, Math.max(map.getZoom(), 15)); }
  }

  statusText.textContent = `Location detected (±${Math.round(accuracy)} m)`;
}

// --- Geolocation error ---
function handleLocationError(error) {
  console.warn('geolocation error', error);
  const msg = (error && error.code) ? (() => {
    switch(error.code){
      case error.PERMISSION_DENIED: return "Permission denied. Please enable location access.";
      case error.POSITION_UNAVAILABLE: return "Location unavailable.";
      case error.TIMEOUT: return "Request timed out.";
      default: return "An unknown error occurred.";
    }
  })() : "An unknown location error occurred.";
  statusText.textContent = msg;
}

// --- Create route ---
function createRoute(startLatLng, destLatLng) {
  return new Promise((resolve, reject) => {
    if (routingControl) { try { map.removeControl(routingControl); } catch(e) {} routingControl = null; }
    const directionsPanel = document.getElementById('directions-panel');
    if (directionsPanel) directionsPanel.innerHTML = "";

    const customRouter = L.Routing.osrmv1({ profile: 'driving' });

    routingControl = L.Routing.control({
      waypoints: [L.latLng(startLatLng.lat, startLatLng.lng), L.latLng(destLatLng.lat, destLatLng.lng)],
      lineOptions: { styles: [{ color: '#007bff', weight: 5 }] },
      router: customRouter,
      addWaypoints: false,
      routeWhileDragging: false,
      showAlternatives: false,
      createMarker: () => null,
      show: false
    }).addTo(map);

    setTimeout(() => {
      const defaultItinerary = document.querySelector('.leaflet-routing-container');
      if (defaultItinerary) defaultItinerary.style.display = 'none';
    }, 200);

    routingControl.on('routesfound', function(e) {
      const route = e.routes && e.routes[0];
      if (!route) return reject(new Error('No route returned'));

      const summary = route.summary || {};
      const distKm = summary.totalDistance ? (summary.totalDistance / 1000).toFixed(2) : '—';
      const timeMin = summary.totalTime ? Math.round(summary.totalTime / 60) : '—';
      statusText.textContent = `Route found: ${distKm} km — ETA ${timeMin} min`;

      try {
        if (directionsPanel) {
          let html = `<h3>Directions</h3><ul style="padding-left:1em;margin:0;">`;
          const instructions = route.instructions || (route.coordinates ? [] : []);
          if (instructions && instructions.length > 0) {
            for (const step of instructions) {
              const text = step && (step.text || step.instruction || step.name) || 'Continue';
              const d = (step && step.distance) ? `${(step.distance/1000).toFixed(2)} km` : '';
              html += `<li style="margin-bottom:6px;">${text} <span style="color:#888;font-size:0.9em;">${d}</span></li>`;
            }
          } else if (route.routes && route.routes.length && Array.isArray(route.routes)) {
            html += `<li>${route.coordinates ? route.coordinates.length : 'Route'}</li>`;
          } else html += `<li>Directions unavailable from router.</li>`;
          html += "</ul>";
          directionsPanel.innerHTML = html;
        }
      } catch(err){ console.warn('render directions failed', err); }

      resolve(route);
    });

    routingControl.on('routingerror', (err) => { console.warn('routing error', err); reject(err); });
  });
}

// --- Start/Stop tracking ---
startButton && startButton.addEventListener("click", () => {
  if (!navigator.geolocation) { statusText.textContent = "Geolocation not supported."; return; }

  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    startButton.textContent = "Start Tracking My Location Now";
    statusText.textContent = "Tracking stopped.";
  } else {
    watchId = navigator.geolocation.watchPosition(
      pos => updateUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      handleLocationError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    startButton.textContent = "Stop Tracking";
    statusText.textContent = "Tracking started...";
  }
});

// --- Map click for destination ---
map.on('click', e => {
  if (!lastUserLatLng) { statusText.textContent = "Waiting for your location..."; return; }

  const dest = e.latlng;
  if (destinationMarker) { try { map.removeLayer(destinationMarker); } catch(e) {} }

  destinationMarker = L.marker(dest, { opacity: 0.9 }).addTo(map).bindPopup("Destination selected!").openPopup();

  let blink = true;
  statusText.textContent = "Calculating route...";
  const blinkInterval = setInterval(() => { statusText.style.visibility = blink ? "visible" : "hidden"; blink = !blink; }, 500);

  createRoute(lastUserLatLng, { lat: dest.lat, lng: dest.lng })
    .then(() => clearInterval(blinkInterval))
    .catch(() => { clearInterval(blinkInterval); statusText.style.visibility = 'visible'; statusText.textContent = "Routing failed."; });
});

// --- Poll jeepney locations ---
let lastPoll = 0;
const POLL_INTERVAL = 500; // 0.5 seconds for near real-time updates
const JEEPNEY_TIMEOUT = 10000; // 10 seconds
let jeepneyMarkers = {};

function pollJeepney() {
  fetch(`${API_BASE}/api/jeepney-location`)
    .then(res => res.json())
    .then(data => {
      const now = Date.now();
      const locations = data.locations || {};

      // Remove markers for drivers no longer present or timed out
      Object.keys(jeepneyMarkers).forEach(id => {
        if (
          !locations[id] ||
          !locations[id].updatedAt ||
          now - locations[id].updatedAt > JEEPNEY_TIMEOUT
        ) {
          map.removeLayer(jeepneyMarkers[id]);
          delete jeepneyMarkers[id];
        }
      });

      // Add/update markers for active drivers
      Object.entries(locations).forEach(([driverId, loc]) => {
        if (
          typeof loc.lat === 'number' &&
          typeof loc.lng === 'number' &&
          loc.updatedAt &&
          now - loc.updatedAt <= JEEPNEY_TIMEOUT
        ) {
          const latLng = [loc.lat, loc.lng];
          if (!jeepneyMarkers[driverId]) {
            jeepneyMarkers[driverId] = L.marker(latLng, {
              icon: L.icon({ iconUrl: 'icons/Jeep.png', iconSize: [32,32], iconAnchor: [16,16] })
            }).addTo(map).bindPopup(`Jeepney (${driverId})`);
          } else {
            jeepneyMarkers[driverId].setLatLng(latLng);
          }
        }
      });
    })
    .catch(() => {});
}
setInterval(pollJeepney, 500);

// --- Static button events ---
const showBtn = document.getElementById("show-btn");
showBtn && showBtn.addEventListener("click", () => { drawJeepneyRoutes(); drawSavedRoutes(); });

const highlightBtn = document.getElementById("highlight-btn");
highlightBtn && highlightBtn.addEventListener("click", highlightNearestRoute);

const clearBtn = document.getElementById("clear-btn");
clearBtn && clearBtn.addEventListener("click", () => {
  if (destinationMarker) { try { map.removeLayer(destinationMarker); } catch(e) {} }
  if (routingControl) { try { map.removeControl(routingControl); } catch(e) {} }
  destinationMarker = routingControl = null;
  statusText.textContent = "Destination cleared.";
});

// routes dropdown
const routesLink = document.getElementById("routes-link");
const routesDropdown = document.querySelector(".routes-dropdown");
if (routesLink && routesDropdown) {
  routesLink.addEventListener("click", e => {
    e.preventDefault();
    routesDropdown.classList.toggle("active");
  });
  document.addEventListener("click", e => {
    if (!routesDropdown.contains(e.target)) routesDropdown.classList.remove("active");
  });
}

document.querySelectorAll("#routes-list-dropdown a").forEach(routeItem => {
  routeItem.addEventListener("click", e => {
    e.preventDefault();
    const routeName = routeItem.textContent.trim();
    highlightRouteByName(routeName);
  });
});

// --- Highlight by name ---
let highlightedRoute = null;
function highlightRouteByName(routeName) {
  if (highlightedRoute) { try { map.removeLayer(highlightedRoute); } catch(e) {} highlightedRoute = null; }
  const route = jeepneyRoutes.find(r => r.name && r.name.trim() === routeName);
  if (!route) { statusText.textContent = `Route not found: ${routeName}`; return; }

  highlightedRoute = L.polyline(route.points, { color: route.color || 'magenta', weight: 6, opacity: 1 }).addTo(map);
  try { map.fitBounds(highlightedRoute.getBounds()); } catch(e) {}
  statusText.textContent = `Highlighted: ${routeName}`;
}

// --- Initial load ---
drawJeepneyRoutes();
drawSavedRoutes();

// Prompt for location access
window.addEventListener("DOMContentLoaded", () => {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      pos => { console.log("Location allowed:", pos.coords.latitude, pos.coords.longitude); },
      error => { console.warn("Location error:", error && error.message); },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else console.warn("Geolocation not supported in this browser.");
});

// --- Maximize / Minimize map with wake lock ---
const mapContainer = document.getElementById("map");
const closeBtn = document.getElementById("close-map");
const maximizeBtn = document.getElementById("maximize-map");
let wakeLock = null;
let originalMapStyles = {};

maximizeBtn.addEventListener("click", async () => {
  if (!mapContainer) return;

  // save original inline styles
  originalMapStyles = {
    position: mapContainer.style.position || "",
    top: mapContainer.style.top || "",
    left: mapContainer.style.left || "",
    width: mapContainer.style.width || "",
    height: mapContainer.style.height || "",
    zIndex: mapContainer.style.zIndex || ""
  };

  // maximize
  mapContainer.style.position = "fixed";
  mapContainer.style.top = "0";
  mapContainer.style.left = "0";
  mapContainer.style.width = "100vw";
  mapContainer.style.height = "100vh";
  mapContainer.style.zIndex = "9999";
  mapContainer.style.transition = "all 0.3s ease";

  closeBtn.style.display = "block";
  maximizeBtn.style.display = "none";

  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
  catch(err) { console.warn(err); }

  setTimeout(() => map.invalidateSize(), 300);
});

closeBtn.addEventListener("click", async () => {
  // restore original styles
  mapContainer.style.position = originalMapStyles.position;
  mapContainer.style.top = originalMapStyles.top;
  mapContainer.style.left = originalMapStyles.left;
  mapContainer.style.width = originalMapStyles.width;
  mapContainer.style.height = originalMapStyles.height;
  mapContainer.style.zIndex = originalMapStyles.zIndex;

  closeBtn.style.display = "none";
  maximizeBtn.style.display = "inline-block";

  if (wakeLock) { try { await wakeLock.release(); wakeLock = null; } catch(err) { console.warn(err); } }

  setTimeout(() => map.invalidateSize(), 300);
});
