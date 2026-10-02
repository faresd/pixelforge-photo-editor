import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('PWA metadata exposes an installable PixelForge shell', async () => {
  const [html, manifestText, sw, main] = await Promise.all([
    read('index.html'),
    read('public/manifest.webmanifest'),
    read('public/sw.js'),
    read('src/main.tsx'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/pixelforge-192\.png"\s*\/>/);
  assert.equal(manifest.name, 'PixelForge — Free Online Photo Editor');
  assert.equal(manifest.short_name, 'PixelForge');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
    [
      { src: '/icons/pixelforge-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/pixelforge-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  );
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`public${icon.src}`, root));
    assert.ok(bytes.subarray(0, pngSignature.length).equals(pngSignature), `${icon.src} is a PNG`);
  }
  assert.match(sw, /const CACHE_NAME = 'pixelforge-shell-v1'/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /caches\.match\('\/index\.html'\)/);
  assert.match(sw, /new URL\(request\.url\)\.origin !== self\.location\.origin/);
  assert.match(main, /import\.meta\.env\.PROD/);
  assert.match(main, /navigator\.serviceWorker\.register\('\/sw\.js'/);
});
