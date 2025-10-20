map.on('click', e => {
  if (!lastUserLatLng) { statusText.textContent="Waiting for your location..."; return; }
  const dest = e.latlng;
  if (destinationMarker) try { map.removeLayer(destinationMarker); } catch(e) {}
  destinationMarker = L.marker(dest, { opacity: 0.9 }).addTo(map).bindPopup("Destination selected!").openPopup();

  statusText.textContent = "Calculating route...";
  let blink = true;
  const blinkInterval = setInterval(() => { statusText.style.visibility=blink?"visible":"hidden"; blink=!blink; },500);

  createRoute(lastUserLatLng, { lat:dest.lat, lng:dest.lng })
    .then(() => clearInterval(blinkInterval))
    .catch(()=> { clearInterval(blinkInterval); statusText.style.visibility='visible'; statusText.textContent="Routing failed."; });
});

function createRoute(startLatLng, destLatLng) { /* same as before */ }
