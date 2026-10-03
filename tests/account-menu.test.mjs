import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/AccountMenu.tsx', import.meta.url), 'utf8');

test('account menu keeps the shared Cheaply auth contract and local guest identity', () => {
  assert.match(source, /marketplace\.cheaply\.fr\/marketplace\/auth\/logout/);
  assert.match(source, /marketplace\.cheaply\.fr\/marketplace\/profile/);
  assert.match(source, /SIGN_IN/);
  assert.match(source, /pixelforge:guest-avatar/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /Editing is free without an account/);
  assert.match(source, /Your edits stay on this device/);
});

