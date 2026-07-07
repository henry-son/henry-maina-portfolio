/**
 * main.js — site-wide chrome (theme, mobile menu, resume buttons) plus
 * per-route feature initializers. Route-scoped features (skill tabs,
 * insights filtering, contact form, counters, reveals) are re-bound every
 * time the router injects new content, since that content doesn't exist
 * in the DOM until its route loads.
 */

/* ============================================================
   GLOBAL HELPERS — must be declared before any IIFE or handler
   ============================================================ */

function resumeClick(e) {
  e.preventDefault();
  alert('Add your CV PDF link here — replace the href on the Download CV buttons once you have a file to link to.');
}

/* ============================================================
   SITE-WIDE CHROME — runs once, persists across route changes
   ============================================================ */

/* ---------- Theme toggle (light default, persisted) ---------- */
(function () {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('hm-theme');
  if (saved === 'dark') {
    root.setAttribute('data-theme', 'dark');
    toggle.textContent = '☀';
  }
  toggle.addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    toggle.textContent = isDark ? '◐' : '☀';
    localStorage.setItem('hm-theme', isDark ? 'light' : 'dark');
  });
})();

/* ---------- Mobile menu ---------- */
(function () {
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  if (!menuToggle || !mobileMenu) return;

  function close() {
    mobileMenu.classList.remove('open');
    menuToggle.textContent = '☰';
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    const open = mobileMenu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.textContent = open ? '×' : '☰';
  }

  menuToggle.addEventListener('click', toggle);
  mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

  // exposed so router.js can close the menu on navigation
  window.closeMobileMenu = close;
})();

/* ---------- Resume button placeholder (header + mobile; hero button is per-route) ---------- */
['resumeBtnTop', 'resumeBtnMobile', 'resumeBtnSidebar'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', resumeClick);
});

/* ============================================================
   ROUTE-SCOPED FEATURES — re-bound on every route:loaded event
   ============================================================ */

function initRevealOnScroll(scope) {
  const revealEls = scope.querySelectorAll('.reveal');
  if (!revealEls.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
}

function initHeroDashCard(scope) {
  const card = scope.querySelector('#dashCard');
  if (!card) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );
  io.observe(card);
}

function initAnimatedCounters(scope) {
  const counters = scope.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute('data-count'), 10);
          if (reduceMotion) {
            el.textContent = target;
            io.unobserve(el);
            return;
          }
          const dur = 1100;
          const start = performance.now();
          function step(t) {
            const p = Math.min(1, (t - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(eased * target);
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.4 }
  );
  counters.forEach((el) => io.observe(el));
}

function initRotatingTitles(scope) {
  const titles = [
    'Statistician & Data Analyst',
    'Full-Stack Developer',
    'Data Science Practitioner',
    'Entrepreneur',
    'Applied Researcher',
    'Youth Leader',
  ];
  const track = scope.querySelector('#rotateTrack');
  if (!track) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  if (reduceMotion) {
    track.innerHTML = '<span>' + titles[0] + '</span>';
    return;
  }
  function show(idx) {
    track.style.transition = 'transform .5s cubic-bezier(.4,0,.2,1), opacity .4s ease';
    track.style.opacity = '0';
    track.style.transform = 'translateY(8px)';
    setTimeout(() => {
      track.innerHTML = '<span>' + titles[idx] + '</span>';
      track.style.transform = 'translateY(-8px)';
      requestAnimationFrame(() => {
        track.style.transform = 'translateY(0)';
        track.style.opacity = '1';
      });
    }, 380);
  }
  const intervalId = setInterval(() => {
    i = (i + 1) % titles.length;
    show(i);
  }, 2400);
  // stop the interval once the track leaves the DOM (route changed away)
  const watcher = new MutationObserver(() => {
    if (!document.body.contains(track)) {
      clearInterval(intervalId);
      watcher.disconnect();
    }
  });
  watcher.observe(document.getElementById('app'), { childList: true, subtree: true });
}

function initResumeHeroButton(scope) {
  const el = scope.querySelector('#resumeBtnHero');
  if (el) el.addEventListener('click', resumeClick);
}

function initSkillTabs(scope) {
  const tabs = scope.querySelectorAll('.skill-tab');
  const panels = scope.querySelectorAll('.skill-panel');
  if (!tabs.length) return;

  function animateBars(panel) {
    if (!panel) return;
    panel.querySelectorAll('.sb-fill').forEach((fill) => {
      const pct = fill.getAttribute('data-pct');
      fill.style.width = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => {
          fill.style.width = pct + '%';
        }, 30);
      });
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = scope.querySelector('#' + tab.dataset.panel);
      if (panel) panel.classList.add('active');
      animateBars(panel);
    });
  });

  const skillsAnchor = scope.querySelector('#skillTabs');
  if (!skillsAnchor) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateBars(scope.querySelector('.skill-panel.active'));
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );
  io.observe(skillsAnchor);
}

