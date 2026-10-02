import type { CloudLink } from './cloud';
import { EXPORT_FORMATS, validExportQuality, type ExportFormat } from './export';
import {
  validAsset,
  validateFrame,
  validAdjustments,
  referencedAssets,
  commonLayer,
  neutral,
  validId,
  type Assets,
  type Frame,
} from './document';
export type Tool = 'move' | 'hand' | 'zoom' | 'eyedropper' | 'fill' | 'gradient' | 'clone' | 'heal' | 'crop' | 'brush' | 'pencil' | 'color-replace' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'select' | 'ellipse-select' | 'row-select' | 'column-select' | 'lasso' | 'polygonal-lasso' | 'magic-wand';
export type Shot = { url: string; w: number; h: number };
export type Settings = {
  tool: Tool;
  zoom: number;
  color: string;
  /** Photoshop-compatible foreground/background pair. Older drafts omit the background. */
  backgroundColor?: string;
  size: number;
  brushOpacity?: number;
  hardness?: number;
  colorTolerance?: number;
  exportFormat?: ExportFormat;
  exportQuality?: number;
  text: string;
  fontSize: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  filter: string;
};
export type Draft = {
  version: 2;
  localRevision?: number;
  cloud?: CloudLink;
  history: Frame[];
  assets: Assets;
  index: number;
  name: string;
  settings: Settings;
  migrated?: true;
};
let database: Promise<IDBDatabase> | undefined;
function validSettings(settings: Settings) {
  if (
    !settings ||
    !['move', 'hand', 'zoom', 'eyedropper', 'fill', 'gradient', 'clone', 'heal', 'crop', 'brush', 'pencil', 'color-replace', 'eraser', 'text', 'rectangle', 'ellipse', 'select', 'ellipse-select', 'row-select', 'column-select', 'lasso', 'polygonal-lasso', 'magic-wand'].includes(
      settings.tool,
    ) ||
    typeof settings.text !== 'string' ||
    settings.text.length > 10000 ||
    (settings.exportFormat !== undefined && !EXPORT_FORMATS.includes(settings.exportFormat)) ||
    (settings.exportQuality !== undefined && !validExportQuality(settings.exportQuality)) ||
    !/^#[a-f\d]{6}$/i.test(settings.color) ||
    (settings.backgroundColor !== undefined && !/^#[a-f\d]{6}$/i.test(settings.backgroundColor))
  )
    return false;
  const ranges = [
    [settings.zoom, 20, 140],
    [settings.size, 2, 100],
    [settings.fontSize, 16, 160],
  ];
  const brushRanges = [
    [settings.brushOpacity ?? 100, 1, 100],
    [settings.hardness ?? 100, 1, 100],
    [settings.colorTolerance ?? 24, 0, 255],
  ];
  return (
    ranges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    brushRanges.every(
      ([value, min, max]) =>
        Number.isFinite(value) && value >= min && value <= max,
    ) &&
    validAdjustments(settings)
  );
}
export function validateDraft(input: unknown): Draft {
  if (!input || typeof input !== 'object')
    throw new Error('Invalid project file');
  const value = input as Draft;
  if (
    !Array.isArray(value.history) ||
    !value.history.length ||
    value.history.length > 24 ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= value.history.length ||
    !validSettings(value.settings) ||
    typeof value.name !== 'string' ||
    value.name.length > 160
  )
    throw new Error('Saved document is not supported');
  if ((input as { version: number }).version === 1) {
    const assets: Assets = {},
      id = crypto.randomUUID();
    const history = (value.history as unknown as Shot[]).map((shot) => {
      if (!validAsset(shot))
        throw new Error('Saved image is invalid or too large');
      const asset =
        Object.keys(assets).find((key) => assets[key].url === shot.url) ||
        crypto.randomUUID();
      assets[asset] = shot;
      return {
        w: shot.w,
        h: shot.h,
        active: id,
        layers: [
          {
            ...commonLayer('Background'),
            id,
            kind: 'raster' as const,
            asset,
            adjustments: {
              brightness: value.settings.brightness,
              contrast: value.settings.contrast,
              saturation: value.settings.saturation,
              blur: value.settings.blur,
              filter: value.settings.filter,
            },
          },
        ],
      };
    });
    return {
      ...value,
      version: 2,
      assets,
      history,
      settings: { ...value.settings, ...neutral },
      migrated: true,
    };
  }
  if (
    value.version !== 2 ||
    !value.assets ||
    typeof value.assets !== 'object' ||
    Array.isArray(value.assets) ||
    Object.keys(value.assets).length > 768 ||
    Object.entries(value.assets).some(
      ([id, asset]) => !validId(id) || !validAsset(asset),
    )
  )
    throw new Error('Invalid project assets');
  value.history.forEach((frame) => validateFrame(frame, value.assets));
  if (
    Object.values(value.assets).reduce(
      (total, asset) => total + asset.url.length,
      0,
    ) >
    64 * 1024 * 1024
  )
    throw new Error('Project assets exceed 64 MB');
  return { ...value, assets: referencedAssets(value.history, value.assets) };
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
  try {
    localStorage.setItem('pixelforge:last-draft', id);
  } catch {
    /* IndexedDB can still be available. */
  }
  return id;
}

export function createDraftId() {
  return rememberDraft(crypto.randomUUID());
}

export function initialDraftId() {
  if (new URL(location.href).searchParams.get('new') === '1')
    return createDraftId();
  let id = new URLSearchParams(location.hash.slice(1)).get('draft');
  if (!id) {
    try {
      id = localStorage.getItem('pixelforge:last-draft');
    } catch {
      /* Use a new draft. */
    }
  }
  return id && /^[a-f0-9-]{36}$/.test(id) ? rememberDraft(id) : createDraftId();
}

export const LOCAL_CONFLICT =
  'This draft changed in another tab. Save a local copy to keep your edits.';

export async function discardDraft(id: string, expectedRevision: number) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    const store = transaction.objectStore('drafts');
    let conflict = false;
    const read = store.get(id);
    read.onsuccess = () => {
      if ((read.result?.localRevision || 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.delete(id);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(conflict ? new Error(LOCAL_CONFLICT) : transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  try {
    if (localStorage.getItem('pixelforge:last-draft') === id)
      localStorage.removeItem('pixelforge:last-draft');
  } catch {
    /* Already unavailable. */
  }
}

export async function readDraft(id: string): Promise<Draft | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result as Draft | undefined;
      if (value === undefined) {
        resolve(undefined);
        return;
      }
      try {
        resolve(validateDraft(value));
      } catch (error) {
        reject(error);
      }
    };
  });
}

export async function saveDraft(
  id: string,
  value: Draft,
  expectedRevision = 0,
): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite');
    const store = transaction.objectStore('drafts');
    let conflict = false;
    const revision = expectedRevision + 1;
    const read = store.get(id);
    read.onsuccess = () => {
      if ((read.result?.localRevision || 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put({ ...value, localRevision: revision }, id);
    };
    transaction.oncomplete = () => resolve(revision);
    transaction.onabort = () =>
      reject(conflict ? new Error(LOCAL_CONFLICT) : transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
