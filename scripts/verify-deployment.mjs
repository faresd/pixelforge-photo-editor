import { setTimeout } from 'node:timers/promises';

const base = process.env.DEPLOY_URL;
const expected = process.env.EXPECTED_SHA || process.env.GITHUB_SHA;
if (!base || !/^[a-f0-9]{40}$/.test(expected || '')) throw new Error('DEPLOY_URL and a full EXPECTED_SHA are required');
const url = new URL(base);
if (url.protocol !== 'https:') throw new Error('Deployment must use HTTPS');
let lastError;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const [home, ready, release] = await Promise.all(['/', '/api/readyz.json', '/release.json'].map(path => fetch(new URL(path + '?verify=' + expected, url), { signal: AbortSignal.timeout(15000), cache: 'no-store' })));
    if (![home, ready, release].every(response => response.ok)) throw new Error(`HTTP status: ${home.status}/${ready.status}/${release.status}`);
    if (!(await home.text()).includes('PixelForge')) throw new Error('Wrong application at deployment URL');
    const health = await ready.json();
    const version = await release.json();
    if (health.ready !== true || health.commit !== expected || version.commit !== expected || version.application !== 'pixelforge-photo-editor') throw new Error('Deployment commit does not match');
    console.log(`Verified ${url.origin}: ${expected}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 11) await setTimeout(10000);
  }
}
throw lastError;
