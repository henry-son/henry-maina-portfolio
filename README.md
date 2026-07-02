# Henry Maina — Portfolio (Cover Page + Multi-Page SPA)

A two-part site: a landing/cover page, and a routed multi-section portfolio.
Clicking a nav link inside the portfolio updates the URL (`#/about`,
`#/profile`, etc.) and swaps in only that section's content — no full page
reload, no long scroll.

## Entry point

Open **`landing.html`** first — that's the cover page (photo, name, one-line
intro, "Enter Portfolio" button). It links to `index.html`, which is the
actual routed portfolio app.

## Project structure

```
landing.html         Cover page: photo, name, intro, "Enter Portfolio" button
index.html            App shell: header, nav, footer, and the #app mount point
css/
  style.css          Design tokens, components, layout (the design system)
  router.css         Router-specific UI: active nav state, loading spinner, transitions
  landing.css        Landing-page-only styles, layered on top of style.css
js/
  router.js          Hash router: reads the URL, fetches the matching route file, injects it
  main.js            Site chrome (theme toggle, mobile menu) + per-route interactivity
                      (skill tabs, counters, filters, contact form) — re-bound on every route change
routes/
  about.html         Hero + About + timeline
  profile.html       Education + Skills
  ventures.html      Ventures (HM Analytics Agency, Elite Traders) + Insights gallery
  software.html      Software & Engineering project showcase
  leadership.html    Leadership + Research Interests + Achievements + Future Goals
  writing.html       Blog/Publications + Testimonials
  contact.html       Contact info + form
assets/
  henry-photo.jpg    Profile photo, referenced by landing.html and routes/about.html
```

## ⚠️ Important: this needs a local server, not a double-click

The router uses `fetch()` to load route files, which browsers block on the
`file://` protocol for security reasons. Opening `index.html` directly will
show a blank page or a console error.

**Run a local server from this folder, then visit it:**

```bash
# Python (built into most systems)
python3 -m http.server 8000
# then open http://localhost:8000/landing.html

# Node (if you have it)
npx serve .

# VS Code
# install the "Live Server" extension, right-click index.html → "Open with Live Server"
```

## Deploying

This is fully static — no build step, no backend required. Drag the whole
folder into Netlify, or push it to GitHub Pages / Vercel / any static host.
It will work exactly the same as it does locally.

## Still placeholder (search for these before going live)

- **Resume/CV download buttons** — currently show an alert. Replace the
  `href` on `#resumeBtnTop`, `#resumeBtnHero`, `#resumeBtnMobile` with a real PDF link.
- **Contact form** (`routes/contact.html`) — visually complete, not wired to send.
  Connect Formspree, EmailJS, or your own backend to the form's submit handler in `js/main.js`.
- **Social links** (LinkedIn, GitHub, X) in `routes/contact.html` and the
  landing page — currently `href="#"`.
- **Live site links** for HM Analytics Agency and Elite Traders in
  `routes/ventures.html` are wired to the real Netlify URLs you provided;
  double check they're still correct if either site moves.

## Adding a new section

1. Create `routes/your-section.html` — just the inner content, no `<section>` wrapper (the router adds it).
2. Add an entry to the `ROUTES` object in `js/router.js`.
3. Add a nav link in `index.html` (desktop `.navlinks` and the `.mobile-menu`) with `data-route="your-section"` and `data-link`.
4. If it needs interactivity, add an `init...()` function in `js/main.js` and call it from the `route:loaded` listener.
