/**
 * Durable IndexedDB representation for editable drafts.
 *
 * Drafts can contain several encoded source assets and routinely exceed the
 * browser's 4 MiB sessionStorage limit.  The bundle splits the canonical JSON
 * payload into immutable ArrayBuffer chunks and keeps a manifest pointer in a
 * separate store.  A pointer and all chunk writes are committed in one
 * IndexedDB transaction by `src/drafts.ts`, so a reload can observe either the
 * previous complete bundle or the new complete bundle, never a half-written
 * one.
 */

export const DRAFT_BUNDLE_VERSION = 1 as const;
export const DEFAULT_DRAFT_BUNDLE_CHUNK_BYTES = 512 * 1024;
export const DRAFT_BUNDLE_KIND = 'pixelforge-draft-bundle' as const;

export type DraftBundleManifest = {
  kind: typeof DRAFT_BUNDLE_KIND;
  version: typeof DRAFT_BUNDLE_VERSION;
  id: string;
  revision: number;
  /** Mirrors revision for existing draft-library diagnostics and conflict reads. */
  localRevision: number;
  checksum: string;
  byteLength: number;
  chunkSize: number;
  chunkCount: number;
  chunks: string[];
  /** A small display hint retained on the pointer for library/debug tooling. */
  name: string;
  createdAt: string;
};

export type DraftBundleChunk = {
  id: string;
  bundleId: string;
  index: number;
  bytes: ArrayBuffer;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BUNDLE_ID_PATTERN = /^[a-f0-9-]{36}$/;
const MAX_CHUNKS = 256;
const MAX_CHUNK_BYTES = 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function validRevision(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= Number.MAX_SAFE_INTEGER
  );
}

function validBundleId(value: unknown): value is string {
  return typeof value === 'string' && BUNDLE_ID_PATTERN.test(value);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Canonical UTF-8 encoding used for checksums and chunking. */
export function encodeDraftPayload(value: unknown): Uint8Array {
  const encoded = JSON.stringify(value);
  if (typeof encoded !== 'string') throw new Error('Draft payload is not serializable');
  return new TextEncoder().encode(encoded);
}

/** SHA-256 is available in browsers and in the Node test runtime. */
export async function draftBundleChecksum(value: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Draft integrity checks are unavailable');
  const input = new Uint8Array(value.byteLength);
  input.set(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input.buffer);
  return toHex(digest);
}

function chunkKey(bundleId: string, index: number): string {
  return `${bundleId}:${index.toString(36)}`;
}

export function isDraftBundleManifest(value: unknown): value is DraftBundleManifest {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DraftBundleManifest>;
  return (
    candidate.kind === DRAFT_BUNDLE_KIND &&
    candidate.version === DRAFT_BUNDLE_VERSION &&
    validBundleId(candidate.id) &&
    validRevision(candidate.revision) &&
    candidate.localRevision === candidate.revision &&
    typeof candidate.checksum === 'string' &&
    SHA256_PATTERN.test(candidate.checksum) &&
    Number.isInteger(candidate.byteLength) &&
    Number(candidate.byteLength) >= 0 &&
    Number(candidate.byteLength) <= 64 * 1024 * 1024 &&
    Number.isInteger(candidate.chunkSize) &&
    Number(candidate.chunkSize) >= 1 &&
    Number(candidate.chunkSize) <= MAX_CHUNK_BYTES &&
    Number.isInteger(candidate.chunkCount) &&
    Number(candidate.chunkCount) >= 1 &&
    Number(candidate.chunkCount) <= MAX_CHUNKS &&
    Array.isArray(candidate.chunks) &&
    candidate.chunks.length === candidate.chunkCount &&
    candidate.chunks.every(
      (key, index) =>
        typeof key === 'string' && key === chunkKey(candidate.id!, index),
    ) &&
    typeof candidate.name === 'string' &&
    candidate.name.length <= 160 &&
    typeof candidate.createdAt === 'string' &&
    candidate.createdAt.length <= 64
  );
}

export function isDraftBundleChunk(value: unknown): value is DraftBundleChunk {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DraftBundleChunk>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.bundleId === 'string' &&
    validBundleId(candidate.bundleId) &&
    Number.isInteger(candidate.index) &&
    Number(candidate.index) >= 0 &&
    Number(candidate.index) < MAX_CHUNKS &&
    candidate.id === chunkKey(candidate.bundleId, candidate.index as number) &&
    candidate.bytes instanceof ArrayBuffer &&
    candidate.bytes.byteLength > 0 &&
    candidate.bytes.byteLength <= MAX_CHUNK_BYTES
  );
}

