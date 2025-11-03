// Put this very early in DriverHomepage page load to force login first.
// It checks localStorage for driver_token and redirects to DriverLogin.html if missing or expired.

(function ensureDriverAuthenticated() {
  const token = localStorage.getItem('driver_token');
  if (!token) {
    // not logged in => force login page
    window.location.replace('DriverLogin.html');
    return;
  }
  // quick client-side JWT expiry check
  function isTokenExpired(t) {
    try {
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return payload && payload.exp && (payload.exp * 1000) < Date.now();
    } catch (e) {
      // if cannot parse assume not expired (server will reject if expired)
      return false;
    }
  }
  if (isTokenExpired(token)) {
    // clear and send to login
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_id');
    window.location.replace('DriverLogin.html');
    return;
  }
  // If token exists and valid-looking, we proceed. Optionally populate UI or check native plugin.
})();