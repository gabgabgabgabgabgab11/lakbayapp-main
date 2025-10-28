(function() {
  try {
    // Adjust the target page filename if yours is different
    window.location.replace('LandingPage.html');
  } catch (e) {
    // Fallback: if something prevents navigation, show a link
    var p = document.createElement('p');
    p.textContent = 'Click to open app: ';
    var a = document.createElement('a');
    a.href = 'LandingPage.html';
    a.textContent = 'Open Landing page';
    p.appendChild(a);
    document.body.appendChild(p);
    console.error('Redirect failed', e);
  }
})();