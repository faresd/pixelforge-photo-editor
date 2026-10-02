# Offline and installable shell

PixelForge now ships an installable progressive web app shell. The manifest is
served from `/manifest.webmanifest` and uses the PixelForge mark at 192 and 512
pixels. Production builds register `/sw.js` after the first page load; local
development does not register the worker, so Vite hot reload remains isolated
from the production cache.

The worker follows two rules:

- HTML navigations use the network first and refresh the cached `/index.html`
  when the request succeeds. If the network is unavailable, the last shell is
  returned so `/editor` and bookmarked drafts can open.
- Same-origin GET assets use a versioned runtime cache. Hashed Vite assets are
  safe to reuse after the first successful online load. Marketplace requests
  and other cross-origin traffic are excluded, so cloud session/project calls
  never become an implicit offline data cache.

This milestone requires one successful online visit before the shell and app
assets are available offline. Draft pixels, settings and undo history continue
to use IndexedDB in the browser; a cached shell does not make cloud save or
project-library operations available without a connection. Bump `CACHE_NAME`
in `public/sw.js` when the cache contract changes. The browser removes older
`pixelforge-shell-*` caches during activation.

The static contract is covered by `tests/pwa.test.mjs`. Verify the generated
artifact with `npm run build && npm test`, then use a browser's Application
panel to confirm the service worker controls the page and that a previously
loaded `/editor` route opens with the network disabled.
