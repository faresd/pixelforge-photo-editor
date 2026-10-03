import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identity,
  neutral,
  referencedAssets,
  transformFrame,
  validateFrame,
} from '../src/document.ts';
import {
  MAX_SAVED_SELECTIONS,
  cloneSelection,
  createQuickMask,
  deleteSelection,
  emptySavedSelectionBook,
  loadSelection,
  paintQuickMask,
  parseSavedSelections,
  quickMaskOverlay,
  referencedSelectionMasks,
  renameSelection,
  saveSelection,
  selectionFromQuickMask,
  serializeSavedSelections,
  validateSelection,
} from '../src/savedSelections.ts';

const rect = {
  shape: 'rectangle',
  x: 2,
  y: 3,
  w: 8,
  h: 7,
  feather: 4,
  inverted: false,
};
const polygon = {
  shape: 'polygon',
  x: 1,
  y: 1,
  w: 10,
  h: 10,
  feather: 0,
  inverted: false,
  points: [
    { x: 1, y: 1 },
    { x: 11, y: 1 },
    { x: 6, y: 11 },
  ],
  parts: [
    {
      shape: 'polygon',
      x: 1,
      y: 1,
      w: 10,
      h: 10,
      operation: 'replace',
      points: [
        { x: 1, y: 1 },
        { x: 11, y: 1 },
        { x: 6, y: 11 },
      ],
    },
  ],
};

test('selection validation covers bounds, polygons, parts, feather and affine matrices', () => {
  assert.equal(validateSelection(rect, { w: 20, h: 20 }), true);
  assert.equal(validateSelection(polygon, { w: 20, h: 20 }), true);
  assert.equal(validateSelection({ ...rect, x: 14 }, { w: 20, h: 20 }), false);
  assert.equal(validateSelection({ ...rect, feather: -1 }), false);
  assert.equal(
    validateSelection({ ...rect, matrix: [1, 0, 0, 0, 0, 0] }),
    false,
  );
  assert.equal(
    validateSelection({ ...rect, parts: [{ ...rect, operation: 'bad' }] }),
    false,
  );
});

test('save, load and rename snapshots detach mutable geometry and enforce unique names', () => {
  let book = emptySavedSelectionBook();
  book = saveSelection(book, rect, ' Subject  1 ', {
    id: 'subject-1',
    bounds: { w: 20, h: 20 },
  });
  const loaded = loadSelection(book, 'subject-1', { w: 20, h: 20 });
  loaded.x = 99;
  assert.equal(book.selections[0].selection.x, 2);
  book = renameSelection(book, 'subject-1', 'Hero');
  assert.equal(book.selections[0].name, 'Hero');
  assert.throws(
    () => saveSelection(book, rect, ' hero ', { id: 'second' }),
    /already uses/,
  );
});

test('replace, delete and asset references preserve immutable book ordering', () => {
  let book = saveSelection(
    emptySavedSelectionBook(),
    { ...rect, mask: 'mask-a' },
    'A',
    { id: 'a' },
  );
  book = saveSelection(book, polygon, 'B', { id: 'b' });
  const replaced = saveSelection(book, { ...rect, mask: 'mask-b' }, 'A2', {
    replaceId: 'a',
    id: 'a',
  });
  assert.deepEqual(
    replaced.selections.map((entry) => entry.id),
    ['a', 'b'],
  );
  assert.deepEqual(referencedSelectionMasks(replaced), ['mask-b']);
  const removed = deleteSelection(replaced, 'a');
  assert.deepEqual(
    removed.selections.map((entry) => entry.id),
    ['b'],
  );
  assert.throws(() => deleteSelection(removed, 'a'), /not found/);
});

test('saved-selection JSON round trip is versioned, detached and rejects malformed input', () => {
  const book = saveSelection(emptySavedSelectionBook(), polygon, 'Polygon', {
    id: 'poly',
    bounds: { w: 20, h: 20 },
  });
  const encoded = serializeSavedSelections(book, { w: 20, h: 20 });
  const parsed = parseSavedSelections(encoded, { w: 20, h: 20 });
  assert.deepEqual(parsed, book);
  parsed.selections[0].selection.points[0].x = 99;
  assert.equal(book.selections[0].selection.points[0].x, 1);
  assert.throws(
    () => parseSavedSelections('{"version":2,"selections":[]}'),
    /not supported/,
  );
  assert.throws(() => parseSavedSelections('{bad json'), /valid JSON/);
  assert.throws(
    () =>
      parseSavedSelections(
        JSON.stringify({
          version: 1,
          selections: [{ id: 'x', name: 'X', selection: { ...rect, x: 100 } }],
        }),
        { w: 20, h: 20 },
      ),
    /not supported/,
  );
});

