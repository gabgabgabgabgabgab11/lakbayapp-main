function updateUserLocation(lat, lng, accuracy) {
  const coords = [lat, lng];
  lastUserLatLng = { lat, lng };

  if (!userMarker) userMarker = L.marker(coords).addTo(map).bindPopup("You are here!");
  else userMarker.setLatLng(coords);

  if (watchId && window.autoRecalibrate) {
    const moved = map.distance(map.getCenter(), coords);
    if (moved > 5) map.setView(coords, Math.max(map.getZoom(), 15));
  }

  statusText.textContent = `Location detected (±${Math.round(accuracy)} m)`;
}

function handleLocationError(error) {
  const msg = (error?.code) ? {
    1: "Permission denied. Please enable location access.",
    2: "Location unavailable.",
    3: "Request timed out."
  }[error.code] : "An unknown location error occurred.";
  statusText.textContent = msg;
}

document.getElementById("track-btn")?.addEventListener("click", () => {
  if (!navigator.geolocation) { statusText.textContent = "Geolocation not supported."; return; }
  if (watchId) { navigator.geolocation.clearWatch(watchId); watchId=null; startButton.textContent="Start Tracking My Location Now"; statusText.textContent="Tracking stopped."; }
  else {
    watchId = navigator.geolocation.watchPosition(
      pos => updateUserLocation(pos.coords.latitude,pos.coords.longitude,pos.coords.accuracy),
      handleLocationError,
      { enableHighAccuracy:true, maximumAge:1000, timeout:10000 }
    );
    startButton.textContent="Stop Tracking";
    statusText.textContent="Tracking started...";
  }
});
