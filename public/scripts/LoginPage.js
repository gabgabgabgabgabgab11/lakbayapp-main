// Enhanced login handler with validation
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

    // Add password toggle eye icon
    const passwordWrapper = passwordInput.parentElement;
    if (!passwordWrapper.querySelector('.toggle-password')) {
      passwordWrapper.style.position = 'relative';
      
      const eyeIcon = document.createElement('i');
      eyeIcon.className = 'fas fa-eye toggle-password';
      eyeIcon.style.position = 'absolute';
      eyeIcon.style.right = '12px';
      eyeIcon.style.top = '70%';
      eyeIcon.style.transform = 'translateY(-50%)';
      eyeIcon.style.cursor = 'pointer';
      eyeIcon.style.color = 'rgba(255, 255, 255, 0.6)';
      eyeIcon.style.fontSize = '1.1rem';
      
      passwordInput.style.paddingRight = '45px';
      passwordWrapper.appendChild(eyeIcon);
      
      eyeIcon.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
          passwordInput.type = 'text';
          eyeIcon.classList.remove('fa-eye');
          eyeIcon.classList.add('fa-eye-slash');
        } else {
          passwordInput.type = 'password';
          eyeIcon.classList.remove('fa-eye-slash');
          eyeIcon.classList.add('fa-eye');
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