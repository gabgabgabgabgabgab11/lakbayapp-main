
(function () {
  const API_BASE = (() => {
    try {
      const origin = window.location.origin || '';
      if (origin && origin.startsWith('http')) return origin.replace(/\/$/, '');
    } catch (e) {}
    return 'http://localhost:3000';
  })();

  console.info('[DriverHP] API_BASE =', API_BASE);

   (function forceLocalLeafletIcons() {
  try {
    // Use origin-relative paths so they work both locally and via ngrok
    const iconsBase = '/icons';
    const iconUrl = `${iconsBase}/marker-icon.png`;
    const icon2xUrl = `${iconsBase}/marker-icon-2x.png`;
    const shadowUrl = `${iconsBase}/marker-shadow.png`;

    // 1) mergeOptions (recommended)
    if (window.L && L.Icon && L.Icon.Default && typeof L.Icon.Default.mergeOptions === 'function') {
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: icon2xUrl,
        iconUrl: iconUrl,
        shadowUrl: shadowUrl
      });
    }

    // 2) defensive: set prototype option (covers some leaflet builds)
    if (window.L && L.Icon && L.Icon.Default && L.Icon.Default.prototype) {
      L.Icon.Default.prototype.options.iconUrl = iconUrl;
      L.Icon.Default.prototype.options.iconRetinaUrl = icon2xUrl;
      L.Icon.Default.prototype.options.shadowUrl = shadowUrl;
    }

    // 3) final fallback: define HTML for default icon (rare)
    window._LAKBY_LEAFLET_ICONS_FORCED = { iconUrl, icon2xUrl, shadowUrl };
    console.info('[LeafletIcons] forced local icons:', iconUrl);
  } catch (e) {
    console.warn('Could not force local leaflet icons', e);
  }
})();

  // Use local leaflet images
  if (window.L && L.Icon && L.Icon.Default) {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/icons/marker-icon-2x.png',
      iconUrl: '/icons/marker-icon.png',
      shadowUrl: '/icons/marker-shadow.png'
    });
  }

  // Jeep icon
  let JEEP_ICON = null;
  if (window.L && L.icon) {
    JEEP_ICON = L.icon({
      iconUrl: '/icons/Jeep.png',
      iconRetinaUrl: '/icons/Jeep@2x.png',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
      className: 'jeepney-image-icon'
    });
  }

  // Burger menu wiring
  const burgerBtn = document.getElementById('burger-btn');
  const navLinks = document.querySelector('.nav-links');
  if (burgerBtn && navLinks) burgerBtn.addEventListener('click', () => navLinks.classList.toggle('show'));

  function decodeJwtPayload(token) {
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      console.warn('Failed to decode JWT payload', e);
      return null;
    }
  }
  function isTokenExpired(token) {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload) return true;
    if (!payload.exp) return false;
    return Date.now() > payload.exp * 1000;
  }

  function ensureValidTokenOrRedirect() {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem('driverToken');
      localStorage.removeItem('driver_token');
      localStorage.removeItem('driverId');
      window.location.replace('LoginPage.html?role=driver');
      return false;
    }
    return true;
  }

  async function sendLocationUpdate(lat, lng) {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    const driverId = localStorage.getItem('driverId');
    if (!token || !driverId) {
      console.warn('Not authenticated; skipping location send');
      return;
    }
    const base = (localStorage.getItem('driver_api_base') || API_BASE).replace(/\/$/, '');
    const url = `${base}/api/jeepney-location`;
    const body = { driverId: Number(driverId), lat: Number(lat), lng: Number(lng) };
    console.debug('[DriverHP] POST ->', url, body);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      console.debug('[DriverHP] POST res', res.status, res.statusText);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[DriverHP] Location update failed:', res.status, text);
      } else {
        const data = await res.json().catch(() => null);
        console.debug('[DriverHP] Location update success', data);
      }
    } catch (err) {
      console.error('sendLocationUpdate error', err);
    }
  }

  async function sendDriverStatus(status) {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    const driverId = localStorage.getItem('driverId');
    if (!token || !driverId) {
      console.warn('Not authenticated; skipping status send');
      return;
    }
    try {
      const url = (localStorage.getItem('driver_api_base') || API_BASE).replace(/\/$/, '') + '/api/driver-status';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ driverId: Number(driverId), status, timestamp: Date.now() })
      });
      console.debug('[DriverHP] status POST', res.status);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.warn('[DriverHP] Status update failed:', res.status, txt);
      } else {
        const data = await res.json().catch(() => null);
        console.debug('[DriverHP] Status updated response', data);
      }
    } catch (err) {
      console.error('Status update error:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!ensureValidTokenOrRedirect()) return;

    const mapContainer = document.getElementById('map');
    const startDrivingBtn = document.getElementById('start-driving');
    const statusText = document.getElementById('status');
    const statusButtons = document.querySelectorAll('.status-btn');

    let map = null;
    let jeepMarker = null;
    let driverWatchId = null;
    let lastDriverSentAt = 0;
    let currentStatus = 'Docking';
    const DRIVER_SEND_INTERVAL = 2000;

    try {
      if (mapContainer && typeof L !== 'undefined') {
        map = L.map('map').setView([14.7959, 120.8789], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
      }
    } catch (e) {
      console.warn('Leaflet init failed', e);
    }

    statusButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        statusButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.textContent.trim();
        sendDriverStatus(currentStatus);
        if (statusText) statusText.textContent = `Status: ${currentStatus}`;
      });
    });

    sendDriverStatus(currentStatus);

    function startDriverTracking() {
      if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
      if (driverWatchId) return;

      driverWatchId = navigator.geolocation.watchPosition(pos => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (map) {
          const latlng = [lat, lng];
          if (!jeepMarker) {
            if (JEEP_ICON) {
              jeepMarker = L.marker(latlng, { icon: JEEP_ICON }).addTo(map).bindPopup('You (driver)');
            } else {
              const tmp = L.icon({ iconUrl: '/icons/Jeep.png', iconSize: [32,32], iconAnchor: [16,16] });
              jeepMarker = L.marker(latlng, { icon: tmp }).addTo(map).bindPopup('You (driver)');
            }
            try { map.setView(latlng, 15); } catch (e) {}
          } else {
            jeepMarker.setLatLng(latlng);
          }
        }

        if (now - lastDriverSentAt >= DRIVER_SEND_INTERVAL) {
          lastDriverSentAt = now;
          sendLocationUpdate(lat, lng);
        }
      }, err => {
        console.warn('Driver geolocation error', err);
        if (statusText) statusText.textContent = 'Geolocation error';
      }, { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 });

      if (startDrivingBtn) startDrivingBtn.textContent = "🛑 Stop Driving";
      if (statusText) statusText.textContent = `Live driving - Status: ${currentStatus}`;
    }

    function stopDriverTracking() {
      if (driverWatchId) { navigator.geolocation.clearWatch(driverWatchId); driverWatchId = null; }
      if (statusText) statusText.textContent = "Stopped driving.";
      if (startDrivingBtn) startDrivingBtn.textContent = "🚐 Start Driving";
      if (jeepMarker && map) { try { map.removeLayer(jeepMarker); } catch (e) {} jeepMarker = null; }
    }

    if (startDrivingBtn) {
      startDrivingBtn.addEventListener('click', () => {
        if (driverWatchId) stopDriverTracking();
        else {
          if (!ensureValidTokenOrRedirect()) return;
          startDriverTracking();
        }
      });
    }
  });
})();