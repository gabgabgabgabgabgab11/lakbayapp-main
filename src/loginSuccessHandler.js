
async function onLoginSuccess(loginResponse) {
  const token = loginResponse.token;
  const driverId = String(loginResponse.driverId ?? loginResponse.userId ?? '');
  const apiBase = loginResponse.apiBase || 'https://hastily-quantal-giovani.ngrok-free.dev';

  if (!token || !driverId) {
    console.error('Missing token or driverId in login response', loginResponse);
    return;
  }

  // small helper to check token expiry client-side
  function isTokenExpired(t) {
    try {
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload && payload.exp && (payload.exp * 1000) < Date.now();
    } catch (e) {
      // if we can't parse, assume not expired (server will reject if it is)
      return false;
    }
  }

  if (isTokenExpired(token)) {
    alert('Received token is expired. Please log in again.');
    return;
  }

  // Detect native Capacitor environment
  const isNative = typeof window.Capacitor !== 'undefined' &&
                   typeof Capacitor.isNativePlatform === 'function' &&
                   Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Prefer global Plugins if available; fallback to dynamic import if needed
      const Plugins = (window.Capacitor && window.Capacitor.Plugins) || (await import('@capacitor/core')).Plugins;
      const BackgroundLocation = Plugins.BackgroundLocation;

      if (!BackgroundLocation) {
        throw new Error('BackgroundLocation plugin not available');
      }

      // Save auth + driverId natively
      await BackgroundLocation.setAuth({ token, driverId: String(driverId) });
      // Save API base so native service posts to the right host
      await BackgroundLocation.setApiBase({ apiBase });
      // Start the native foreground service
      await BackgroundLocation.startService();

      console.log('Native background location configured and service started');
    } catch (err) {
      console.error('Failed to configure native background location:', err);
      // fallback: attempt to start web tracking so testers still send locations while tab is open
      try {
        if (typeof WebLocationTracker !== 'undefined') {
          await WebLocationTracker.startWebTracking(token, driverId, apiBase);
          console.log('Fell back to WebLocationTracker after native error');
        } else {
          console.warn('WebLocationTracker not found; include it for browser fallback.');
        }
      } catch (werr) {
        console.error('Fallback WebLocationTracker failed', werr);
      }
    }
  } else {
    // Browser path (Chrome): start the JS tracker (must keep tab open / optionally use WakeLock)
    try {
      if (typeof WebLocationTracker === 'undefined') {
        console.warn('WebLocationTracker missing. Add public/scripts/webLocationTracker.js as provided.');
      } else {
        await WebLocationTracker.startWebTracking(token, driverId, apiBase);
        console.log('WebLocationTracker started (browser). Instruct testers to keep the tab open and allow location.');
      }
    } catch (err) {
      console.error('Failed to start WebLocationTracker:', err);
    }
  }
}

// Example: call this when login succeeds (replace with your real login result)
 // onLoginSuccess({ token: '<JWT_HERE>', driverId: '42', apiBase: 'https://abcd1234.ngrok-free.dev' });