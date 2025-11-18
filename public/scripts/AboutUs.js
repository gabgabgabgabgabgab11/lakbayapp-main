/* About Us page JS: attach click handler for logo (removed inline onclick) */
document.addEventListener('DOMContentLoaded', function () {
  const logo = document.getElementById('logo-heading');
  if (logo) {
    logo.addEventListener('click', function () {
      window.location.href = 'LandingPage.html';
    });
    logo.style.cursor = 'pointer';
  }
});
