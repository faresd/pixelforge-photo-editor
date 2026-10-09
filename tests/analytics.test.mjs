import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const analyticsSource = await fs.readFile(
  new URL('../src/Analytics.tsx', import.meta.url),
  'utf8',
);
const firebase = JSON.parse(
  await fs.readFile(new URL('../firebase.json', import.meta.url), 'utf8'),
);

function hostingCsp() {
  const headers = firebase.hosting?.headers ?? [];
  const wildcard = headers.find((entry) => entry.source === '**');
  const csp = wildcard?.headers?.find(
    (header) => header.key === 'Content-Security-Policy',
  );
  assert.ok(
    csp?.value,
    'the hosting policy must define a Content-Security-Policy header',
  );
  return csp.value;
}

function directive(policy, name) {
  const value = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  assert.ok(value, `the Content-Security-Policy must define ${name}`);
  return value.split(/\s+/).slice(1);
}

test('analytics preserves the global dataLayer queue for the Google loader', () => {
  assert.match(analyticsSource, /const dataLayer = page\.dataLayer \|\| \[\];/);
  assert.match(analyticsSource, /page\.dataLayer = dataLayer;/);
  assert.match(
    analyticsSource,
    /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/,
  );
});

test('hosting CSP allows the consent-gated GA4 loader and collection endpoints', () => {
  const policy = hostingCsp();
  assert.ok(
    directive(policy, 'script-src').includes(
      'https://www.googletagmanager.com',
    ),
  );
  const connectSources = directive(policy, 'connect-src');
  for (const source of [
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
  ]) {
    assert.ok(
      connectSources.includes(source),
      `connect-src should allow ${source}`,
    );
  }
});
