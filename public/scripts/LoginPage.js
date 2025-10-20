document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('commuter-login-form');
  const statusText = document.getElementById('status-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    statusText.textContent = 'Authenticating...';
    statusText.style.color = 'white';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const res = await fetch('/api/login/commuter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        statusText.textContent = 'Login successful! Redirecting...';
        statusText.style.color = '#4caf50';
        setTimeout(() => (window.location.href = '/CommuterHomepage.html'), 1500);
      } else {
        statusText.textContent = data.message || 'Invalid credentials. Please try again.';
        statusText.style.color = '#ff4f4f';
      }
    } catch (err) {
      console.error(err);
      statusText.textContent = 'Server error. Please try again later.';
      statusText.style.color = '#ff4f4f';
    }
  });
});
