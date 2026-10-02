import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('deployable artifact identifies the app and contains resolvable assets', async () => {
  const release = JSON.parse(await readFile('dist/release.json', 'utf8'));
  const ready = JSON.parse(await readFile('dist/api/readyz.json', 'utf8'));
  assert.equal(release.application, 'pixelforge-photo-editor');
  assert.match(release.commit, /^[a-f0-9]{40}$/);
  assert.equal(ready.ready, true);
  assert.equal(ready.commit, release.commit);
  const html = await readFile('dist/index.html', 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)];
  assert.ok(assets.length >= 2, 'built JavaScript and CSS assets are present');
  for (const [, asset] of assets) assert.ok((await readFile('dist' + asset)).length > 0);
});
