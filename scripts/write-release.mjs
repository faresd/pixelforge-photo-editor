import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full Git commit is required');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
if (typeof manifest.version !== 'string' || !manifest.version) throw new Error('A package version is required');
const release = { application: 'pixelforge-photo-editor', version: manifest.version, commit, builtAt: new Date().toISOString() };
await mkdir('dist/api', { recursive: true });
await writeFile('dist/release.json', JSON.stringify(release) + '\n');
await writeFile('dist/api/readyz.json', JSON.stringify({ ready: true, ...release }) + '\n');
