let jeepneyRoutes = [];

fetch('Routes.json')
  .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
  .then(data => { jeepneyRoutes = Array.isArray(data) ? data : []; drawJeepneyRoutes(); })
  .catch(err => console.error("Failed to load Routes.json:", err));

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

  if (!nearestRoute) { statusText.textContent = "No routes available."; return; }

  routeLines.forEach(line => line.setStyle({ opacity: 0.6, weight: 4 }));
  const idx = jeepneyRoutes.indexOf(nearestRoute);
  if (routeLines[idx]) routeLines[idx].setStyle({ opacity: 1, weight: 6 });
  statusText.textContent = `Nearest route: ${nearestRoute.name} (${Math.round(minDist)} m away)`;
}

function highlightRouteByName(routeName) {
  if (window.highlightedRoute) { try { map.removeLayer(window.highlightedRoute); } catch(e) {} window.highlightedRoute = null; }
  const route = jeepneyRoutes.find(r => r.name && r.name.trim() === routeName);
  if (!route) { statusText.textContent = `Route not found: ${routeName}`; return; }
  window.highlightedRoute = L.polyline(route.points, { color: route.color || 'magenta', weight: 6, opacity: 1 }).addTo(map);
  try { map.fitBounds(window.highlightedRoute.getBounds()); } catch(e) {}
  statusText.textContent = `Highlighted: ${routeName}`;
}
