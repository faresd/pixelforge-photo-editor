# PixelForge Photo Editor

A free browser photo editor. Image operations run locally in the browser.

Production: https://photoeditor.cheaply.fr

## Development

Use Node.js 22 or newer (minimum 22.13).

```sh
npm ci
npm run dev
```

The React editor is `app/page.tsx`. Vite builds static assets for Google Cloud's Firebase Hosting; no application server or Sites runtime is required.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests cover desktop and mobile menus, image import, transformations, undo, text controls, and PNG downloads. Lint/type checking cover the active application, build configuration and tests; unused generated UI components are outside the application entry graph.

## Deployment

See [deployment operations](docs/deployment.md). Pull requests run checks. A tested `main` build is deployed automatically through GitHub Actions using short-lived Google credentials. The same build artifact is promoted; the deploy job does not rebuild it.

Draft pixels, settings and undo history autosave in IndexedDB. Document bookmarks restore work in the same browser; clearing browser data can remove local work. The home page promotes available tools and lets users continue their last draft. Discard draft removes the current local document and returns home.

Optional sign-in reuses the existing Marketplace session. The private project library supports explicit cloud save/update, reopen and removal; anonymous images never upload automatically. Cloud storage starts at 30 projects, 16 MB per project and 256 MB per account. New edits autosave locally; use Update cloud project to sync them across devices.

Professional layers, masks, selections, HEIC and batch editing remain future stages described in [product scope](docs/product-scope.md).
