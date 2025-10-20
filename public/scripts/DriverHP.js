const API_BASE = window.location.origin.includes('ngrok') ? window.location.origin : 'http://localhost:3000';
const map = L.map('map', { editable: true }).setView([14.796, 120.879], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

const status = document.getElementById("status");
const startDrivingBtn = document.getElementById("start-driving");

let jeepMarker = null;
let drivingWatchId = null;
let drivingIntervalId = null; // NEW: interval for consistent updates
let lastCoords = null;

const driverId = localStorage.getItem("driverId") || `driver_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem("driverId", driverId);

const jeepIcon = L.icon({ iconUrl: 'icons/Jeep.png', iconSize:[32,32], iconAnchor:[16,16] });

// =====================
// Start Driving (Live Tracking)
// =====================
startDrivingBtn.addEventListener("click", () => {
  if (drivingWatchId || drivingIntervalId) {
    if (drivingWatchId) navigator.geolocation.clearWatch(drivingWatchId);
    if (drivingIntervalId) clearInterval(drivingIntervalId);
    drivingWatchId = null;
    drivingIntervalId = null;
    startDrivingBtn.textContent = "🚐 Start Driving";
    status.textContent = "Stopped live driving.";
    if (jeepMarker) {
      map.removeLayer(jeepMarker);
      jeepMarker = null;
    }
    return;
  }
  if (!navigator.geolocation) {
    status.textContent = "Geolocation not supported.";
    return;
  }
  // Get location and start interval for consistent updates
  drivingWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      lastCoords = { latitude, longitude };
      // Show jeep marker on driver's map and focus map
      if (!jeepMarker) {
        jeepMarker = L.marker([latitude, longitude], { icon: jeepIcon }).addTo(map);
      } else {
        jeepMarker.setLatLng([latitude, longitude]);
      }
      map.setView([latitude, longitude], 16);
      status.textContent = `Driving: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    },
    err => {
      console.error("Geolocation error:", err);
      status.textContent = "Unable to get location: " + err.message;
    },
    { enableHighAccuracy: true }
  );
  // Send location to server every 500ms, even if position hasn't changed
  drivingIntervalId = setInterval(() => {
    if (lastCoords) {
      fetch(`${API_BASE}/api/jeepney-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, lat: lastCoords.latitude, lng: lastCoords.longitude })
      });
    }
  }, 500);
  startDrivingBtn.textContent = "🛑 Stop Driving";
  status.textContent = "Live driving started...";
});
