// driverhp.js
// DriverHomepage script (no overlay auto-creation elsewhere).
// - Validates JWT expiry and forces login when expired (redirects to LoginPage.html?role=driver).
// - Provides helper functions to save token, send location updates, and start/stop tracking.
// - If you previously had an overlay/modal in this file, this version removes it and instead redirects to the shared LoginPage.
// Place at: public/scripts/driverhp.js

(function () {
  const DEFAULT_API_BASE = 'http://localhost:3000'; // fallback base if not running through ngrok/origin
  const endpointsToTry = [
    '/api/login/driver',
    '/api/driver-login',
    '/api/login',
    '/auth/login',
    '/login'
  ];

    const burgerBtn = document.getElementById('burger-btn');
    const navLinks = document.querySelector('.nav-links');
    burgerBtn.addEventListener('click', () => {
      navLinks.classList.toggle('show');
    });
    
  const API_BASE = (() => {
    try {
      const origin = (window.location && window.location.origin) || '';
      if (origin.includes('ngrok') || origin.startsWith('http')) return origin.replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    return DEFAULT_API_BASE;
  })();

  function decodeJwtPayload(token) {
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      // decodeURIComponent(escape(...)) to handle utf8 characters in some tokens
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      console.warn('Failed to decode JWT payload', e);
      return null;
    }
  }

  function isTokenExpired(token) {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload) return true; // if can't parse, treat as expired to force re-login
    if (!payload.exp) return false; // no expiry claim — assume valid
    return Date.now() > payload.exp * 1000;
  }

  // Save token in multiple keys for compatibility with various parts of the app
  function saveTokenAndId(token, driverId, apiBase) {
    try {
      localStorage.setItem('driverToken', token);
      localStorage.setItem('driver_token', token); // compatibility key
      if (driverId != null) localStorage.setItem('driverId', String(driverId));
      if (apiBase) localStorage.setItem('driver_api_base', apiBase);
      console.log('Saved driver token (len=' + (token ? token.length : 0) + ') driverId=' + driverId);
    } catch (e) {
      console.warn('Failed to save token in localStorage', e);
    }
  }

  // Send location to backend
  async function sendLocationUpdate(lat, lng) {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    const driverId = localStorage.getItem('driverId');
    if (!token || !driverId) {
      console.warn('Not authenticated as driver; skipping send');
      return;
    }
    try {
      const url = (localStorage.getItem('driver_api_base') || API_BASE).replace(/\/$/, '') + '/api/jeepney-location';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ driverId: Number(driverId), lat: Number(lat), lng: Number(lng) })
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({ message: 'unknown' }));
        console.warn('Location update failed', res.status, err);
      } else {
        // success - optional handling
      }
    } catch (err) {
      console.error('sendLocationUpdate error', err);
    }
  }

  // Attempt to login against known endpoints (used only if you want inline login from this file).
  // Left for reference / optional use. The production login is handled on LoginPage.html.
  async function tryPostLogin(endpointPath, email, password) {
    const url = endpointPath.startsWith('http') ? endpointPath : (API_BASE + endpointPath);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  }

  // Ensure valid token; if missing / expired, redirect to shared login page
  function ensureValidTokenOrRedirect() {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    if (!token || isTokenExpired(token)) {
      // Clear stale tokens
      localStorage.removeItem('driverToken');
      localStorage.removeItem('driver_token');
      localStorage.removeItem('driverId');
      // Redirect to unified login page for drivers
      window.location.replace('LoginPage.html?role=driver');
      return false;
    }
    return true;
  }

  // Map and tracking setup (keeps behavior from existing DriverHomepage)
  document.addEventListener('DOMContentLoaded', () => {
    // enforce auth on page load before initializing driver features
    if (!ensureValidTokenOrRedirect()) return;

    const mapContainer = document.getElementById('map');
    const startDriveBtn = document.getElementById('start-drive-btn');
    const stopDriveBtn = document.getElementById('stop-drive-btn');
    const startDrivingBtn = document.getElementById('start-driving'); // legacy id compatibility
    const primaryStartBtn = startDrivingBtn || startDriveBtn;
    const status = document.getElementById('driver-status');

    let map = null;
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

    let jeepMarker = null;
    let driverWatchId = null;
    let lastDriverSentAt = 0;
    const DRIVER_SEND_INTERVAL = 2000;

    function startDriverTracking() {
      if (!navigator.geolocation) {
        alert('Geolocation not supported');
        return;
      }
      if (driverWatchId) return;

      driverWatchId = navigator.geolocation.watchPosition(pos => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (map) {
          const latlng = [lat, lng];
          if (!jeepMarker) {
            const jeepIcon = L.icon({ iconUrl: '/icons/Jeep.png', iconSize: [32, 32], iconAnchor: [16, 16] });
            jeepMarker = L.marker(latlng, { icon: jeepIcon }).addTo(map).bindPopup('You (driver)');
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
        if (status) status.textContent = 'Geolocation error';
      }, { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 });

      if (primaryStartBtn) primaryStartBtn.textContent = "🛑 Stop Driving";
      if (status) status.textContent = "Live driving started...";
    }

    function stopDriverTracking() {
      if (driverWatchId) {
        navigator.geolocation.clearWatch(driverWatchId);
        driverWatchId = null;
      }
      if (status) status.textContent = "Stopped live driving.";
      if (primaryStartBtn) primaryStartBtn.textContent = "🚐 Start Driving";
      if (jeepMarker && map) {
        try { map.removeLayer(jeepMarker); } catch (e) {}
        jeepMarker = null;
      }
    }

    // Hook UI buttons
    if (primaryStartBtn) {
      primaryStartBtn.addEventListener('click', () => {
        if (driverWatchId) stopDriverTracking();
        else {
          if (!ensureValidTokenOrRedirect()) return;
          startDriverTracking();
        }
      });
    }

    if (startDriveBtn && !primaryStartBtn) startDriveBtn.addEventListener('click', () => {
      if (!ensureValidTokenOrRedirect()) return;
      startDriverTracking();
    });
    if (stopDriveBtn) stopDriveBtn.addEventListener('click', stopDriverTracking);

    // set status text
    if (status) status.textContent = 'Driver authenticated';
  });
})();