const map = L.map('map').setView([14.7959, 120.8789], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const statusText = document.getElementById("location-status");
let userMarker = null, watchId = null, lastUserLatLng = null;
let routingControl = null, destinationMarker = null;
const routeLines = [];
let savedRoutesControls = [];
let jeepneyMarkers = {};
