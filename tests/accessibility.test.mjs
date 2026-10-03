import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('editor shell exposes keyboard focus and reduced-motion source contracts', async () => {
  const [css, contract] = await Promise.all([
    read('app/globals.css'),
    read('docs/accessibility-performance.md'),
  ]);
  assert.match(css, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible/);
  assert.match(css, /outline:\s*2px solid var\(--focus-ring\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition:\s*none/);
  assert.match(css, /scroll-behavior:\s*auto/);
  assert.match(contract, /desktop and\s+mobile projects/i);
  assert.match(contract, /Worker\/OffscreenCanvas rendering/i);
});
