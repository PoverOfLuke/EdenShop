/*
 * Login page behaviour (status messages + "already logged in" redirect).
 * Kept as a same-origin file instead of an inline <script> so the
 * Content-Security-Policy (script-src 'self') does not block it.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var status = params.get('status');
  var statusEl = document.getElementById('login-status');

  function show(message, cls) {
    statusEl.textContent = message;
    statusEl.classList.add(cls);
    statusEl.hidden = false;
  }

  if (statusEl && status === 'pending') {
    show('Your account is waiting for approval. You\u2019ll be able to log in once a server admin approves it.', 'login-status--pending');
  } else if (statusEl && status === 'rate_limited') {
    show('Too many login attempts. Please wait a minute and try again.', 'login-status--error');
  } else if (statusEl && status === 'error') {
    show('Something went wrong with Discord login. Please try again.', 'login-status--error');
  } else {
    // If already logged in, skip the login page entirely.
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (res) { if (res.ok) window.location.replace('/'); })
      .catch(function () {});
  }
})();
