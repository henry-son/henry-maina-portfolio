/**
 * router.js — minimal hash-based router for a static multi-section site.
 *
 * Routes map to partial HTML files in /routes/*.html. Each partial contains
 * one or more <div class="wrap">...</div> blocks (no outer <section> wrapper —
 * the router supplies that), so partials are reusable fragments rather than
 * full documents.
 *
 * No build step, no framework — works from a plain static file server.
 */

const Router = (() => {
  const ROUTES = {
    'about':      { title: 'About',      file: 'routes/about.html' },
    'profile':    { title: 'Profile',    file: 'routes/profile.html' },
    'ventures':   { title: 'Ventures',   file: 'routes/ventures.html' },
    'software':   { title: 'Software',   file: 'routes/software.html' },
    'leadership': { title: 'Leadership', file: 'routes/leadership.html' },
    'writing':    { title: 'Writing',    file: 'routes/writing.html' },
    'contact':    { title: 'Contact',    file: 'routes/contact.html' },
  };
  const DEFAULT_ROUTE = 'about';
  const SITE_TITLE = 'Henry Maina';

  const cache = new Map();
  const appEl = () => document.getElementById('app');

  function parseHash() {
    // expects "#/about" -> "about"; falls back to default on empty/unknown
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    return raw || DEFAULT_ROUTE;
  }

  function setActiveNav(routeId) {
    document.querySelectorAll('[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === routeId);
    });
  }

  function showLoading() {
    const el = appEl();
    el.innerHTML = '<div class="route-loading"><div class="route-loading-spinner"></div></div>';
  }

  function show404(routeId) {
    appEl().innerHTML = `
      <div class="route-404">
        <h2>Section not found</h2>
        <p>"${routeId}" isn't a page on this site.</p>
        <a href="#/about" class="btn btn-primary" data-link>Back to About</a>
      </div>`;
  }

  async function loadRoute(routeId, { scrollTop = true } = {}) {
    const route = ROUTES[routeId];
    if (!route) {
      show404(routeId);
      setActiveNav(null);
      return;
    }

    setActiveNav(routeId);
    document.title = `${route.title} — ${SITE_TITLE}`;

    // Close mobile menu if open (defined in main.js, guarded here)
    if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();

    try {
      let html = cache.get(routeId);
      if (!html) {
        showLoading();
        const res = await fetch(route.file, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load ${route.file}: ${res.status}`);
        html = await res.text();
        cache.set(routeId, html);
      }

      const section = document.createElement('section');
      section.className = 'route-content';
      section.id = `route-${routeId}`;
      section.innerHTML = html;

      appEl().innerHTML = '';
      appEl().appendChild(section);

      if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

      // Let other scripts (main.js) know a new route is in the DOM so they
      // can (re)bind reveal-on-scroll, counters, tabs, filters, etc.
      document.dispatchEvent(new CustomEvent('route:loaded', { detail: { routeId } }));
    } catch (err) {
      console.error(err);
      appEl().innerHTML = `
        <div class="route-404">
          <h2>Couldn't load this section</h2>
          <p>There was a problem loading "${route.title}". Check your connection and try again.</p>
          <a href="#/about" class="btn btn-primary" data-link>Back to About</a>
        </div>`;
    }
  }

  function onHashChange() {
    loadRoute(parseHash());
  }

  function init() {
    // Intercept clicks on any [data-link] element to keep behavior consistent
    // (not strictly required for #/ links, but future-proofs plain href usage)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-link]');
      if (!link) return;
      // allow modifier-clicks (new tab) to behave natively
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // hash links handled by onHashChange via the hashchange event naturally
    });

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('DOMContentLoaded', () => {
      if (!window.location.hash) {
        window.location.hash = `#/${DEFAULT_ROUTE}`;
      } else {
        onHashChange();
      }
    });
  }

  return { init, loadRoute, parseHash, ROUTES };
})();

Router.init();
