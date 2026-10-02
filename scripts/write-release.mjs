import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full Git commit is required');
const release = { application: 'pixelforge-photo-editor', commit, builtAt: new Date().toISOString() };
await mkdir('dist/api', { recursive: true });
await writeFile('dist/release.json', JSON.stringify(release) + '\n');
await writeFile('dist/api/readyz.json', JSON.stringify({ ready: true, ...release }) + '\n');
