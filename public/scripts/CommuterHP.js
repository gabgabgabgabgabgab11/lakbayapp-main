// CommuterHP.js - COMPLETE FILE with driver status display
(() => {
  const API_BASE = (() => {
    const origin = window.location.origin;
    return origin.includes('ngrok') || origin.startsWith('http') ? origin : 'http://localhost:3000';
  })();

  // Helper: safe fetch JSON
  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
    return res.json();
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Guard DOM
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.warn('CommuterHP: #map container not found; aborting map init.');
      return;
    }

    // Initialize map
    const map = L.map('map').setView([14.7959, 120.8789], 14);
    window._LAKBY_MAP = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Expose last user location for routing usage
    window._LAST_USER_LOCATION = null;

    // DOM elements
    const statusText = document.getElementById('location-status');
    const startButton = document.getElementById('track-btn');
    const showBtn = document.getElementById('show-btn');
    const highlightBtn = document.getElementById('highlight-btn');
    const clearBtn = document.getElementById('clear-btn');

    // State
    let userMarker = null;
    let watchId = null;
    let lastUserLatLng = null;
    let routingControl = null;
    let destinationMarker = null;
    const routeLines = [];
    let savedRoutesControls = [];
    let jeepneyRoutes = [];
    let jeepneyMarkers = {};
    let driverStatuses = {}; // Store driver statuses

    // Load optional hardcoded routes file (Routes.json)
    fetch('Routes.json')
      .then(res => {
        if (!res.ok) throw new Error('Routes.json not found');
        return res.json();
      })
      .then(data => {
        jeepneyRoutes = Array.isArray(data) ? data : [];
        drawJeepneyRoutes();
      })
      .catch(() => {
        // silent: Routes.json optional
      });

    function drawJeepneyRoutes() {
      routeLines.forEach(line => { try { map.removeLayer(line); } catch (e) {} });
      routeLines.length = 0;
      for (const route of jeepneyRoutes) {
        const points = route.points || [];
        if (!points.length) continue;
        const polyline = L.polyline(points, { 
          color: route.color || '#3388ff', 
          weight: 4, 
          opacity: 0.6 
        }).addTo(map);
        routeLines.push(polyline);
      }
      if (statusText) statusText.textContent = "All jeepney routes displayed.";
    }

    // Draw saved routes from backend (uses leaflet-routing-machine)
    function drawSavedRoutes() {
      savedRoutesControls.forEach(ctrl => { try { map.removeControl(ctrl); } catch (e) {} });
      savedRoutesControls = [];
      fetch(`${API_BASE}/api/routes`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch /api/routes');
          return res.json();
        })
        .then(data => {
          if (!Array.isArray(data)) return;
          data.forEach(driverRoute => {
            if (!driverRoute.waypoints || driverRoute.waypoints.length < 2) return;
            const waypoints = driverRoute.waypoints.map(p => L.latLng(p.lat, p.lng));
            // Use OSRM router by default; this control is purely visual (no markers)
            const control = L.Routing.control({
              waypoints,
              lineOptions: { styles: [{ color: 'orange', weight: 6 }] },
              router: L.Routing.osrmv1({ 
                serviceUrl: 'https://router.project-osrm.org/route/v1', 
                profile: 'driving' 
              }),
              addWaypoints: false,
              routeWhileDragging: false,
              showAlternatives: false,
              createMarker: () => null
            }).addTo(map);
            savedRoutesControls.push(control);
          });
        })
        .catch(err => {
          console.warn('drawSavedRoutes error:', err);
        });
    }

    // createRoute: uses OSRM service explicitly, rejects on error; falls back to straight polyline if requested
    function createRoute(startLatLng, destLatLng, { fallbackStraight = true } = {}) {
      return new Promise((resolve, reject) => {
        // clean previous
        if (routingControl) { 
          try { map.removeControl(routingControl); } catch (e) {} 
          routingControl = null; 
        }
        
        // build router
        let osrmRouter;
        try {
          osrmRouter = L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'driving'
          });
        } catch (e) {
          console.warn('Routing lib not available or failed to create router', e);
          if (fallbackStraight) {
            // fallback to straight line
            const pl = L.polyline([
              [startLatLng.lat, startLatLng.lng], 
              [destLatLng.lat, destLatLng.lng]
            ], { 
              color: '#007bff', 
              weight: 4, 
              dashArray: '6 6' 
            }).addTo(map);
            
            setTimeout(() => { try { map.removeLayer(pl); } catch (ex) {} }, 15000);
            if (statusText) statusText.textContent = 'Routing not available — showing straight line.';
            return resolve({ fallback: true });
          }
          return reject(e);
        }

        routingControl = L.Routing.control({
          waypoints: [
            L.latLng(startLatLng.lat, startLatLng.lng), 
            L.latLng(destLatLng.lat, destLatLng.lng)
          ],
          lineOptions: { styles: [{ color: '#007bff', weight: 5 }] },
          router: osrmRouter,
          addWaypoints: false,
          routeWhileDragging: false,
          showAlternatives: false,
          createMarker: () => null,
          show: false
        }).addTo(map);

        // hide default itinerary for cleaner UI
        setTimeout(() => {
          const el = document.querySelector('.leaflet-routing-container');
          if (el) el.style.display = 'none';
        }, 200);

        let handled = false;
        routingControl.on('routesfound', e => {
          if (handled) return;
          handled = true;
          const route = e.routes && e.routes[0];
          if (!route) {
            if (statusText) statusText.textContent = 'Routing failed.';
            return reject(new Error('No route returned'));
          }
          const summary = route.summary || {};
          const distKm = summary.totalDistance ? (summary.totalDistance / 1000).toFixed(2) : '—';
          const timeMin = summary.totalTime ? Math.round(summary.totalTime / 60) : '—';
          if (statusText) statusText.textContent = `Route found: ${distKm} km — ETA ${timeMin} min`;
          resolve(route);
        });

        routingControl.on('routingerror', err => {
          console.warn('routing error', err);
          if (handled) return;
          handled = true;
          if (statusText) statusText.textContent = 'Routing failed.';
          
          try { map.removeControl(routingControl); } catch (e) {}
          routingControl = null;
          
          if (fallbackStraight) {
            const pl = L.polyline([
              [startLatLng.lat, startLatLng.lng], 
              [destLatLng.lat, destLatLng.lng]
            ], { 
              color: '#007bff', 
              weight: 4, 
              dashArray: '6 6' 
            }).addTo(map);
            setTimeout(() => { try { map.removeLayer(pl); } catch (ex) {} }, 15000);
            return resolve({ fallback: true, error: err });
          }
          reject(err || new Error('Routing error'));
        });

        // Safety timeout in case router never responds
        const timeout = setTimeout(() => {
          if (handled) return;
          handled = true;
          try { if (routingControl) map.removeControl(routingControl); } catch (e) {}
          routingControl = null;
          
          if (fallbackStraight) {
            const pl = L.polyline([
              [startLatLng.lat, startLatLng.lng], 
              [destLatLng.lat, destLatLng.lng]
            ], { 
              color: '#007bff', 
              weight: 4, 
              dashArray: '6 6' 
            }).addTo(map);
            setTimeout(() => { try { map.removeLayer(pl); } catch (ex) {} }, 15000);
            if (statusText) statusText.textContent = 'Routing timed out — showing straight line.';
            return resolve({ fallback: true, timeout: true });
          }
          reject(new Error('Routing timed out'));
        }, 20000); // 20s
        
        const cleanupHandlers = () => clearTimeout(timeout);
        routingControl.on('routesfound', cleanupHandlers);
        routingControl.on('routingerror', cleanupHandlers);
      });
    }

    // Highlight nearest route (uses drawn jeepneyRoutes)
    function highlightNearestRoute() {
      if (!lastUserLatLng) { 
        if (statusText) statusText.textContent = "Please allow location first."; 
        return; 
      }
      
      let nearestRoute = null;
      let minDist = Infinity;
      
      for (const route of jeepneyRoutes) {
        for (const pt of route.points || []) {
          const dist = map.distance([lastUserLatLng.lat, lastUserLatLng.lng], pt);
          if (dist < minDist) { 
            minDist = dist; 
            nearestRoute = route; 
          }
        }
      }
      
      if (!nearestRoute) { 
        if (statusText) statusText.textContent = "No routes available to highlight."; 
        return; 
      }
      
      routeLines.forEach(line => line.setStyle({ opacity: 0.6, weight: 4 }));
      const idx = jeepneyRoutes.indexOf(nearestRoute);
      if (routeLines[idx]) routeLines[idx].setStyle({ opacity: 1, weight: 6 });
      
      if (statusText) {
        statusText.textContent = `Nearest route: ${nearestRoute.name} (${Math.round(minDist)} m away)`;
      }
    }

    // User location updates
    function updateUserLocation(lat, lng, accuracy) {
      const coords = [lat, lng];
      lastUserLatLng = { lat, lng };
      window._LAST_USER_LOCATION = { lat, lng };
      
      if (!userMarker) {
        userMarker = L.marker(coords).addTo(map).bindPopup("You are here!");
      } else {
        userMarker.setLatLng(coords);
      }
      
      if (statusText) statusText.textContent = `Location detected (±${Math.round(accuracy)} m)`;
      
      // recenter if tracking
      if (watchId) {
        const c = map.getCenter();
        if (map.distance([c.lat, c.lng], coords) > 5) {
          map.setView(coords, Math.max(map.getZoom(), 15));
        }
      }
    }

    function handleLocationError(error) {
      console.warn('geolocation error', error);
      let msg = "An unknown location error occurred.";
      if (error && error.code) {
        switch (error.code) {
          case error.PERMISSION_DENIED: 
            msg = "Permission denied. Please enable location access."; 
            break;
          case error.POSITION_UNAVAILABLE: 
            msg = "Location unavailable."; 
            break;
          case error.TIMEOUT: 
            msg = "Request timed out."; 
            break;
        }
      }
      if (statusText) statusText.textContent = msg;
    }

    // Track start/stop
    if (startButton) {
      startButton.addEventListener('click', () => {
        if (!navigator.geolocation) { 
          if (statusText) statusText.textContent = "Geolocation not supported."; 
          return; 
        }
        
        if (watchId) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
          startButton.textContent = "Start Tracking My Location Now";
          if (statusText) statusText.textContent = "Tracking stopped.";
        } else {
          watchId = navigator.geolocation.watchPosition(
            pos => updateUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
            handleLocationError,
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
          );
          startButton.textContent = "Stop Tracking";
          if (statusText) statusText.textContent = "Tracking started...";
        }
      });
    }

    // Map click -> create route from user's last location
    map.on('click', e => {
      if (!window._LAST_USER_LOCATION) {
        if (statusText) statusText.textContent = 'Please allow location so we can route from your location.';
        return;
      }
      
      const dest = e.latlng;
      if (destinationMarker) { 
        try { map.removeLayer(destinationMarker); } catch (e) {} 
      }
      
      destinationMarker = L.marker(dest, { opacity: 0.9 })
        .addTo(map)
        .bindPopup("Destination selected!")
        .openPopup();
      
      if (statusText) statusText.textContent = 'Calculating route...';
      
      createRoute(window._LAST_USER_LOCATION, { lat: dest.lat, lng: dest.lng })
        .catch(err => {
          console.warn('createRoute failed', err);
          if (statusText) statusText.textContent = 'Routing failed.';
        });
    });

    // Get status color based on driver status
    function getStatusColor(status) {
      switch(status) {
        case 'Docking': return '#ff9800'; // Orange
        case 'Loading': return '#ffeb3b'; // Yellow
        case 'On Route': return '#4caf50'; // Green
        case 'End': return '#f44336'; // Red
        default: return '#9e9e9e'; // Gray
      }
    }

    // Get status emoji
    function getStatusEmoji(status) {
      switch(status) {
        case 'Docking': return '🅿️';
        case 'Loading': return '⏳';
        case 'On Route': return '🚐';
        case 'End': return '🛑';
        default: return '🚐';
      }
    }

    // Poll jeepney locations AND statuses
    const POLL_INTERVAL = 2000; // 2s
    const JEEPNEY_TIMEOUT = 10000; // 10s

    function pollJeepneyData() {
      // Fetch both locations and statuses
      Promise.all([
        fetch(`${API_BASE}/api/jeepney-location`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : Promise.reject('Location fetch failed'))
          .catch(() => ({ locations: {} })),
        fetch(`${API_BASE}/api/driver-status`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : Promise.reject('Status fetch failed'))
          .catch(() => ({}))
      ])
      .then(([locData, statusData]) => {
        const now = Date.now();
        const locations = locData.locations || {};
        driverStatuses = statusData || {};

        // Remove stale markers
        Object.keys(jeepneyMarkers).forEach(id => {
          const loc = locations[id];
          if (!loc || !loc.updatedAt || now - loc.updatedAt > JEEPNEY_TIMEOUT) {
            try { map.removeLayer(jeepneyMarkers[id]); } catch (e) {}
            delete jeepneyMarkers[id];
          }
        });

        // Add/update markers with status
        Object.entries(locations).forEach(([driverId, loc]) => {
          if (typeof loc.lat === 'number' && typeof loc.lng === 'number' && 
              loc.updatedAt && now - loc.updatedAt <= JEEPNEY_TIMEOUT) {
            
            const latLng = [loc.lat, loc.lng];
            const statusInfo = driverStatuses[driverId];
            const status = statusInfo ? statusInfo.status : 'Unknown';
            const statusColor = getStatusColor(status);
            const statusEmoji = getStatusEmoji(status);

            if (!jeepneyMarkers[driverId]) {
              // Create new marker with custom colored icon
              const jeepIcon = L.divIcon({
                html: `
                  <div style="
                    background-color: ${statusColor}; 
                    width: 38px; 
                    height: 38px; 
                    border-radius: 50%; 
                    border: 3px solid white; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    cursor: pointer;
                  ">
                    ${statusEmoji}
                  </div>
                `,
                iconSize: [38, 38],
                iconAnchor: [19, 19],
                className: 'jeepney-icon',
                popupAnchor: [0, -20]
              });

              jeepneyMarkers[driverId] = L.marker(latLng, { icon: jeepIcon })
                .addTo(map)
                .bindPopup(`
                  <div style="text-align: center; min-width: 140px; padding: 8px;">
                    <strong style="font-size: 16px;">🚐 Jeepney ${driverId}</strong><br>
                    <div style="
                      margin-top: 8px; 
                      padding: 6px 12px; 
                      background: ${statusColor}; 
                      color: ${status === 'Loading' ? '#333' : 'white'}; 
                      border-radius: 6px;
                      font-weight: bold;
                      font-size: 14px;
                    ">
                      ${statusEmoji} ${status}
                    </div>
                  </div>
                `);

              // Auto-open popup on mobile (touch devices)
              if ('ontouchstart' in window) {
                jeepneyMarkers[driverId].on('click', () => {
                  jeepneyMarkers[driverId].openPopup();
                });
              }
              
              // Desktop hover effect
              jeepneyMarkers[driverId].on('mouseover', function() {
                this.openPopup();
              });
              
            } else {
              // Update existing marker
              jeepneyMarkers[driverId].setLatLng(latLng);
              
              // Update icon
              const updatedIcon = L.divIcon({
                html: `
                  <div style="
                    background-color: ${statusColor}; 
                    width: 38px; 
                    height: 38px; 
                    border-radius: 50%; 
                    border: 3px solid white; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-size: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    cursor: pointer;
                  ">
                    ${statusEmoji}
                  </div>
                `,
                iconSize: [38, 38],
                iconAnchor: [19, 19],
                className: 'jeepney-icon',
                popupAnchor: [0, -20]
              });
              jeepneyMarkers[driverId].setIcon(updatedIcon);

              // Update popup content
              jeepneyMarkers[driverId].setPopupContent(`
                <div style="text-align: center; min-width: 140px; padding: 8px;">
                  <strong style="font-size: 16px;">🚐 Jeepney ${driverId}</strong><br>
                  <div style="
                    margin-top: 8px; 
                    padding: 6px 12px; 
                    background: ${statusColor}; 
                    color: ${status === 'Loading' ? '#333' : 'white'}; 
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 14px;
                  ">
                    ${statusEmoji} ${status}
                  </div>
                </div>
              `);
            }
          }
        });
      })
      .catch(err => {
        console.warn('Poll jeepney data error:', err);
      });
    }

    // Start polling
    setInterval(pollJeepneyData, POLL_INTERVAL);
    pollJeepneyData();

    // Button handlers
    if (showBtn) {
      showBtn.addEventListener('click', () => { 
        drawJeepneyRoutes(); 
        drawSavedRoutes(); 
      });
    }
    
    if (highlightBtn) {
      highlightBtn.addEventListener('click', highlightNearestRoute);
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (destinationMarker) { 
          try { map.removeLayer(destinationMarker); } catch (e) {} 
        }
        if (routingControl) { 
          try { map.removeControl(routingControl); } catch (e) {} 
        }
        destinationMarker = routingControl = null;
        if (statusText) statusText.textContent = "Destination cleared.";
      });
    }

    // Routes dropdown
    const routesLink = document.getElementById("routes-link");
    const routesDropdown = document.querySelector(".routes-dropdown");
    if (routesLink && routesDropdown) {
      routesLink.addEventListener("click", e => { 
        e.preventDefault(); 
        routesDropdown.classList.toggle("active"); 
      });
      
      document.addEventListener("click", e => { 
        if (!routesDropdown.contains(e.target)) {
          routesDropdown.classList.remove("active"); 
        }
      });
    }

    // Route list item clicks
    document.querySelectorAll("#routes-list-dropdown a").forEach(routeItem => {
      routeItem.addEventListener("click", e => {
        e.preventDefault();
        const routeName = routeItem.textContent.trim();
        if (!routeName) return;
        try { highlightRouteByName(routeName); } catch (err) { console.warn(err); }
      });
    });

    // Highlight by name helper
    let highlightedRoute = null;
    function highlightRouteByName(routeName) {
      if (highlightedRoute) { 
        try { map.removeLayer(highlightedRoute); } catch (e) {} 
        highlightedRoute = null; 
      }
      
      const route = jeepneyRoutes.find(r => r.name && r.name.trim() === routeName);
      if (!route) { 
        if (statusText) statusText.textContent = `Route not found: ${routeName}`; 
        return; 
      }
      
      highlightedRoute = L.polyline(route.points, { 
        color: route.color || 'magenta', 
        weight: 6, 
        opacity: 1 
      }).addTo(map);
      
      try { map.fitBounds(highlightedRoute.getBounds()); } catch (e) {}
      if (statusText) statusText.textContent = `Highlighted: ${routeName}`;
    }

    // Burger menu
    const burgerBtn = document.getElementById('burger-btn');
    const navLinks = document.querySelector('.nav-links');
    if (burgerBtn && navLinks) {
      burgerBtn.addEventListener('click', () => {
        navLinks.classList.toggle('show');
      });
    }

    // Initial draws
    drawJeepneyRoutes();
    drawSavedRoutes();
  });
})();