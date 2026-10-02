import type { CloudLink } from './cloud';
export type Tool = 'move' | 'crop' | 'brush' | 'eraser' | 'text' | 'rectangle';
export type Shot = { url: string; w: number; h: number };
export type Draft = {
  version: 1;
  cloud?: CloudLink;
  history: Shot[];
  index: number;
  name: string;
  settings: { tool: Tool; zoom: number; color: string; size: number; text: string; fontSize: number; brightness: number; contrast: number; saturation: number; blur: number; filter: string };
};

let database: Promise<IDBDatabase> | undefined;
function validSettings(settings: Draft['settings']) {
  if (!settings || !['move', 'crop', 'brush', 'eraser', 'text', 'rectangle'].includes(settings.tool) || typeof settings.text !== 'string' || settings.text.length > 10000 || !/^#[a-f\d]{6}$/i.test(settings.color)) return false;
  const ranges = [[settings.zoom, 20, 140], [settings.size, 2, 100], [settings.fontSize, 16, 160], [settings.brightness, 0, 200], [settings.contrast, 0, 200], [settings.saturation, 0, 200], [settings.blur, 0, 20]];
  return ranges.every(([value, min, max]) => Number.isFinite(value) && value >= min && value <= max) && ['none', 'saturate(1.45) contrast(1.08)', 'grayscale(1) contrast(1.12)', 'sepia(.35) saturate(1.2)', 'hue-rotate(18deg) saturate(.9)'].includes(settings.filter);
}

export function validateDraft(input: unknown): Draft {
  if (!input || typeof input !== 'object') throw new Error('Invalid project file');
  const value = input as Draft;
  if (value.version !== 1 || !Array.isArray(value.history) || !value.history.length || value.history.length > 24 || !Number.isInteger(value.index) || value.index < 0 || value.index >= value.history.length || !validSettings(value.settings) || typeof value.name !== 'string' || value.name.length > 160 || value.history.some(shot => !shot || typeof shot.url !== 'string' || !shot.url.startsWith('data:image/png;base64,') || !Number.isInteger(shot.w) || !Number.isInteger(shot.h) || shot.w < 1 || shot.h < 1 || shot.w > 20000 || shot.h > 20000)) throw new Error('Saved document is not supported');
  return value;
}
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pixelforge-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is blocked'));
  });
  return database;
}

export function rememberDraft(id: string) {
  const url = new URL(location.href);
  url.pathname = '/editor';
  url.searchParams.delete('new');
  url.hash = 'draft=' + id;
  window.history.replaceState(null, '', url);
  try { localStorage.setItem('pixelforge:last-draft', id); } catch { /* IndexedDB can still be available. */ }
  return id;
}

export function createDraftId() { return rememberDraft(crypto.randomUUID()); }

export function initialDraftId() {
  if (new URL(location.href).searchParams.get('new') === '1') return createDraftId();
  let id = new URLSearchParams(location.hash.slice(1)).get('draft');
  if (!id) { try { id = localStorage.getItem('pixelforge:last-draft'); } catch { /* Use a new draft. */ } }
  return id && /^[a-f0-9-]{36}$/.test(id) ? rememberDraft(id) : createDraftId();
}

export async function discardDraft(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  try { if (localStorage.getItem('pixelforge:last-draft') === id) localStorage.removeItem('pixelforge:last-draft'); } catch { /* Already unavailable. */ }
}

export async function readDraft(id: string): Promise<Draft | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result as Draft | undefined;
      if (value === undefined) { resolve(undefined); return; }
      try { resolve(validateDraft(value)); } catch (error) { reject(error); }
    };
  });
}

export async function saveDraft(id: string, value: Draft) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put(value, id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
