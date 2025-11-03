// webLocationTracker.js
// Web fallback location tracker for Chrome/mobile browsers.
// - Use this when running in a browser (not the native app).
// - Tracks while the page/tab is open and optionally requests a Screen Wake Lock.
// - Throttles posts and uses fetch keepalive for unload attempts.
// Place at: public/scripts/webLocationTracker.js

const WebLocationTracker = (function () {
  let watchId = null;
  let lastPosition = null;
  let posting = false;
  let throttleMs = 2000; // min ms between server posts
  let lastPostAt = 0;
  let apiBase = null;
  let token = null;
  let driverId = null;
  let wakeLock = null;
  let heartbeatTimer = null;

  // Start tracking: token = JWT, id = driverId, _apiBase = https://your-ngrok-url
  async function startWebTracking(_token, _driverId, _apiBase, options = {}) {
    token = _token;
    driverId = String(_driverId || '');
    apiBase = (_apiBase || '').replace(/\/+$/, '');

    if (!('geolocation' in navigator)) throw new Error('Geolocation not supported');

    if (options.throttleMs != null) throttleMs = options.throttleMs;

    // try to request a wake lock (optional). This keeps the screen on while tracking.
    try {
      await requestWakeLock();
    } catch (e) {
      console.warn('WakeLock request failed (not critical):', e);
    }

    // start watchPosition
    watchId = navigator.geolocation.watchPosition(
      positionSuccess,
      positionError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );

    // heartbeat sends lastPosition periodically in case position callbacks are temporarily throttled
    heartbeatTimer = setInterval(() => {
      if (lastPosition && Date.now() - lastPostAt >= throttleMs) {
        sendLocation(lastPosition.coords.latitude, lastPosition.coords.longitude, lastPosition.timestamp);
      }
    }, options.heartbeatMs || 5000);

    // handle visibility to warn or adapt
    document.addEventListener('visibilitychange', onVisibilityChange);

    console.log('WebLocationTracker started', { driverId, apiBase, watchId });
  }

  function stopWebTracking() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    releaseWakeLock();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    token = null; driverId = null; apiBase = null; lastPosition = null;
    console.log('WebLocationTracker stopped');
  }

  function positionSuccess(pos) {
    lastPosition = pos;
    const now = Date.now();
    if (now - lastPostAt >= throttleMs) {
      lastPostAt = now;
      sendLocation(pos.coords.latitude, pos.coords.longitude, pos.timestamp);
    }
  }

  function positionError(err) {
    console.warn('watchPosition error', err);
    if (err.code === 1) { // PERMISSION_DENIED
      alert('Location permission denied. Please allow location to send updates.');
    }
  }

  async function sendLocation(lat, lng, timestamp) {
    if (!apiBase || !token || !driverId) {
      console.warn('Missing apiBase/token/driverId, skipping send');
      return;
    }
    if (posting) return; // simple concurrency guard
    posting = true;

    const url = `${apiBase}/api/jeepney-location`;
    const body = {
      driverId: isNaN(Number(driverId)) ? driverId : Number(driverId),
      lat,
      lng,
      timestamp: timestamp || Date.now()
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
        keepalive: true // helps during unload but limited size
      });

      if (!res.ok) {
        if (res.status === 401) {
          console.warn('Server returned 401 — token may be expired. Please re-login.');
          // Optionally emit a custom event so UI can handle re-login
          dispatchEvent(new CustomEvent('webtracker:auth-failed', { detail: { status: 401 } }));
        } else {
          console.warn('Location post failed', res.status, await safeText(res));
        }
      } else {
        // Success - optionally dispatch an event
        dispatchEvent(new CustomEvent('webtracker:posted', { detail: { lat, lng } }));
      }
    } catch (e) {
      console.warn('Network/post error:', e);
    } finally {
      posting = false;
    }
  }

  async function safeText(res) {
    try { return await res.text(); } catch (e) { return '<no body>'; }
  }

  // Screen Wake Lock (keeps screen ON) - mobile behavior varies.
  async function requestWakeLock() {
    if ('wakeLock' in navigator && !wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; console.log('WakeLock released'); });
        console.log('WakeLock acquired');
      } catch (e) {
        console.warn('WakeLock request failed', e);
        throw e;
      }
    }
  }
  async function releaseWakeLock() {
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { console.warn('WakeLock release failed', e); }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      console.log('Page hidden — browser may throttle location updates. Keep tab visible for continuous tracking.');
      dispatchEvent(new CustomEvent('webtracker:hidden'));
    } else {
      dispatchEvent(new CustomEvent('webtracker:visible'));
    }
  }

  return {
    startWebTracking,
    stopWebTracking
  };
})();