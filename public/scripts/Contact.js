/* Contact page JavaScript moved from inline <script> in Contact.html */
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Get form values
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value.trim();

    // Basic JS validation (complements HTML attributes)
    const emailRe = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    const phoneRe = /^\+?[0-9\s\-]{7,15}$/;

    if (!name) {
      alert('Please enter your full name.');
      document.getElementById('name').focus();
      return;
    }

    if (!emailRe.test(email)) {
      alert('Please enter a valid email address.');
      document.getElementById('email').focus();
      return;
    }

    if (phone && !phoneRe.test(phone)) {
      alert('Please enter a valid phone number (digits only, may include +, spaces or -).');
      document.getElementById('phone').focus();
      return;
    }

    if (!subject) {
      alert('Please select a subject/topic.');
      document.getElementById('subject').focus();
      return;
    }

    if (!message) {
      alert('Please enter a message.');
      document.getElementById('message').focus();
      return;
    }

    const formData = { name, email, phone, subject, message };

    // Here you would normally send this to your backend
    console.log('Form submitted:', formData);

    // Show success message
    alert('Thank you for contacting us! We will get back to you soon.');

    // Reset form
    this.reset();
    // restore the placeholder selection state
    document.getElementById('subject').selectedIndex = 0;
  });

  // Sanitize phone input to remove letters as user types or pastes
  const phoneInput = document.getElementById('phone');
  if (phoneInput) {
    const sanitize = (el) => {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      // allow digits, +, spaces and dashes
      el.value = el.value.replace(/[^0-9+\s\-]/g, '');
      // restore caret (best-effort)
      try { el.setSelectionRange(start, end); } catch (e) {}
    };

    phoneInput.addEventListener('input', function () { sanitize(this); });
    phoneInput.addEventListener('paste', function (ev) {
      // sanitize pasted text
      ev.preventDefault();
      const text = (ev.clipboardData || window.clipboardData).getData('text').replace(/[^0-9+\s\-]/g, '');
      const start = this.selectionStart || 0;
      const before = this.value.slice(0, start);
      const after = this.value.slice(this.selectionEnd || 0);
      this.value = before + text + after;
    });
  }
});
