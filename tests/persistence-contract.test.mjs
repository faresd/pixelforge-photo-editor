import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_DRAFT_VERSION,
  isNewerDraftRevision,
  prepareDraftForStorage,
  validCloudLink,
  validateDraft,
} from '../src/drafts.ts';
import {
  listCloudProjects,
  saveCloudProject,
  validateCloudDelete,
  validateCloudOpen,
  validateCloudProjectList,
  validateCloudSave,
  validateCloudSession,
  validCloudProject,
  validMember,
} from '../src/cloud.ts';
import { neutral } from '../src/document.ts';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const assetId = '11111111-1111-4111-8111-111111111111';
const layerId = '22222222-2222-4222-8222-222222222222';
const settings = {
  tool: 'move',
  zoom: 72,
  color: '#000000',
  size: 18,
  text: '',
  fontSize: 56,
  ...neutral,
};
const baseDraft = () => ({
  version: CURRENT_DRAFT_VERSION,
  localRevision: 4,
  name: 'Contract fixture',
  index: 0,
  settings,
  assets: {
    [assetId]: { url: `data:image/png;base64,${png}`, w: 1, h: 1 },
  },
  history: [
    {
      w: 1,
      h: 1,
      active: layerId,
      layers: [
        {
          id: layerId,
          name: 'Background',
          visible: true,
          locked: false,
          opacity: 1,
          blend: 'source-over',
          matrix: [1, 0, 0, 1, 0, 0],
          adjustments: { ...neutral },
          kind: 'raster',
          asset: assetId,
        },
      ],
    },
  ],
});

test('draft validation rejects unknown versions before accepting any payload', () => {
  assert.throws(
    () => validateDraft({ version: 99 }),
    /Unsupported project version/,
  );
  assert.throws(
    () => validateDraft({ version: '2', history: [], settings: {} }),
    /Unsupported project version/,
  );
});

test('recovery only adopts a strictly newer local revision', () => {
  assert.equal(isNewerDraftRevision(4, 5), true);
  assert.equal(isNewerDraftRevision(4, 4), false);
  assert.equal(isNewerDraftRevision(4, 3), false);
  assert.equal(isNewerDraftRevision(4, undefined), false);
  assert.equal(isNewerDraftRevision(-1, 5), false);
  assert.equal(isNewerDraftRevision(4, Number.MAX_SAFE_INTEGER + 1), false);
});

test('v1 migration creates a complete editable v2 document and v2 validation is stable', () => {
  const legacy = {
    version: 1,
    name: 'Legacy fixture',
    index: 0,
    history: [{ url: `data:image/png;base64,${png}`, w: 1, h: 1 }],
    settings,
  };
  const migrated = validateDraft(legacy);
  assert.equal(migrated.version, CURRENT_DRAFT_VERSION);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.history[0].layers[0].kind, 'raster');
  assert.equal(Object.keys(migrated.assets).length, 1);
  const reopened = validateDraft(migrated);
  assert.deepEqual(reopened.history, migrated.history);
  assert.deepEqual(reopened.assets, migrated.assets);
});

test('draft storage preparation rejects malformed revisions and cloud links', () => {
  assert.equal(prepareDraftForStorage(baseDraft()).localRevision, 4);
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4']) {
    assert.throws(
      () => prepareDraftForStorage({ ...baseDraft(), localRevision: value }),
      /Invalid project revision/,
    );
  }
  assert.equal(validCloudLink({ id: 'p', generation: '0', owner: 'u' }), true);
  assert.equal(
    validCloudLink({ id: 'p\n', generation: '0', owner: 'u' }),
    false,
  );
  assert.throws(
    () =>
      prepareDraftForStorage({
        ...baseDraft(),
        cloud: { id: '', generation: '0', owner: 'u' },
      }),
    /Invalid cloud project link/,
  );
  const legacy = {
    version: 1,
    name: 'Legacy fixture',
    index: 0,
    history: [{ url: `data:image/png;base64,${png}`, w: 1, h: 1 }],
    settings,
  };
  assert.throws(
    () => prepareDraftForStorage({ ...legacy, localRevision: -1 }),
    /Invalid project revision/,
  );
});

test('cloud session and project response validators reject malformed or oversized data', () => {
  assert.deepEqual(validateCloudSession({ authenticated: false }), {
    authenticated: false,
  });
  const member = { id: 'member-1', name: 'Test member' };
  assert.deepEqual(
    validateCloudSession({ authenticated: true, user: member }),
    {
      authenticated: true,
      user: member,
    },
  );
  assert.equal(validMember(member), true);
  assert.equal(validMember({ id: 'member-1', name: '' }), false);
  assert.throws(
    () => validateCloudSession({ authenticated: true }),
    /Cloud response is invalid/,
  );
  assert.throws(
    () => validateCloudSession({ authenticated: 'yes' }),
    /Cloud response is invalid/,
  );
  const project = {
    id: 'project-1',
    name: 'Private fixture',
    updatedAt: '2026-10-03T00:00:00Z',
    generation: '2',
    bytes: 100,
  };
  assert.equal(validCloudProject(project), true);
  assert.deepEqual(validateCloudProjectList({ projects: [project] }), {
    projects: [project],
  });
  assert.throws(
    () =>
      validateCloudProjectList({
        projects: [{ ...project, bytes: 65 * 1024 * 1024 }],
      }),
    /Cloud response is invalid/,
  );
  assert.throws(
    () =>
      validateCloudProjectList({
        projects: Array.from({ length: 31 }, () => project),
      }),
    /Cloud response is invalid/,
  );
});

test('cloud open validates the embedded editable document and save/delete envelopes', () => {
  const document = baseDraft();
  assert.equal(
    validateCloudOpen({ id: 'project-1', generation: '2', document }).document
      .version,
    2,
  );
  assert.deepEqual(validateCloudSave({ id: 'project-1', generation: '3' }), {
    id: 'project-1',
    generation: '3',
  });
  assert.deepEqual(validateCloudDelete({ deleted: true }), { deleted: true });
  assert.throws(
    () =>
      validateCloudOpen({
        id: 'project-1',
        generation: '2',
        document: { ...document, version: 8 },
      }),
    /Unsupported project version/,
  );
  assert.throws(
    () => validateCloudSave({ id: '', generation: '3' }),
    /Cloud response is invalid/,
  );
  assert.throws(
    () => validateCloudDelete({ deleted: 'yes' }),
    /Cloud response is invalid/,
  );
});

test('cloud open preserves local editable fields while dropping no validated assets', () => {
  const document = baseDraft();
  const opened = validateCloudOpen({
    id: 'project-1',
    generation: '2',
    document,
  }).document;
  assert.equal(opened.history[0].layers[0].asset, assetId);
  assert.deepEqual(Object.keys(opened.assets), [assetId]);
  assert.equal(opened.settings.tool, 'move');
});

test('cloud endpoint wrappers fail closed on malformed responses and payloads', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ projects: [{ id: 'bad' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    await assert.rejects(
      () => listCloudProjects(),
      /Cloud response is invalid/,
    );
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    assert.throws(
      () => saveCloudProject('project-1', '1', { ...baseDraft(), version: 8 }),
      /Unsupported project version/,
    );
    assert.equal(called, false, 'invalid documents are rejected before upload');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
