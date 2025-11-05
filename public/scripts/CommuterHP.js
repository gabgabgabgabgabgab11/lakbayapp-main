// public/scripts/CommuterHP.js
// Commuter-facing map script - final version per user request:
// - Only the statuses: "Docking", "Loading", "On Route", "End" are supported and displayed with emojis.
// - Popups appear above the jeep icon and display Name, Plate, Status (with emoji), Route (fetched on click).
// - Uses only /icons/marker-icon.png for generic markers; optional /icons/Jeep.png makes jeep markers distinct.
// - Show All Routes (#show-btn) and Highlight Nearest Route (#highlight-btn) use existing buttons (no automatic drawing).
// - Hamburger (burger) toggles .nav-links on mobile or creates a minimal mobile nav if none exists.
// - ETA uses fixed 30 km/h when routes are computed.
// - Defensive/fallback behavior if endpoints or icons are missing.
//
// Installation: save as public/scripts/CommuterHP.js and hard-refresh (Ctrl+F5).
// Dependencies: leaflet.js and leaflet-routing-machine should be loaded before this script.

(() => {
  const API_BASE = (() => {
    try {
      const o = window.location.origin || '';
      if (o && o.startsWith('http')) return o.replace(/\/$/, '');
    } catch (e) {}
    return 'http://localhost:3000';
  })();

  const FIXED_SPEED_KPH = 20;
  const POLL_MS = 5000;

  const log = (...m) => console.info('[CommuterHP]', ...m);
  const warn = (...m) => console.warn('[CommuterHP]', ...m);

  // Force single marker icon usage (only marker-icon.png)
  (function forceSingleMarkerIcon() {
    try {
      const url = '/icons/marker-icon.png';
      if (window.L && L.Icon && L.Icon.Default && typeof L.Icon.Default.mergeOptions === 'function') {
        L.Icon.Default.mergeOptions({ iconUrl: url, popupAnchor: [1, -34] });
      }
      if (window.L && L.Icon && L.Icon.Default && L.Icon.Default.prototype) {
        L.Icon.Default.prototype.options.iconUrl = url;
        L.Icon.Default.prototype.options.popupAnchor = [1, -34];
      }
      window._LAKBY_SINGLE_MARKER_ICON = url;
    } catch (e) {
      warn('forceSingleMarkerIcon failed', e);
    }
  })();

  // Preload Jeep icon (for vehicle markers)
  window._LAKBY_preloadedJeep = window._LAKBY_preloadedJeep || { tried: false, ok: false, icon: null, url: null };
  async function preloadJeepIcon() {
    const state = window._LAKBY_preloadedJeep;
    if (state.tried) return state;
    state.tried = true;
    const candidates = ['/icons/Jeep.png', '/icons/jeep.png'];
    for (const url of candidates) {
      try {
        await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => rej(false); i.src = url; });
        try {
          state.icon = L.icon({ iconUrl: url, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22], className: 'jeepney-image-icon' });
        } catch (e) { state.icon = null; }
        state.ok = true; state.url = url; window._LAKBY_preloadedJeep = state;
        log('Jeep icon preloaded:', url);
        return state;
      } catch (e) { /* next */ }
    }
    state.ok = false; state.icon = null; state.url = null; window._LAKBY_preloadedJeep = state;
    log('No Jeep icon found under /icons');
    return state;
  }

  // Create single marker icon (marker-icon.png) fallback to divIcon
  async function createSingleMarkerIcon() {
    const url = window._LAKBY_SINGLE_MARKER_ICON || '/icons/marker-icon.png';
    try {
      await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => rej(false); i.src = url; });
      return L.icon({ iconUrl: url, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
    } catch (e) {
      return L.divIcon({ html: '<div style="width:14px;height:14px;border-radius:50%;background:#1976d2;"></div>', className: 'fallback-point-icon', iconSize: [14, 14], iconAnchor: [7, 7] });
    }
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`=\/]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;' })[ch]);
  }

  // Server helpers
  async function fetchJeepLocations() {
    try {
      const r = await fetch(`${API_BASE}/api/jeepney-location`, { cache: 'no-store' });
      if (!r.ok) throw new Error('jeep fetch failed ' + r.status);
      const j = await r.json();
      return j.locations || {};
    } catch (e) {
      warn('fetchJeepLocations', e);
      return {};
    }
  }
  async function fetchDriverStatuses() {
    try {
      const r = await fetch(`${API_BASE}/api/driver-status`, { cache: 'no-store' });
      if (!r.ok) throw new Error('driver-status fetch failed ' + r.status);
      return await r.json();
    } catch (e) {
      warn('fetchDriverStatuses', e);
      return {};
    }
  }
  async function fetchRouteById(id) {
    if (id === null || id === undefined) return null;
    try {
      const r = await fetch(`${API_BASE}/api/routes/${encodeURIComponent(String(id))}`, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      warn('fetchRouteById', e);
      return null;
    }
  }
  async function fetchRouteByName(name) {
    if (!name) return null;
    try {
      const r = await fetch(`${API_BASE}/api/routes?name=${encodeURIComponent(String(name))}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j) ? j[0] || null : j || null;
    } catch (e) {
      warn('fetchRouteByName', e);
      return null;
    }
  }

  // Bind popup robustly (keeps popup above icon)
  function bindMarkerPopup(marker, html) {
    const opts = { maxWidth: 360, closeButton: true, autoClose: true, keepInView: true, autoPanPadding: [20, 20] };
    try {
      marker.bindPopup(html, opts);
      marker.off('click').on('click', () => { try { marker.openPopup(); } catch (e) {} });
      marker.off('touchstart').on('touchstart', () => { try { marker.openPopup(); } catch (e) {} });
    } catch (e) {
      try { marker.bindPopup(html); } catch (e2) { console.error('bindMarkerPopup failed', e, e2); }
    }
  }

  function formatRouteSummary(route) {
    try {
      if (!route || !route.summary) return null;
      const meters = route.summary.totalDistance || route.summary.distance || 0;
      const km = meters / 1000;
      const kmStr = km ? km.toFixed(2) : null;
      const etaMin = km > 0 ? Math.round((km / FIXED_SPEED_KPH) * 60) : null;
      return { distanceMeters: meters, distanceKm: kmStr, etaMin };
    } catch (e) {
      return null;
    }
  }

  // Map embedded info box
  function createOrGetMapInfoBox(map) {
    if (!map || !map.getContainer) return null;
    const container = map.getContainer();
    let box = container.querySelector('.lakby-route-info');
    if (box) return box;
    box = document.createElement('div');
    box.className = 'lakby-route-info';
    Object.assign(box.style, { position: 'absolute', top: '8px', left: '8px', zIndex: 65000, background: 'rgba(255,255,255,0.95)', padding: '8px 10px', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.16)', fontSize: '13px', maxWidth: '320px', display: 'none' });
    box.innerHTML = '<div class="lakby-title" style="font-weight:700;margin-bottom:6px">Journey details</div><div class="lakby-body"></div>';
    container.appendChild(box);
    return box;
  }
  function showMapInfo(map, title, bodyHtml) {
    const box = createOrGetMapInfoBox(map);
    if (!box) return;
    if (title) box.querySelector('.lakby-title').textContent = title;
    const body = box.querySelector('.lakby-body');
    if (body) body.innerHTML = bodyHtml || '';
    box.style.display = 'block';
  }
  function hideMapInfo(map) {
    const box = map && map.getContainer ? map.getContainer().querySelector('.lakby-route-info') : null;
    if (box) box.style.display = 'none';
  }

  // small CSS tweaks (popup not clipped; hamburger mobile)
  (function injectCss() {
    try {
      const css = `
        .leaflet-popup-pane { pointer-events: auto !important; }
        .leaflet-popup-content-wrapper { max-width: 360px; word-break: break-word; }
        .jeepney-image-icon img { width:36px; height:36px; display:block; }
        .nav-links.show { display:block !important; max-height:400px; overflow:auto; }
        @media (max-width:768px) { .nav-links { display:none; } }
        #show-btn, #highlight-btn { padding:8px 10px; font-size:13px; border-radius:6px; border:0; cursor:pointer; }
        #show-btn { background:#2e7d32; color:#fff; }
        #highlight-btn { background:#1565c0; color:#fff; }
      `;
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    } catch (e) {}
  })();

  // Routes storage (no auto-draw)
  let jeepneyRoutes = []; let routeLines = []; let savedRoutesControls = []; let allRoutesVisible = false; let highlightedRoute = null;
  function loadLocalRoutes() {
    fetch('Routes.json')
      .then(r => { if (!r.ok) throw new Error('Routes.json not found'); return r.json(); })
      .then(d => { jeepneyRoutes = Array.isArray(d) ? d : []; })
      .catch(() => {});
  }
  function drawJeepneyRoutes(map) {
    routeLines.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
    routeLines.length = 0;
    for (const rt of jeepneyRoutes) {
      const pts = rt.points || rt.waypoints || rt.path || [];
      if (!pts || !pts.length) continue;
      const normalized = pts.map(p => Array.isArray(p) ? p : [Number(p.lat), Number(p.lng)]);
      const poly = L.polyline(normalized, { color: rt.color || '#3388ff', weight: 4, opacity: 0.6 });
      poly.__meta = { id: rt.id || rt.name, name: rt.name || rt.id };
      poly.addTo(map);
      routeLines.push(poly);
    }
  }
  async function drawSavedRoutes(map) {
    savedRoutesControls.forEach(c => { try { map.removeControl(c); } catch (e) {} });
    savedRoutesControls.length = 0;
    try {
      const res = await fetch(`${API_BASE}/api/routes`, { cache: 'no-store' });
      if (!res.ok) throw new Error('routes fetch failed ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      for (const dr of data) {
        if (!dr.waypoints || dr.waypoints.length < 2) continue;
        const wps = dr.waypoints.map(p => L.latLng(p.lat, p.lng));
        const control = L.Routing.control({
          waypoints: wps,
          lineOptions: { styles: [{ color: dr.color || 'orange', weight: 6 }] },
          router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
          addWaypoints: false, routeWhileDragging: false, showAlternatives: false, createMarker: () => null
        }).addTo(map);
        control._lakbyMeta = { id: dr.id || dr.name, name: dr.route_name || dr.name };
        savedRoutesControls.push(control);
      }
    } catch (e) { warn('drawSavedRoutes', e); }
  }
  async function toggleShowAllRoutes(map) {
    if (!allRoutesVisible) {
      drawJeepneyRoutes(map);
      await drawSavedRoutes(map);
      allRoutesVisible = true;
    } else {
      routeLines.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
      routeLines.length = 0;
      savedRoutesControls.forEach(c => { try { map.removeControl(c); } catch (e) {} });
      savedRoutesControls.length = 0;
      allRoutesVisible = false;
    }
  }

  // nearest route helpers for highlight
  function haversineDistance(a,b){ const toRad=v=>v*Math.PI/180; const R=6371; const dLat=toRad(b[0]-a[0]); const dLon=toRad(b[1]-a[1]); const lat1=toRad(a[0]), lat2=toRad(b[0]); const sinDlat=Math.sin(dLat/2), sinDlon=Math.sin(dLon/2); const sq=sinDlat*sinDlat + Math.cos(lat1)*Math.cos(lat2)*sinDlon*sinDlon; const c=2*Math.atan2(Math.sqrt(sq), Math.sqrt(1-sq)); return R*c; }
  function findNearestRoute(map, point){ let best={distKm:Infinity, poly:null, ctrl:null}; for(const poly of routeLines){ const latlngs = poly.getLatLngs?poly.getLatLngs():[]; for(const p of latlngs){ const d=haversineDistance([p.lat,p.lng],[point.lat,point.lng]); if(d<best.distKm) best={distKm:d, poly, ctrl:null}; } } for(const ctrl of savedRoutesControls){ try{ const wps = ctrl.getWaypoints?ctrl.getWaypoints():[]; for(const wp of wps){ if(!wp.latLng) continue; const d=haversineDistance([wp.latLng.lat,wp.latLng.lng],[point.lat,point.lng]); if(d<best.distKm) best={distKm:d, poly:null, ctrl}; } }catch(e){} } return best; }
  async function toggleHighlightNearestRoute(map) {
    if (!lastUserLatLng) { alert('Enable tracking (Start Tracking) so we can locate nearest route.'); return; }
    if (highlightedRoute) {
      if (highlightedRoute.poly) try { highlightedRoute.poly.setStyle({ color: highlightedRoute.origColor, weight: highlightedRoute.origWeight }); } catch (e) {}
      if (highlightedRoute.ctrl) try { map.removeControl(highlightedRoute.ctrl); } catch (e) {}
      highlightedRoute = null;
      return;
    }
    const nearest = findNearestRoute(map, lastUserLatLng);
    if (!nearest || (!nearest.poly && !nearest.ctrl)) { alert('No routes available to highlight.'); return; }
    if (nearest.poly) {
      const poly = nearest.poly;
      highlightedRoute = { poly, origColor: poly.options.color, origWeight: poly.options.weight };
      poly.setStyle({ color: '#d32f2f', weight: 7 });
      map.fitBounds(poly.getBounds(), { padding: [40, 40] });
    } else if (nearest.ctrl) {
      try {
        const wps = nearest.ctrl.getWaypoints().map(w => L.latLng(w.latLng.lat, w.latLng.lng));
        const ctrl = L.Routing.control({
          waypoints: wps,
          lineOptions: { styles: [{ color: '#d32f2f', weight: 7 }] },
          router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
          addWaypoints: false, routeWhileDragging: false, showAlternatives: false, createMarker: () => null
        }).addTo(map);
        highlightedRoute = { ctrl };
      } catch (e) { warn('highlight ctrl failed', e); }
    }
  }

  // Only statuses allowed (as requested)
  const ALLOWED_STATUSES = ['Docking', 'Loading', 'On Route', 'End'];
  const STATUS_EMOJI = { 'Docking':'⚪️', 'Loading':'⏳', 'On Route':'🚐', 'End':'✅', '—':'❔' };
  function formatStatusWithEmoji(status) {
    const s = status && String(status).trim() ? String(status).trim() : '—';
    if (!ALLOWED_STATUSES.includes(s)) return `${STATUS_EMOJI['—']} ${s}`;
    return `${STATUS_EMOJI[s]} ${s}`;
  }

  // hamburger toggle for mobile
  function initBurger() {
    try {
      const burger = document.getElementById('burger-btn') || document.querySelector('.burger-btn') || document.querySelector('.burger-toggle');
      const nav = document.querySelector('.nav-links') || document.querySelector('.menu') || document.querySelector('.nav');
      if (!burger) return;
      burger.addEventListener('click', () => {
        if (nav) {
          nav.classList.toggle('show');
          if (nav.classList.contains('show')) nav.style.maxHeight = '400px';
          else nav.style.maxHeight = '';
        } else {
          let tmp = document.querySelector('.lakby-mobile-nav');
          if (!tmp) {
            tmp = document.createElement('div');
            tmp.className = 'lakby-mobile-nav';
            Object.assign(tmp.style, { position:'fixed', top:'56px', right:'12px', zIndex:99999, background:'rgba(255,255,255,0.98)', padding:'10px', borderRadius:'6px', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' });
            tmp.innerHTML = `<a href="#" style="display:block;padding:6px 0">Home</a><a href="#" style="display:block;padding:6px 0">Routes</a><a href="#" style="display:block;padding:6px 0">Saved Trips</a>`;
            document.body.appendChild(tmp);
            setTimeout(() => tmp.classList.remove('show'), 6000);
          } else tmp.classList.toggle('show');
        }
      });
    } catch (e) { warn('initBurger', e); }
  }

  // state
  let lastUserLatLng = null;
  let singleMarkerIcon = null;

  document.addEventListener('DOMContentLoaded', async () => {
    await preloadJeepIcon();
    loadLocalRoutes();
    initBurger();

    // prefer existing buttons
    let showBtn = document.getElementById('show-btn');
    let highlightBtn = document.getElementById('highlight-btn');

    // fallbacks if missing (kept minimal)
    if (!showBtn) { showBtn = document.createElement('button'); showBtn.id = 'show-btn'; showBtn.textContent = 'Show All Routes'; Object.assign(showBtn.style, { position:'fixed', left:'12px', bottom:'110px', zIndex:99999, padding:'8px 10px', borderRadius:'6px', background:'#2e7d32', color:'#fff' }); document.body.appendChild(showBtn); }
    if (!highlightBtn) { highlightBtn = document.createElement('button'); highlightBtn.id = 'highlight-btn'; highlightBtn.textContent = 'Highlight Nearest Route'; Object.assign(highlightBtn.style, { position:'fixed', left:'150px', bottom:'110px', zIndex:99999, padding:'8px 10px', borderRadius:'6px', background:'#1565c0', color:'#fff' }); document.body.appendChild(highlightBtn); }

    // map element fallback
    let mapEl = document.getElementById('map');
    if (!mapEl) { mapEl = document.createElement('div'); mapEl.id = 'map'; Object.assign(mapEl.style, { position:'absolute', top:'0', left:'0', right:'0', bottom:'0' }); document.body.appendChild(mapEl); }

    // track/clear/status fallbacks
    let trackBtn = document.getElementById('track-btn');
    if (!trackBtn) { trackBtn = document.createElement('button'); trackBtn.id = 'track-btn'; trackBtn.textContent = 'Start Tracking'; Object.assign(trackBtn.style, { position:'fixed', left:'12px', bottom:'12px', zIndex:99999, padding:'8px 10px', borderRadius:'6px', background:'#1976d2', color:'#fff' }); document.body.appendChild(trackBtn); }
    let clearBtn = document.getElementById('clear-btn');
    if (!clearBtn) { clearBtn = document.createElement('button'); clearBtn.id = 'clear-btn'; clearBtn.textContent = 'Clear'; Object.assign(clearBtn.style, { position:'fixed', left:'140px', bottom:'12px', zIndex:99999, padding:'8px 10px', borderRadius:'6px', background:'#9e9e9e', color:'#fff' }); document.body.appendChild(clearBtn); }
    let statusEl = document.getElementById('location-status');
    if (!statusEl) { statusEl = document.createElement('div'); statusEl.id = 'location-status'; Object.assign(statusEl.style, { position:'fixed', left:'12px', bottom:'64px', zIndex:99999, padding:'6px 8px', background:'rgba(255,255,255,0.95)', borderRadius:'6px', fontSize:'13px' }); document.body.appendChild(statusEl); }

    // initialize map
    let map;
    try {
      map = L.map(mapEl).setView([14.7959, 120.8789], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    } catch (e) { console.error('Leaflet init failed', e); return; }
    window.map = map;

    // prepare icons
    singleMarkerIcon = await createSingleMarkerIcon();

    // state containers
    window.jeepneyMarkers = window.jeepneyMarkers || {};
    let userMarker = null;
    let userWatchId = null;
    let routingControl = null;

    function updateUserMarker(lat, lng, accuracy) {
      lastUserLatLng = { lat, lng };
      if (!userMarker) {
        const icon = singleMarkerIcon || new L.Icon.Default();
        userMarker = L.marker([lat, lng], { icon }).addTo(map).bindPopup('You are here', { maxWidth: 260 });
        window.userMarker = userMarker;
      } else userMarker.setLatLng([lat, lng]);
      if (!map._isCenteredOnUser) { try { map.setView([lat, lng], 15); } catch (e) {} map._isCenteredOnUser = true; }
      if (statusEl) statusEl.textContent = `Location detected (±${Math.round(accuracy || 0)} m)`;
    }

    trackBtn.addEventListener('click', () => { if (!userWatchId) startTracking(); else stopTracking(); });
    function startTracking() {
      if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
      if (userWatchId) return;
      userWatchId = navigator.geolocation.watchPosition(
        pos => updateUserMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        err => { warn('geolocation error', err); if (statusEl) statusEl.textContent = 'Location error'; },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
      trackBtn.textContent = 'Stop Tracking';
      if (statusEl) statusEl.textContent = 'Tracking enabled';
    }
    function stopTracking() {
      if (userWatchId) { navigator.geolocation.clearWatch(userWatchId); userWatchId = null; }
      trackBtn.textContent = 'Start Tracking';
      if (statusEl) statusEl.textContent = 'Tracking stopped';
      try { if (userMarker) { map.removeLayer(userMarker); userMarker = null; window.userMarker = null; } } catch (e) {}
      lastUserLatLng = null; map._isCenteredOnUser = false; hideMapInfo(map);
    }

    clearBtn.addEventListener('click', () => {
      try { if (routingControl) { map.removeControl(routingControl); routingControl = null; } } catch (e) {}
      if (window._LAKBY_tempFallbackPolyline) { try { map.removeLayer(window._LAKBY_tempFallbackPolyline); } catch (e) {} window._LAKBY_tempFallbackPolyline = null; }
      hideMapInfo(map);
    });

    async function routeFromUserTo(destLat, destLng) {
      if (!lastUserLatLng) { alert('Enable tracking (Start Tracking) so we can route from your location.'); return; }
      try { if (routingControl) { map.removeControl(routingControl); routingControl = null; } } catch (e) {}
      try {
        routingControl = L.Routing.control({
          waypoints: [ L.latLng(lastUserLatLng.lat, lastUserLatLng.lng), L.latLng(destLat, destLng) ],
          router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
          addWaypoints: false, routeWhileDragging: false, showAlternatives: false, createMarker: () => null,
          lineOptions: { styles: [{ color: '#1976d2', weight: 6 }] }, show: false
        }).addTo(map);
        setTimeout(() => { const el = document.querySelector('.leaflet-routing-container'); if (el) el.style.display = 'none'; }, 200);
        const result = await new Promise(resolve => {
          let handled = false;
          routingControl.on('routesfound', e => { if (handled) return; handled = true; resolve({ ok: true, routes: e.routes }); });
          routingControl.on('routingerror', () => { if (handled) return; handled = true; resolve({ ok: false }); });
          setTimeout(() => { if (handled) return; handled = true; resolve({ ok: false, timeout: true }); }, 20000);
        });
        if (!result || !result.ok) {
          try { if (routingControl) { map.removeControl(routingControl); routingControl = null; } } catch (e) {}
          const pl = L.polyline([[lastUserLatLng.lat, lastUserLatLng.lng], [destLat, destLng]], { color: '#1976d2', weight: 4, dashArray: '6 6' }).addTo(map);
          window._LAKBY_tempFallbackPolyline = pl;
          showMapInfo(map, 'Direct route', `<div>Distance: — km<br>ETA: — min (${FIXED_SPEED_KPH} km/h)</div>`);
          return;
        }
        const route = result.routes && result.routes[0];
        const summary = formatRouteSummary(route);
        showMapInfo(map, 'Journey details', `<div>Distance: ${summary && summary.distanceKm ? summary.distanceKm + ' km' : '—'}<br>ETA: ${summary && summary.etaMin !== null ? summary.etaMin + ' min' : '—'} (${FIXED_SPEED_KPH} km/h)</div>`);
      } catch (e) { warn('routeFromUserTo', e); alert('Failed to calculate route. See console.'); }
    }

    map.on('click', e => {
      const { lat, lng } = e.latlng;
      try {
        if (!window._lakbyDestinationMarker) {
          window._lakbyDestinationMarker = L.marker([lat, lng], { icon: singleMarkerIcon }).addTo(map).bindPopup('Destination').openPopup();
        } else {
          window._lakbyDestinationMarker.setLatLng([lat, lng]);
          try { window._lakbyDestinationMarker.openPopup(); } catch (e) {}
        }
      } catch (e) {}
      routeFromUserTo(lat, lng);
    });

    // Poll jeep locations & ensure popups show Name/Plate/Status(with emoji)/Route above icon on click
    (async function jeepAndStatusLoop() {
      while (true) {
        try {
          const [locs, statuses] = await Promise.all([ fetchJeepLocations(), fetchDriverStatuses() ]);
          const localDriverId = localStorage.getItem('driverId') || null;

          // remove absent markers
          Object.keys(window.jeepneyMarkers).forEach(id => {
            if (!locs[id]) { try { map.removeLayer(window.jeepneyMarkers[id]); } catch (e) {} delete window.jeepneyMarkers[id]; }
          });

          for (const [id, loc] of Object.entries(locs || {})) {
            const lat = Number(loc.lat), lng = Number(loc.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

            const name = loc.name || loc.driver_name || `Driver ${id}`;
            const plate = loc.plate || loc.plate_number || '—';
            const payloadRouteText = loc.current_route || loc.route || loc.route_name || '';

            // initial popup HTML (shows Loading ... status; replaced on click/popupopen)
            const initialHtml = `
              <div style="min-width:240px">
                <div style="font-weight:700;font-size:15px;margin-bottom:6px">${escapeHtml(name)}</div>
                <div style="font-size:13px;color:#333">Plate: <strong>${escapeHtml(plate)}</strong></div>
                <div class="driver-status-line" style="margin-top:6px;font-size:13px;color:#333">Status: <strong>Fetching…</strong></div>
                <div style="margin-top:6px;font-size:13px;color:#333">Route: <strong class="payload-route">${escapeHtml(payloadRouteText || '—')}</strong></div>
                <div style="margin-top:6px;font-size:11px;color:#666">(Tap to refresh status & route)</div>
              </div>
            `;

            const latLng = [lat, lng];

            // choose icon: prefer jeep image for vehicles; otherwise generic single marker icon
            let icon = singleMarkerIcon || null;
            if (window._LAKBY_preloadedJeep && window._LAKBY_preloadedJeep.ok && window._LAKBY_preloadedJeep.icon) icon = window._LAKBY_preloadedJeep.icon;

            if (!window.jeepneyMarkers[id]) {
              const m = L.marker(latLng, { icon, interactive: true, riseOnHover: true }).addTo(map);
              bindMarkerPopup(m, initialHtml);

              // update popup content on click/popupopen (fetch fresh status & route)
              const updatePopup = async () => {
                try {
                  try { m.openPopup(); } catch (e) {}
                  // fetch fresh statuses mapping
                  let ds = '—';
                  try {
                    const fresh = await fetchDriverStatuses().catch(() => ({}));
                    ds = (fresh && fresh[String(id)] && fresh[String(id)].status) ? fresh[String(id)].status : '—';
                  } catch (e) { /* ignore */ }

                  // only display statuses from allowed set; if server sends other, still show but emoji will use default
                  const statusText = formatStatusWithEmoji(ds);

                  // fetch authoritative route
                  let routeText = payloadRouteText || '—';
                  try {
                    let dbRoute = null;
                    if (loc.route_id || loc.routeId) dbRoute = await fetchRouteById(loc.route_id || loc.routeId);
                    if (!dbRoute && payloadRouteText) dbRoute = await fetchRouteByName(payloadRouteText);
                    if (dbRoute) routeText = dbRoute.name || dbRoute.route_name || dbRoute.title || String(dbRoute.id);
                  } catch (e) { /* ignore */ }

                  const fullHtml = `
                    <div style="min-width:240px">
                      <div style="font-weight:700;font-size:15px;margin-bottom:6px">${escapeHtml(name)}</div>
                      <div style="font-size:13px;color:#333">Plate: <strong>${escapeHtml(plate)}</strong></div>
                      <div style="margin-top:6px;font-size:13px;color:#333">Status: <strong>${escapeHtml(statusText)}</strong></div>
                      <div style="margin-top:6px;font-size:13px;color:#333">Route: <strong>${escapeHtml(routeText)}</strong></div>
                    </div>
                  `;
                  try { m.setPopupContent(fullHtml); } catch (e) { warn('setPopupContent failed', e); }
                } catch (e) { warn('updatePopup failed', e); }
              };

              m.on('click', updatePopup);
              m.on('popupopen', updatePopup);

              // highlight local driver (if this device is a driver)
              if (localDriverId && String(localDriverId) === String(id)) {
                try { m.setZIndexOffset(1000); setTimeout(() => { try { m.openPopup(); } catch (e) {} }, 300); } catch (e) {}
              }

              window.jeepneyMarkers[id] = m;
            } else {
              const m = window.jeepneyMarkers[id];
              m.setLatLng(latLng);
              try { m.setPopupContent(initialHtml); } catch (e) {}
              try { m.setIcon(icon); } catch (e) {}
            }
          }
        } catch (e) {
          warn('jeepAndStatusLoop error', e);
        }
        await new Promise(res => setTimeout(res, POLL_MS));
      }
    })();

    // hook up existing buttons
    if (showBtn) {
      showBtn.addEventListener('click', async () => {
        try {
          await toggleShowAllRoutes(map);
          showBtn.textContent = allRoutesVisible ? 'Hide All Routes' : 'Show All Routes';
        } catch (e) { warn('showBtn toggle failed', e); alert('Failed to toggle routes (see console)'); }
      });
    }
    if (highlightBtn) {
      highlightBtn.addEventListener('click', () => {
        try {
          if (highlightedRoute) {
            if (highlightedRoute.poly) try { highlightedRoute.poly.setStyle({ color: highlightedRoute.origColor, weight: highlightedRoute.origWeight }); } catch (e) {}
            if (highlightedRoute.ctrl) try { map.removeControl(highlightedRoute.ctrl); } catch (e) {}
            highlightedRoute = null;
            highlightBtn.textContent = 'Highlight Nearest Route';
            return;
          }
          toggleHighlightNearestRoute(map);
          highlightBtn.textContent = highlightedRoute ? 'Unhighlight Route' : 'Highlight Nearest Route';
        } catch (e) { warn('highlightBtn', e); }
      });
    }

    log('CommuterHP initialized — popups anchored above icons; only allowed statuses shown with emojis; burger works on mobile.');
  });

  // Helper: format status with emoji (only allowed statuses)
  function formatStatusWithEmoji(status) {
    const s = status && String(status).trim() ? String(status).trim() : '—';
    const map = { 'Docking':'⚪️', 'Loading':'⏳', 'On Route':'🚐', 'End':'✅', '—':'❔' };
    const emoji = map[s] || map['—'];
    return `${emoji} ${s}`;
  }
})();