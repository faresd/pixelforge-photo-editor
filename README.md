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

Images and editing history remain in the current tab. Export your image before closing it. Persistent recovery, editable layers, HEIC support and batch editing are roadmap proposals rather than current capabilities.
