async function pollJeepney() {
  const now = Date.now();
  if (now - (window.lastPoll || 0) < POLL_INTERVAL) return;
  window.lastPoll = now;

  try {
    const res = await fetch(`${API_BASE}/api/jeepney-location`);
    if (!res.ok) throw new Error('Jeepney API error');
    const data = await res.json();
    const locations = data.locations || {};

    for (const id of Object.keys(jeepneyMarkers)) {
      if (!locations[id] || !locations[id].updatedAt || Date.now() - locations[id].updatedAt > JEEPNEY_TIMEOUT) {
        map.removeLayer(jeepneyMarkers[id]);
        delete jeepneyMarkers[id];
      }
    }

    for (const [driverId, loc] of Object.entries(locations)) {
      if (!loc || typeof loc.lat!=="number" || typeof loc.lng!=="number") continue;
      if (!loc.updatedAt || Date.now()-loc.updatedAt>JEEPNEY_TIMEOUT) continue;
      if (!jeepneyMarkers[driverId]) {
        jeepneyMarkers[driverId]=L.marker([loc.lat,loc.lng], { icon:L.icon({iconUrl:'icons/Jeep.png',iconSize:[32,32],iconAnchor:[16,16]}) }).addTo(map).bindPopup(`Jeepney (${driverId})`);
      } else jeepneyMarkers[driverId].setLatLng([loc.lat,loc.lng]);
    }
  } catch(e){}
}
setInterval(pollJeepney,POLL_INTERVAL);
