// DriverHP.js - COMPLETE FILE
(function () {
  const DEFAULT_API_BASE = 'http://localhost:3000';
  const API_BASE = (() => {
    try {
      const origin = (window.location && window.location.origin) || '';
      if (origin.includes('ngrok') || origin.startsWith('http')) return origin.replace(/\/$/, '');
    } catch (e) {}
    return DEFAULT_API_BASE;
  })();

  // Burger menu
  const burgerBtn = document.getElementById('burger-btn');
  const navLinks = document.querySelector('.nav-links');
  if (burgerBtn && navLinks) {
    burgerBtn.addEventListener('click', () => {
      navLinks.classList.toggle('show');
    });
  }

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

  function saveTokenAndId(token, driverId, apiBase) {
    try {
      localStorage.setItem('driverToken', token);
      localStorage.setItem('driver_token', token);
      if (driverId != null) localStorage.setItem('driverId', String(driverId));
      if (apiBase) localStorage.setItem('driver_api_base', apiBase);
      console.log('Saved driver token');
    } catch (e) {
      console.warn('Failed to save token', e);
    }
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

  // Send location to backend
  async function sendLocationUpdate(lat, lng) {
    const token = localStorage.getItem('driverToken') || localStorage.getItem('driver_token');
    const driverId = localStorage.getItem('driverId');
    if (!token || !driverId) {
      console.warn('Not authenticated; skipping location send');
      return;
    }
    
    try {
      const url = (localStorage.getItem('driver_api_base') || API_BASE).replace(/\/$/, '') + '/api/jeepney-location';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          driverId: Number(driverId), 
          lat: Number(lat), 
          lng: Number(lng) 
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'unknown' }));
        console.warn('Location update failed', res.status, err);
      }
    } catch (err) {
      console.error('sendLocationUpdate error', err);
    }
  }

  // Send driver status to backend
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          driverId: Number(driverId), 
          status,
          timestamp: Date.now()
        })
      });
      
      if (res.ok) {
        console.log(`✅ Status updated to: ${status}`);
      } else {
        const err = await res.json().catch(() => ({ message: 'unknown' }));
        console.warn('Status update failed', res.status, err);
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
    let currentStatus = 'Docking'; // Default status
    const DRIVER_SEND_INTERVAL = 2000;

    // Initialize map
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

    // Status button handlers
    statusButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active from all buttons
        statusButtons.forEach(b => b.classList.remove('active'));
        // Add active to clicked button
        btn.classList.add('active');
        
        // Get status from button text
        currentStatus = btn.textContent.trim();
        
        // Send status to backend
        sendDriverStatus(currentStatus);
        
        if (statusText) {
          statusText.textContent = `Status: ${currentStatus}`;
        }
      });
    });

    // Send initial status
    sendDriverStatus(currentStatus);

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
            const jeepIcon = L.icon({ 
              iconUrl: '/icons/Jeep.png', 
              iconSize: [32, 32], 
              iconAnchor: [16, 16] 
            });
            jeepMarker = L.marker(latlng, { icon: jeepIcon })
              .addTo(map)
              .bindPopup('You (driver)');
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
      if (driverWatchId) {
        navigator.geolocation.clearWatch(driverWatchId);
        driverWatchId = null;
      }
      if (statusText) statusText.textContent = "Stopped driving.";
      if (startDrivingBtn) startDrivingBtn.textContent = "🚐 Start Driving";
      if (jeepMarker && map) {
        try { map.removeLayer(jeepMarker); } catch (e) {}
        jeepMarker = null;
      }
    }

    // Start/Stop driving button
    if (startDrivingBtn) {
      startDrivingBtn.addEventListener('click', () => {
        if (driverWatchId) {
          stopDriverTracking();
        } else {
          if (!ensureValidTokenOrRedirect()) return;
          startDriverTracking();
        }
      });
    }
  });
})();