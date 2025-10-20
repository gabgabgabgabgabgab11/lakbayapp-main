const API_BASE = (() => {
  const origin = window.location.origin;
  return origin.includes('ngrok') || origin.startsWith('http') ? origin : 'http://localhost:3000';
})();
const POLL_INTERVAL = 2000;
const JEEPNEY_TIMEOUT = 10000;