test('saved selection limit and metadata constraints are explicit', () => {
  let book = emptySavedSelectionBook();
  for (let i = 0; i < MAX_SAVED_SELECTIONS; i += 1)
    book = saveSelection(book, rect, `S${i}`, { id: `s-${i}` });
  assert.equal(book.selections.length, MAX_SAVED_SELECTIONS);
  assert.throws(
    () => saveSelection(book, rect, 'overflow', { id: 'overflow' }),
    /32 saved/,
  );
  assert.throws(
    () => saveSelection(emptySavedSelectionBook(), rect, '   ', { id: 'x' }),
    /1–160/,
  );
  assert.throws(
    () =>
      saveSelection(emptySavedSelectionBook(), rect, 'x'.repeat(161), {
        id: 'x',
      }),
    /1–160/,
  );
});

test('Quick Mask defaults to fully selected, paints deterministic reveal and erase strokes', () => {
  const mask = createQuickMask(5, 5);
  assert.equal(
    mask.selected.every((value) => value === 255),
    true,
  );
  assert.equal(paintQuickMask(mask, 2, 2, 3, 1, false), true);
  assert.equal(mask.selected[2 * 5 + 2], 0);
  assert.equal(paintQuickMask(mask, 2, 2, 3, 0, true), false);
  assert.equal(paintQuickMask(mask, 2, 2, 3, 1, true), true);
  assert.equal(mask.selected[2 * 5 + 2], 255);
  assert.throws(() => paintQuickMask(mask, 2, 2, 3, 2, false), /settings/);
});

test('Quick Mask preserves soft alpha and clips brush work at canvas edges', () => {
  const mask = createQuickMask(4, 4, new Uint8Array(16));
  assert.equal(paintQuickMask(mask, 0, 0, 6, 0.5, true, 0.25), true);
  assert.ok(mask.selected[0] > 0 && mask.selected[0] < 255);
  assert.equal(mask.selected.length, 16);
  assert.equal(paintQuickMask(mask, 99, 99, 4, 1, true), false);
});

test('Quick Mask overlay inverts selected alpha and exports a canvas-sized selection reference', () => {
  const mask = createQuickMask(2, 1, [255, 0]);
  assert.deepEqual([...quickMaskOverlay(mask)], [255, 0, 0, 0, 255, 0, 0, 255]);
  const selection = selectionFromQuickMask(mask, 'quick-mask-1');
  assert.deepEqual(selection, {
    shape: 'rectangle',
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    feather: 0,
    inverted: false,
    mask: 'quick-mask-1',
  });
  assert.throws(() => selectionFromQuickMask(mask, 'bad id'), /asset ID/);
});

test('Quick Mask rejects oversized or malformed alpha buffers before mutation', () => {
  assert.throws(() => createQuickMask(0, 2), /dimensions/);
  assert.throws(() => createQuickMask(2, 2, [0, 1]), /wrong size/);
  const mask = createQuickMask(2, 2);
  mask.selected = new Uint8ClampedArray(1);
  assert.throws(() => quickMaskOverlay(mask), /dimensions or alpha/);
});

// Keep cloneSelection itself covered because UI integration will use it for undo/reselect.
test('cloneSelection copies nested selection arrays and matrix', () => {
  const original = cloneSelection({
    ...polygon,
    mask: 'm',
    matrix: [1, 0, 0, 1, 2, 3],
  });
  original.points[0].x = 100;
  original.parts[0].points[0].x = 100;
  original.matrix[4] = 100;
  assert.equal(polygon.points[0].x, 1);
  assert.equal(polygon.parts[0].points[0].x, 1);
  assert.deepEqual(original.matrix, [1, 0, 0, 1, 100, 3]);
});

const layerId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const namedMaskId = '00000000-0000-4000-8000-000000000003';
const quickMaskId = '00000000-0000-4000-8000-000000000004';
const unusedId = '00000000-0000-4000-8000-000000000005';

// Frame validation only inspects references. A minimal PNG header keeps these
// fixtures valid for asset validation without requiring a browser canvas.
const pngAsset = (w = 20, h = 20) => {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(w, 16);
  bytes.writeUInt32BE(h, 20);
  return { url: `data:image/png;base64,${bytes.toString('base64')}`, w, h };
};

const documentFrame = (patch = {}) => ({
  w: 20,
  h: 20,
  active: layerId,
  layers: [
    {
      id: layerId,
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      matrix: identity(),
      adjustments: structuredClone(neutral),
      kind: 'raster',
      asset: sourceId,
    },
  ],
  ...patch,
});

const documentAssets = () => ({
  [sourceId]: pngAsset(),
  [namedMaskId]: pngAsset(),
  [quickMaskId]: pngAsset(),
  [unusedId]: pngAsset(),
});

test('Frame validation accepts detached named selections and active Quick Mask references without mutation', () => {
  const book = saveSelection(
    emptySavedSelectionBook(),
    { ...rect, mask: namedMaskId },
    'Subject',
    { id: 'subject' },
  );
  const frame = documentFrame({
    savedSelections: book,
    quickMask: { asset: quickMaskId, active: true },
  });
  const assets = documentAssets();
  const before = structuredClone({ frame, assets });
  assert.doesNotThrow(() => validateFrame(frame, assets));
  assert.deepEqual({ frame, assets }, before);
});

