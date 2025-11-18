/* WhatIsLakbay page JS: handle header logo and CTA register buttons */
document.addEventListener('DOMContentLoaded', function () {
  const logo = document.getElementById('logo-heading');
  if (logo) {
    logo.addEventListener('click', function () {
      window.location.href = 'LandingPage.html';
    });
    logo.style.cursor = 'pointer';
  }

  const navigateToRegister = (role) => {
    const url = 'RegistrationPage.html' + (role ? ('?role=' + encodeURIComponent(role)) : '');
    window.location.href = url;
  };

  const commuterBtn = document.querySelector('button[data-role="commuter"]');
  const driverBtn = document.querySelector('button[data-role="driver"]');

  if (commuterBtn) commuterBtn.addEventListener('click', () => navigateToRegister('commuter'));
  if (driverBtn) driverBtn.addEventListener('click', () => navigateToRegister('driver'));
});
