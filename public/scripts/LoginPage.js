// Shared login handler for commuter and driver.
// Reads ?role=driver or ?role=commuter from URL and posts to the correct endpoint.
// Saves tokens and redirects to the appropriate homepage.

(() => {
  // Helper: read query param
  function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  // Choose endpoints by role
  const role = (getQueryParam('role') || 'commuter').toLowerCase();
  const endpoints = {
    commuter: '/api/login/commuter',
    driver: '/api/login/driver'
  };

  const redirectTo = {
    commuter: '/CommuterHomepage.html',
    driver: '/DriverHomepage.html'
  };

  document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('login-title');
    const subEl = document.getElementById('login-sub');
    const form = document.getElementById('shared-login-form');
    const statusText = document.getElementById('status-text');

    // Adjust UI text depending on role
    if (role === 'driver') {
      titleEl.textContent = 'Driver Login';
      subEl.textContent = 'Sign in as a driver to start driving and share your location.';
    } else {
      titleEl.textContent = 'Commuter Login';
      subEl.textContent = 'Sign in to manage your trips.';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusText.textContent = 'Authenticating...';
      statusText.style.color = 'white';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();

      if (!email || !password) {
        statusText.textContent = 'Please enter your credentials.';
        statusText.style.color = '#ff4f4f';
        return;
      }

      // pick endpoint based on role
      const endpoint = endpoints[role] || endpoints.commuter;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        // try safe parsing
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        console.log('API Response:', data);
        if (!res.ok) {
          const msg = (data && data.message) ? data.message : (res.statusText || 'Login failed');
          statusText.textContent = msg;
          statusText.style.color = '#ff4f4f';
          return;
        }

        // Success: expect the API to return a JWT token and possibly driverId
        const token = data && (data.token || data.jwt || data.accessToken || data.access_token);
        const driverId = data && (data.driverId || data.id || data.userId || data.driver_id);
        const apiBase = data && (data.apiBase || data.api_base);

        if (!token) {
          statusText.textContent = 'Login succeeded but no token returned from server.';
          statusText.style.color = '#ff4f4f';
          return;
        }

        // store tokens/ids for both commuter and driver flows
        if (role === 'driver') {
          // store under both key conventions for compatibility
          localStorage.setItem('driverToken', token);
          localStorage.setItem('driver_token', token);
          if (driverId) localStorage.setItem('driverId', String(driverId));
          if (apiBase) localStorage.setItem('driver_api_base', apiBase);
        } else {
          // commuter
          localStorage.setItem('commuter_token', token);
          if (data && data.userId) localStorage.setItem('commuter_id', String(data.userId));
        }

        statusText.textContent = 'Login successful! Redirecting...';
        statusText.style.color = '#4caf50';

        // If running inside native Capacitor app, set native prefs for driver (best-effort)
        if (role === 'driver' && window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
          (async () => {
            try {
              const Plugins = (window.Capacitor && window.Capacitor.Plugins) || (await import('@capacitor/core')).Plugins;
              const BackgroundLocation = Plugins.BackgroundLocation;
              if (BackgroundLocation && BackgroundLocation.setAuth) {
                await BackgroundLocation.setAuth({ token, driverId: String(driverId || '') });
                if (apiBase) await BackgroundLocation.setApiBase({ apiBase });
                // optional: do not auto-start service here if you prefer explicit Start Driving
                // await BackgroundLocation.startService();
                console.log('Native plugin: saved auth for driver');
              }
            } catch (err) {
              console.warn('Native plugin setAuth failed', err);
            }
          })();
        }

        // If in the browser but you included WebLocationTracker, start tracking for driver fallback
        if (role === 'driver' && typeof WebLocationTracker !== 'undefined' && WebLocationTracker.startWebTracking) {
          try {
            await WebLocationTracker.startWebTracking(token, driverId || '', apiBase || window.location.origin);
            console.log('WebLocationTracker started (browser fallback)');
          } catch (e) {
            console.warn('WebLocationTracker start failed', e);
          }
        }

        setTimeout(() => { window.location.href = redirectTo[role] || redirectTo.commuter; }, 900);
      } catch (err) {
        console.error('Login error', err);
        statusText.textContent = 'Server error. Please try again later.';
        statusText.style.color = '#ff4f4f';
      }
    });
  });
})();