test('Frame validation rejects malformed named selection books before retaining their assets', () => {
  const assets = documentAssets();
  const entry = { id: 'subject', name: 'Subject', selection: rect };
  for (const book of [
    { version: 2, selections: [] },
    { version: 1, selections: 'bad' },
    { version: 1, selections: [entry, entry] },
    {
      version: 1,
      selections: [entry, { ...entry, id: 'other', name: 'subject' }],
    },
    { version: 1, selections: [{ ...entry, selection: { ...rect, x: 19 } }] },
    {
      version: 1,
      selections: Array.from({ length: MAX_SAVED_SELECTIONS + 1 }, (_, i) => ({
        ...entry,
        id: `s-${i}`,
        name: `S${i}`,
      })),
    },
  ]) {
    assert.throws(
      () => validateFrame(documentFrame({ savedSelections: book }), assets),
      /Invalid layer document/,
    );
  }
});

test('Frame validation rejects named selection mask references missing from the document or sized for another canvas', () => {
  const book = saveSelection(
    emptySavedSelectionBook(),
    { ...rect, mask: namedMaskId },
    'Subject',
    { id: 'subject' },
  );
  const frame = documentFrame({ savedSelections: book });
  const missing = documentAssets();
  delete missing[namedMaskId];
  assert.throws(() => validateFrame(frame, missing), /Invalid layer document/);
  assert.throws(
    () =>
      validateFrame(frame, {
        ...documentAssets(),
        [namedMaskId]: pngAsset(1, 1),
      }),
    /Invalid layer document/,
  );
});

test('Frame validation rejects invalid Quick Mask assets, dimensions and state', () => {
  const assets = documentAssets();
  for (const quickMask of [
    { asset: 'bad id', active: true },
    { asset: unusedId, active: 'true' },
    { asset: '00000000-0000-4000-8000-000000000099', active: true },
    { active: true },
  ]) {
    assert.throws(
      () => validateFrame(documentFrame({ quickMask }), assets),
      /Invalid layer document/,
    );
  }
  assert.throws(
    () =>
      validateFrame(
        documentFrame({ quickMask: { asset: quickMaskId, active: true } }),
        { ...assets, [quickMaskId]: pngAsset(1, 1) },
      ),
    /Invalid layer document/,
  );
});

test('document asset retention includes masks referenced only by saved selections and retained Quick Mask history', () => {
  const assets = documentAssets();
  const named = documentFrame({
    savedSelections: saveSelection(
      emptySavedSelectionBook(),
      { ...rect, mask: namedMaskId },
      'Subject',
      { id: 'subject' },
    ),
  });
  const quick = documentFrame({
    quickMask: { asset: quickMaskId, active: true },
  });
  const retained = referencedAssets([named, quick], assets);
  assert.deepEqual(
    Object.keys(retained).sort(),
    [sourceId, namedMaskId, quickMaskId].sort(),
  );
  assert.equal(retained[namedMaskId], assets[namedMaskId]);
  assert.equal(retained[quickMaskId], assets[quickMaskId]);
  assert.equal(Object.hasOwn(retained, unusedId), false);
  assert.deepEqual(Object.keys(referencedAssets([documentFrame()], assets)), [
    sourceId,
  ]);
});

test('saved book edits do not mutate selection geometry or earlier book properties', () => {
  const selection = { ...polygon, matrix: [1, 0, 0, 1, 2, 3] };
  const first = saveSelection(emptySavedSelectionBook(), selection, 'Subject', {
    id: 'subject',
  });
  const before = structuredClone(first);
  const renamed = renameSelection(first, 'subject', 'Hero');
  const second = saveSelection(renamed, rect, 'Other', { id: 'other' });
  const removed = deleteSelection(second, 'other');
  removed.selections[0].selection.points[0].x = 99;
  removed.selections[0].selection.parts[0].points[0].x = 99;
  removed.selections[0].selection.matrix[4] = 99;
  assert.deepEqual(first, before);
  assert.equal(renamed.selections[0].name, 'Hero');
  assert.equal(renamed.selections[0].selection.points[0].x, 1);
  assert.equal(second.selections.length, 2);
  assert.equal(selection.points[0].x, 1);
  assert.equal(selection.matrix[4], 2);
});

test('canvas transforms clear size-dependent named selections and Quick Mask state without mutating old history', () => {
  const frame = documentFrame({
    savedSelections: saveSelection(emptySavedSelectionBook(), rect, 'Subject', {
      id: 'subject',
    }),
    quickMask: { asset: quickMaskId, active: true },
  });
  const before = structuredClone(frame);
  const transformed = transformFrame(frame, [2, 0, 0, 2, 0, 0], 40, 40);
  assert.equal(transformed.savedSelections, undefined);
  assert.equal(transformed.quickMask, undefined);
  assert.deepEqual(frame, before);
});