function initInsightsFiltering(scope) {
  const buttons = scope.querySelectorAll('#insightsFilterRow .filter-btn');
  const cards = scope.querySelectorAll('#insightsGrid .insight-card');
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      cards.forEach((card) => {
        const cat = card.dataset.cat;
        const show = filter === 'all' || cat === filter;
        card.style.display = show ? 'flex' : 'none';
      });
    });
  });
  
function initContactForm(scope) {
  const form = scope.querySelector('#contactForm');
  if (!form) return;

  // Re-render Turnstile widget after dynamic route injection
  if (window.turnstile) {
    window.turnstile.render('.cf-turnstile');
  }
}

  // Points to the Express server.
  // Override window.PORTFOLIO_API_URL before this script loads to change it.
  const API_URL = (window.PORTFOLIO_API_URL || 'http://localhost:3001') + '/api/contact';

  const submitBtn = form.querySelector('[type="submit"]');
  const formNote  = form.querySelector('.form-note');
  const fields    = ['name', 'email', 'subject', 'message'];

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((el) => el.remove());
    form.querySelectorAll('.input-error').forEach((el) => el.classList.remove('input-error'));
  }

  function showFieldError(fieldName, message) {
    const input = form.querySelector(`[name="${fieldName}"]`);
    if (!input) return;
    input.classList.add('input-error');
    const err = document.createElement('p');
    err.className = 'field-error';
    err.textContent = message;
    input.insertAdjacentElement('afterend', err);
  }

  function showFormError(message) {
    if (!formNote) return;
    formNote.textContent = message;
    formNote.className = 'form-note form-note--error';
  }

  function showSuccess(senderName) {
    const name = senderName || 'there';
    form.innerHTML = `
      <div class="form-success">
        <div class="form-success-icon">✓</div>
        <p class="form-success-eyebrow">Message received</p>
        <h3 class="form-success-title">Thank you, ${name}.</h3>
        <p class="form-success-body">
          Your message has been received and is in good hands.<br>
          A confirmation has been sent to your email — I'll be in touch within <strong>the shortest–time possible</strong>.
        </p>
        <div class="form-success-divider"></div>
        <p class="form-success-sub">In the meantime, feel free to explore more of my work.</p>
        <div class="form-success-actions">
          <a href="#/ventures" data-link class="btn btn-primary form-success-btn">View My Ventures →</a>
          <a href="#/software" data-link class="btn btn-ghost form-success-btn">See Software Projects</a>
        </div>
        <p class="form-success-signed">— Henry Maina, CEO · HM Analytics Agency</p>
      </div>`;

    /* re-bind the new data-link anchors so the router picks them up */
    form.querySelectorAll('[data-link]').forEach(el => {
      el.addEventListener('click', () => {
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const data = {};
fields.forEach((f) => {
  const el = form.querySelector(`[name="${f}"]`);
  if (el) data[f] = el.value.trim();
});

// Add Turnstile token
const turnstileEl = form.querySelector('[name="cf-turnstile-response"]');
data['cf-turnstile-response'] = turnstileEl ? turnstileEl.value : '';

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    if (formNote) { formNote.textContent = ''; formNote.className = 'form-note'; }

    try {
      const res  = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (res.ok && json.ok) {
        showSuccess(data.name);
        return;
      }
      if (res.status === 422 && json.errors) {
        Object.entries(json.errors).forEach(([field, msg]) => showFieldError(field, msg));
      } else if (res.status === 429) {
        showFormError(json.error || 'Too many attempts — please wait a few minutes.');
      } else {
        showFormError(json.error || 'Something went wrong. Please try again or email me directly.');
      }
    } catch (_err) {
      showFormError('Could not reach the server. Email mwangihenry622@gmail.com directly.');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  });
}

function initProjectFilters(scope) {
  // generic filter-row support outside Insights (kept for future routes that reuse the pattern)
  const rows = scope.querySelectorAll('.filter-row:not(#insightsFilterRow)');
  rows.forEach((row) => {
    const buttons = row.querySelectorAll('.filter-btn');
    const grid = row.nextElementSibling;
    if (!grid) return;
    const cards = grid.querySelectorAll('[data-cat]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        cards.forEach((card) => {
          const cat = card.dataset.cat;
          const show = filter === 'all' || cat === filter;
          card.style.display = show ? 'flex' : 'none';
        });
      });
    });
  });
}

/* ---------- Run all route-scoped initializers against the freshly loaded route ---------- */
document.addEventListener('route:loaded', (e) => {
  const scope = document.getElementById('app');
  if (!scope) return;

  initRevealOnScroll(scope);
  initHeroDashCard(scope);
  initAnimatedCounters(scope);
  initRotatingTitles(scope);
  initResumeHeroButton(scope);
  initSkillTabs(scope);
  initInsightsFiltering(scope);
  initProjectFilters(scope);
  initContactForm(scope);
});
