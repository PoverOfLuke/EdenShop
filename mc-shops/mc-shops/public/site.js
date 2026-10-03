/*
 * EdenShop — tiny site-wide script, loaded synchronously from <head>.
 * It is a plain same-origin file (not inline) so the Content-Security-Policy
 * can stay `script-src 'self'` without 'unsafe-inline'.
 *
 * 1. Theme: applies the saved theme BEFORE the page paints (no flash) and
 *    handles every [data-theme-toggle] button.
 * 2. Item images: hides an <img class="item-icon"> that fails to load and
 *    marks its wrapper as "missing". This replaces the old inline onerror="…"
 *    attributes, which a strict CSP blocks.
 */
(function () {
  var KEY = 'edenshop-theme';
  var root = document.documentElement;

  function readSaved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null; // storage blocked (private mode, etc.) -> just use the default
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var next = theme === 'dark' ? 'light' : 'dark';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-label', 'Switch to ' + next + ' theme');
      buttons[i].setAttribute('title', 'Switch to ' + next + ' theme');
    }
  }

  // Default is the original dark look; a saved choice always wins.
  applyTheme(readSaved() || 'dark');
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(root.getAttribute('data-theme') || 'dark');
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('[data-theme-toggle]')) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* not persisted, still applied */ }
  });

  // 'error' events do not bubble, but they can be caught in the capture phase.
  document.addEventListener(
    'error',
    function (event) {
      var el = event.target;
      if (!(el instanceof HTMLImageElement) || !el.classList.contains('item-icon')) return;
      el.style.display = 'none';
      if (el.parentElement) el.parentElement.classList.add('item-icon-wrap--missing');
    },
    true
  );
})();
