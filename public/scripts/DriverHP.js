

(() => {
  const API_BASE = (() => {
    const origin = window.location.origin;
    return origin.includes('ngrok') || origin.startsWith('http') ? origin : 'http://localhost:3000';
  })();

  function decodeJwtPayload(token) {
    try {
      const payloadBase64 = token.split('.')[1];
      const json = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      return null;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('map');
    const loginBtn = document.getElementById('login-btn');
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');

    const startDriveBtn = document.getElementById('start-drive-btn');
    const stopDriveBtn = document.getElementById('stop-drive-btn');
    const startDrivingBtn = document.getElementById('start-driving'); // legacy id compatibility
    const primaryStartBtn = startDrivingBtn || startDriveBtn;
    const status = document.getElementById('driver-status');

    // Build login overlay if token missing
    function ensureLoginOverlay() {
      if (localStorage.getItem('driverToken')) {
        // already authenticated
        const stored = localStorage.getItem('driverToken');
        if (stored && status) status.textContent = 'Driver authenticated';
        return null;
      }

      // create overlay DOM (only once)
      let overlay = document.getElementById('driver-login-overlay');
      if (overlay) return overlay;

      overlay = document.createElement('div');
      overlay.id = 'driver-login-overlay';
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.background = 'rgba(255,255,255,0.95)';
      overlay.style.zIndex = '99999';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.innerHTML = `
        <div style="width:320px;padding:20px;border-radius:8px;background:#fff;border:1px solid #ddd;box-shadow:0 6px 20px rgba(0,0,0,0.08);">
          <h3 style="margin:0 0 10px 0">Driver Sign In</h3>
          <input id="overlay-login-email" placeholder="Email" style="width:100%;padding:8px;margin-bottom:8px" />
          <input id="overlay-login-password" placeholder="Password" type="password" style="width:100%;padding:8px;margin-bottom:12px" />
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="overlay-login-cancel" style="padding:8px 12px;background:#f6f6f6;border:1px solid #ddd;border-radius:4px;">Cancel</button>
            <button id="overlay-login-submit" style="padding:8px 12px;background:#007bff;color:#fff;border:none;border-radius:4px;">Sign In</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // handlers
      document.getElementById('overlay-login-cancel').addEventListener('click', () => {
        overlay.style.display = 'none';
      });

      document.getElementById('overlay-login-submit').addEventListener('click', async () => {
        const email = document.getElementById('overlay-login-email').value.trim();
        const password = document.getElementById('overlay-login-password').value;
        if (!email || !password) return alert('Email & password required');
        try {
          const res = await fetch(`${API_BASE}/api/login/driver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const j = await res.json();
          if (!res.ok) {
            alert(j.message || 'Login failed');
            return;
          }
          const token = j.token;
          localStorage.setItem('driverToken', token);
          const payload = decodeJwtPayload(token);
          if (payload && payload.id) localStorage.setItem('driverId', String(payload.id));
          overlay.style.display = 'none';
          alert('Login successful. You can now Start Driving.');
          if (status) status.textContent = 'Driver authenticated';
        } catch (err) {
          console.error('Overlay login error', err);
          alert('Network error signing in');
        }
      });

      return overlay;
    }

    // initialize map if present
    let map = null;
    if (mapContainer) {
      map = L.map('map').setView([14.7959, 120.8789], 15);
      window._LAKBY_MAP_DRIVER = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    // driver marker & watch
    let jeepMarker = null;
    let driverWatchId = null;
    let lastDriverSentAt = 0;
    const DRIVER_SEND_INTERVAL = 2000;

    async function sendLocationUpdate(lat, lng) {
      const token = localStorage.getItem('driverToken');
      const driverId = localStorage.getItem('driverId');
      if (!token || !driverId) {
        console.warn('Not authenticated as driver; skipping send');
        if (status) status.textContent = 'Not authenticated as driver';
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/jeepney-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ driverId: Number(driverId), lat: Number(lat), lng: Number(lng) })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'unknown' }));
          console.warn('Location update failed', res.status, err);
          if (status) status.textContent = `Update failed: ${res.status}`;
        } else {
          if (status) status.textContent = `Driving: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
      } catch (err) {
        console.error('sendLocationUpdate error', err);
        if (status) status.textContent = 'Update error';
      }
    }

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

        // show/update local marker on driver map
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

      // UI updates (restored as requested)
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

    if (primaryStartBtn) {
      primaryStartBtn.addEventListener('click', () => {
        if (driverWatchId) stopDriverTracking();
        else {
          // ensure logged in before starting
          if (!localStorage.getItem('driverToken')) {
            const ov = ensureLoginOverlay();
            if (ov) ov.style.display = 'flex';
            return;
          }
          startDriverTracking();
        }
      });
    }

    if (startDriveBtn && !primaryStartBtn) startDriveBtn.addEventListener('click', () => {
      if (!localStorage.getItem('driverToken')) {
        const ov = ensureLoginOverlay();
        if (ov) ov.style.display = 'flex';
        return;
      }
      startDriverTracking();
    });
    if (stopDriveBtn) stopDriveBtn.addEventListener('click', stopDriverTracking);

    // show overlay automatically if not authenticated so user can't mistakenly "use" driver features
    if (!localStorage.getItem('driverToken')) {
      const ov = ensureLoginOverlay();
      if (ov) ov.style.display = 'flex';
    }
  });
})();