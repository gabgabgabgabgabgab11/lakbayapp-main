// Enhanced login handler with validation (updated to use inline SVG eye toggle instead of Font Awesome)
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

  // Validation patterns
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Inline SVGs for eye icons
  const EYE_SVG_SMALL = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.47 12.39C3.98 7.86 7.61 5 12 5c4.39 0 8.02 2.86 9.53 7.39a1 1 0 0 1 0 .33C20.02 16.14 16.39 19 12 19c-4.39 0-8.02-2.86-9.53-7.39a1 1 0 0 1 0-.33z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const EYE_SLASH_SVG_SMALL = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.58 10.58A3 3 0 0 0 13.42 13.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.47 12.39C3.98 7.86 7.61 5 12 5c1.3 0 2.55.26 3.66.73" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.34 14.34C13.45 15.23 12.26 15.7 11 15.7c-1.3 0-2.55-.26-3.66-.73" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('login-title');
    const subEl = document.getElementById('login-sub');
    const form = document.getElementById('shared-login-form');
    const statusText = document.getElementById('status-text');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    // Adjust UI text depending on role
    if (role === 'driver') {
      titleEl.textContent = 'Driver Login';
      subEl.textContent = 'Sign in as a driver to start driving and share your location.';
    } else {
      titleEl.textContent = 'Commuter Login';
      subEl.textContent = 'Sign in to manage your trips.';
    }

    // Add password toggle eye button (inline SVG)
    const passwordWrapper = passwordInput.parentElement;
    if (!passwordWrapper.querySelector('.toggle-password')) {
      passwordWrapper.style.position = 'relative';
      
      const eyeBtn = document.createElement('button');
      eyeBtn.type = 'button';
      eyeBtn.className = 'toggle-password';
      eyeBtn.setAttribute('aria-label', 'Toggle password visibility');
      eyeBtn.style.position = 'absolute';
      // place the button inside the input wrapper with a consistent inset
      eyeBtn.style.right = '12px';
      eyeBtn.style.top = '50%';
      eyeBtn.style.transform = 'translateY(-50%)';
      eyeBtn.style.cursor = 'pointer';
      eyeBtn.style.background = 'transparent';
      eyeBtn.style.border = 'none';
      eyeBtn.style.color = 'rgba(255,255,255,0.95)';
      eyeBtn.style.fontSize = '1.1rem';
      eyeBtn.style.width = '36px';
      eyeBtn.style.height = '36px';
      eyeBtn.style.display = 'flex';
      eyeBtn.style.alignItems = 'center';
      eyeBtn.style.justifyContent = 'center';
      eyeBtn.style.padding = '0';
      eyeBtn.style.zIndex = '3';
      eyeBtn.innerHTML = EYE_SVG_SMALL;
      eyeBtn.dataset.state = 'hidden';
      
      // ensure input has enough right padding so the button doesn't overlap the text
      const pad = '46px';
      passwordInput.style.paddingRight = pad;
      passwordInput.style.setProperty('padding-right', pad, 'important');
      passwordWrapper.appendChild(eyeBtn);
      
      eyeBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
          passwordInput.type = 'text';
          eyeBtn.innerHTML = EYE_SLASH_SVG_SMALL;
          eyeBtn.dataset.state = 'visible';
        } else {
          passwordInput.type = 'password';
          eyeBtn.innerHTML = EYE_SVG_SMALL;
          eyeBtn.dataset.state = 'hidden';
        }
      });
    }

    // Real-time email validation
    emailInput.addEventListener('blur', () => {
      const value = emailInput.value.trim();
      if (value && !emailPattern.test(value)) {
        emailInput.style.borderColor = '#ff4444';
        statusText.textContent = 'Please enter a valid email address';
        statusText.style.color = '#ff4444';
      } else {
        emailInput.style.borderColor = '';
        if (statusText.textContent.includes('email')) {
          statusText.textContent = '';
        }
      }
    });

    // Clear error on input
    emailInput.addEventListener('input', () => {
      emailInput.style.borderColor = '';
      if (statusText.textContent.includes('email')) {
        statusText.textContent = '';
      }
    });

    passwordInput.addEventListener('input', () => {
      passwordInput.style.borderColor = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();

      // Reset styles
      emailInput.style.borderColor = '';
      passwordInput.style.borderColor = '';
      statusText.textContent = '';

      // Validate email
      if (!email) {
        emailInput.style.borderColor = '#ff4444';
        statusText.textContent = 'Email is required';
        statusText.style.color = '#ff4444';
        emailInput.focus();
        return;
      }

      if (!emailPattern.test(email)) {
        emailInput.style.borderColor = '#ff4444';
        statusText.textContent = 'Please enter a valid email address';
        statusText.style.color = '#ff4444';
        emailInput.focus();
        return;
      }

      // Validate password
      if (!password) {
        passwordInput.style.borderColor = '#ff4444';
        statusText.textContent = 'Password is required';
        statusText.style.color = '#ff4444';
        passwordInput.focus();
        return;
      }

      if (password.length < 8) {
        passwordInput.style.borderColor = '#ff4444';
        statusText.textContent = 'Password must be at least 8 characters';
        statusText.style.color = '#ff4444';
        passwordInput.focus();
        return;
      }

      statusText.textContent = 'Authenticating...';
      statusText.style.color = 'white';

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
        
        if (!res.ok) {
          const msg = (data && data.message) ? data.message : (res.statusText || 'Login failed');
          statusText.textContent = '✗ ' + msg;
          statusText.style.color = '#ff4444';
          
          // Highlight fields on error
          emailInput.style.borderColor = '#ff4444';
          passwordInput.style.borderColor = '#ff4444';
          return;
        }

        // Success: expect the API to return a JWT token
        const token = data && (data.token || data.jwt || data.accessToken || data.access_token);
        const driverId = data && (data.driverId || data.id || data.userId || data.driver_id);
        const apiBase = data && (data.apiBase || data.api_base);

        if (!token) {
          statusText.textContent = '✗ Login succeeded but no token returned from server.';
          statusText.style.color = '#ff4444';
          return;
        }

        // store tokens/ids
        if (role === 'driver') {
          localStorage.setItem('driverToken', token);
          localStorage.setItem('driver_token', token);
          if (driverId) localStorage.setItem('driverId', String(driverId));
          if (apiBase) localStorage.setItem('driver_api_base', apiBase);
        } else {
          localStorage.setItem('commuter_token', token);
          if (data && data.userId) localStorage.setItem('commuter_id', String(data.userId));
        }

        statusText.textContent = '✓ Login successful! Redirecting...';
        statusText.style.color = '#4caf50';

        setTimeout(() => { 
          window.location.href = redirectTo[role] || redirectTo.commuter; 
        }, 900);
      } catch (err) {
        console.error('Login error', err);
        statusText.textContent = '✗ Server error. Please try again later.';
        statusText.style.color = '#ff4444';
      }
    });
  });
})();