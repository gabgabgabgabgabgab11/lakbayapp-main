

(function () {
  'use strict';

  const TOP_Z = 2147483647;         // max 32-bit signed int
  const BACKDROP_Z = TOP_Z - 1;
  const CSS_ID = 'lakby-burger-topmost-style-v2';
  const BTN_CLASS = 'lakby-burger-btn-topmost';
  const NAV_CLASS = 'lakby-mobile-nav-topmost';
  const BACKDROP_CLASS = 'lakby-menu-backdrop-topmost';

  // Inject CSS with !important on z-index and pointer-events
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    const css = `
.${BTN_CLASS} {
  position: fixed !important;
  top: 12px !important;
  left: 12px !important;
  z-index: ${TOP_Z} !important;
  width: 48px !important;
  height: 48px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(255,255,255,0.98) !important;
  border-radius: 10px !important;
  box-shadow: 0 6px 24px rgba(0,0,0,0.28) !important;
  border: 0 !important;
  padding: 6px !important;
  cursor: pointer !important;
  pointer-events: auto !important;
  -webkit-tap-highlight-color: transparent !important;
  transform: translateZ(0) !important;
}
.${NAV_CLASS} {
  position: fixed !important;
  top: 68px !important;
  left: 12px !important;
  z-index: ${TOP_Z} !important;
  min-width: 220px !important;
  max-width: calc(100% - 24px) !important;
  background: #ffffff !important;
  border-radius: 10px !important;
  box-shadow: 0 12px 48px rgba(0,0,0,0.35) !important;
  padding: 8px !important;
  display: none !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch !important;
  pointer-events: auto !important;
  transform: translateZ(0) !important;
}
.${NAV_CLASS}.show { display: block !important; }
.${BACKDROP_CLASS} {
  position: fixed !important;
  inset: 0 !important;
  z-index: ${BACKDROP_Z} !important;
  background: rgba(0,0,0,0.12) !important;
  display: none !important;
  pointer-events: auto !important;
}
.${BACKDROP_CLASS}.show { display: block !important; }
`;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
  }

  // Create or find burger button; return element
  function getOrCreateBurger() {
    // Try common selectors first
    const selectors = ['#burger-btn', '.burger-btn', '.burger-toggle', '.hamburger', '.nav-toggle', '#nav-toggle'];
    for (const sel of selectors) {
      const found = document.querySelector(sel);
      if (found) {
        found.classList.add(BTN_CLASS);
        // ensure it's appended to body to maximize stacking context
        if (found.parentElement !== document.body) document.body.appendChild(found);
        // ensure style properties
        applyButtonAttributes(found);
        return found;
      }
    }

    // If not found, create a new one (idempotent)
    let btn = document.querySelector('.' + BTN_CLASS);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = BTN_CLASS;
      btn.id = 'burger-btn';
      btn.setAttribute('aria-label', 'Open menu');
      btn.innerHTML = '&#9776;'; // hamburger glyph
      document.body.appendChild(btn);
    } else {
      // re-append to body
      if (btn.parentElement !== document.body) document.body.appendChild(btn);
    }
    applyButtonAttributes(btn);
    return btn;
  }

  function applyButtonAttributes(btn) {
    try {
      btn.style.zIndex = String(TOP_Z);
      btn.style.pointerEvents = 'auto';
      btn.style.position = 'fixed';
      btn.setAttribute('aria-haspopup', 'true');
    } catch (e) { /* ignore */ }
  }

  // Create or find nav container; return element
  function getOrCreateNav() {
    const navSelectors = ['.nav-links', '.menu', '.nav', '#nav', '.site-nav', '.main-nav'];
    for (const sel of navSelectors) {
      const found = document.querySelector(sel);
      if (found) {
        found.classList.add(NAV_CLASS);
        if (found.parentElement !== document.body) document.body.appendChild(found);
        applyNavAttributes(found);
        return found;
      }
    }

    // fallback: create minimal nav
    let nav = document.querySelector('.' + NAV_CLASS);
    if (!nav) {
      nav = document.createElement('div');
      nav.className = NAV_CLASS;
      nav.innerHTML = `
        <a href="/" style="display:block;padding:10px 12px">Home</a>
        <a href="/routes" style="display:block;padding:10px 12px">Routes</a>
        <a href="/saved" style="display:block;padding:10px 12px">Saved Trips</a>
        <a href="/help" style="display:block;padding:10px 12px">Help</a>
      `;
      document.body.appendChild(nav);
    } else {
      if (nav.parentElement !== document.body) document.body.appendChild(nav);
    }
    applyNavAttributes(nav);
    return nav;
  }

  function applyNavAttributes(nav) {
    try {
      nav.style.zIndex = String(TOP_Z);
      nav.style.pointerEvents = 'auto';
      nav.style.position = 'fixed';
    } catch (e) {}
  }

  // Backdrop
  function getOrCreateBackdrop() {
    let bd = document.querySelector('.' + BACKDROP_CLASS);
    if (!bd) {
      bd = document.createElement('div');
      bd.className = BACKDROP_CLASS;
      document.body.appendChild(bd);
    } else {
      if (bd.parentElement !== document.body) document.body.appendChild(bd);
    }
    bd.style.zIndex = String(BACKDROP_Z);
    return bd;
  }

  // Toggle handlers
  function attachBehavior(burger, nav, backdrop) {
    if (burger._lakby_topmost_inited) return;
    burger._lakby_topmost_inited = true;

    burger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      const open = nav.classList.contains('show');
      if (open) {
        nav.classList.remove('show');
        backdrop.classList.remove('show');
        burger.setAttribute('aria-expanded', 'false');
        restoreMapPointerEvents();
      } else {
        nav.classList.add('show');
        backdrop.classList.add('show');
        burger.setAttribute('aria-expanded', 'true');
        // disable map pointer events so the map doesn't intercept swipes/scrolls under the menu
        disableMapPointerEvents();
      }
    }, { passive: false });

    backdrop.addEventListener('click', function () {
      nav.classList.remove('show');
      backdrop.classList.remove('show');
      restoreMapPointerEvents();
      burger.setAttribute('aria-expanded', 'false');
    });

    // close on escape
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        if (nav.classList.contains('show')) {
          nav.classList.remove('show');
          backdrop.classList.remove('show');
          restoreMapPointerEvents();
          burger.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // ensure menu is appended to body (highest stacking context)
    if (nav.parentElement !== document.body) document.body.appendChild(nav);
    if (burger.parentElement !== document.body) document.body.appendChild(burger);
    if (backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
  }

  // Disable map pointer events while menu open
  function disableMapPointerEvents() {
    try {
      const mapEl = document.querySelector('.leaflet-container') || document.getElementById('map');
      if (!mapEl) return;
      // store previous pointer-events
      if (!mapEl.hasAttribute('data-lakby-pointer-saved')) {
        mapEl.setAttribute('data-lakby-pointer-saved', mapEl.style.pointerEvents || '');
      }
      mapEl.style.pointerEvents = 'none';
    } catch (e) { console.error(e); }
  }
  function restoreMapPointerEvents() {
    try {
      const mapEl = document.querySelector('.leaflet-container') || document.getElementById('map');
      if (!mapEl) return;
      const prev = mapEl.getAttribute('data-lakby-pointer-saved');
      if (prev !== null) {
        mapEl.style.pointerEvents = prev;
        mapEl.removeAttribute('data-lakby-pointer-saved');
      } else {
        mapEl.style.pointerEvents = '';
      }
    } catch (e) {}
  }

  // Re-apply styles & re-attach if framework overwrites nodes (robustness)
  function ensureTopmostRepeat(burger, nav, backdrop) {
    try {
      applyButtonAttributes(burger);
      applyNavAttributes(nav);
      backdrop.style.zIndex = String(BACKDROP_Z);
      // re-append to body as last child to ensure they're on top of other elements that might have same z-index
      if (nav.parentElement !== document.body) document.body.appendChild(nav);
      if (burger.parentElement !== document.body) document.body.appendChild(burger);
      if (backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
    } catch (e) { console.error(e); }
  }

  // Observe mutations to re-apply when SPA re-renders remove/replace nodes
  function observeAndHeal(selectors, callback) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
          try { callback(); } catch (e) {}
        }
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // also interval fallback
    const handle = setInterval(callback, 2000);
    return () => { observer.disconnect(); clearInterval(handle); };
  }

  // Public init: idempotent
  function init() {
    try {
      injectCss();
      const burger = getOrCreateBurger();
      const nav = getOrCreateNav();
      const backdrop = getOrCreateBackdrop();
      attachBehavior(burger, nav, backdrop);
      ensureTopmostRepeat(burger, nav, backdrop);
      // keep healing in case app framework replaces nodes
      observeAndHeal(['body'], () => ensureTopmostRepeat(burger, nav, backdrop));
    } catch (e) {
      console.error('lakby-burger-topmost init error', e);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // expose for debugging
  window._LAKBY_INIT_BURGER_TOPMOST = init;

})();