export async function createDraftBundle(
  draftId: string,
  revision: number,
  value: unknown,
  options: { chunkSize?: number; bundleId?: string; now?: string } = {},
): Promise<{ manifest: DraftBundleManifest; chunks: DraftBundleChunk[] }> {
  if (!validBundleId(draftId)) throw new Error('Invalid draft ID');
  if (!validRevision(revision)) throw new Error('Invalid draft revision');
  const chunkSize = options.chunkSize ?? DEFAULT_DRAFT_BUNDLE_CHUNK_BYTES;
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > MAX_CHUNK_BYTES
  )
    throw new Error('Invalid draft chunk size');
  const bundleId = options.bundleId ?? crypto.randomUUID();
  if (!validBundleId(bundleId)) throw new Error('Invalid draft bundle ID');
  const payload = encodeDraftPayload(value);
  if (payload.byteLength < 1 || payload.byteLength > 64 * 1024 * 1024)
    throw new Error('Draft payload exceeds 64 MB');
  const chunkCount = Math.ceil(payload.byteLength / chunkSize);
  if (chunkCount < 1 || chunkCount > MAX_CHUNKS)
    throw new Error('Draft has too many chunks');
  const chunks: DraftBundleChunk[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * chunkSize;
    const bytes = payload.slice(start, Math.min(start + chunkSize, payload.byteLength));
    chunks.push({
      id: chunkKey(bundleId, index),
      bundleId,
      index,
      bytes: bytes.buffer,
    });
  }
  const parsed = JSON.parse(new TextDecoder().decode(payload)) as unknown;
  const name = isRecord(parsed) && typeof parsed.name === 'string' ? parsed.name.slice(0, 160) : '';
  const manifest: DraftBundleManifest = {
    kind: DRAFT_BUNDLE_KIND,
    version: DRAFT_BUNDLE_VERSION,
    id: bundleId,
    revision,
    localRevision: revision,
    checksum: await draftBundleChecksum(payload),
    byteLength: payload.byteLength,
    chunkSize,
    chunkCount,
    chunks: chunks.map((chunk) => chunk.id),
    name,
    createdAt: options.now ?? new Date().toISOString(),
  };
  return { manifest, chunks };
}

function chunkBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('Draft bundle chunk is invalid');
}

/** Decode and verify a manifest/chunk set before handing it to draft validation. */
export async function decodeDraftBundle(
  manifest: unknown,
  chunks: readonly unknown[],
): Promise<unknown> {
  if (!isDraftBundleManifest(manifest)) throw new Error('Draft bundle manifest is invalid');
  if (chunks.length !== manifest.chunkCount)
    throw new Error('Draft bundle is incomplete');
  const ordered = Array.from<Uint8Array | undefined>({ length: manifest.chunkCount });
  for (const value of chunks) {
    if (!isDraftBundleChunk(value)) throw new Error('Draft bundle chunk is invalid');
    const chunk = value as DraftBundleChunk;
    const expected = manifest.chunks[chunk.index];
    if (
      chunk.bundleId !== manifest.id ||
      chunk.id !== expected ||
      ordered[chunk.index] !== undefined
    )
      throw new Error('Draft bundle chunk index is invalid');
    const bytes = chunkBytes(chunk.bytes);
    if (bytes.byteLength > manifest.chunkSize || bytes.byteLength < 1)
      throw new Error('Draft bundle chunk size is invalid');
    ordered[chunk.index] = bytes;
  }
  if (ordered.some((chunk) => !chunk)) throw new Error('Draft bundle is incomplete');
  const payload = new Uint8Array(manifest.byteLength);
  let offset = 0;
  for (const chunk of ordered) {
    if (!chunk) throw new Error('Draft bundle is incomplete');
    if (offset + chunk.byteLength > payload.byteLength)
      throw new Error('Draft bundle byte length is invalid');
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== manifest.byteLength) throw new Error('Draft bundle byte length is invalid');
  if ((await draftBundleChecksum(payload)) !== manifest.checksum)
    throw new Error('Draft bundle checksum mismatch');
  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    throw new Error('Draft bundle payload is invalid');
  }
}

/** Records from IndexedDB v1 were complete drafts; they remain importable. */
export function isLegacyDraftRecord(value: unknown): boolean {
  return isRecord(value) && !isDraftBundleManifest(value);
}
