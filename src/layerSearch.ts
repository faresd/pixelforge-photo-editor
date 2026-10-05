import type { Group, Layer } from './document';

/**
 * Normalize user-entered layer queries without allowing an unbounded string to
 * become part of the editor's searchable state. Search is intentionally local
 * metadata only; it never inspects or uploads raster pixels.
 */
export function normalizeLayerSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 160).toLocaleLowerCase();
}

function tokens(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

const STATE_TOKENS = new Set(['visible', 'hidden', 'locked', 'unlocked']);

function groupNameMatches(group: Group, query: string): boolean {
  const haystack = group.name.toLocaleLowerCase();
  return tokens(query).every((token) => haystack.includes(token));
}

/** Return a stable, human-readable metadata index for a layer. */
export function layerSearchText(
  layer: Layer,
  group?: Group,
): string {
  const visibility = layer.visible && group?.visible !== false ? 'visible' : 'hidden';
  const lock = layer.locked || group?.locked ? 'locked' : 'unlocked';
  return [
    layer.name,
    layer.kind,
    visibility,
    lock,
    group?.name || '',
  ]
    .join(' ')
    .toLocaleLowerCase();
}

/**
 * Match every query token against layer metadata. Requiring all tokens keeps
 * searches predictable for queries such as `hidden raster` while retaining
 * forgiving substring matching for names and group labels.
 */
export function layerMatchesSearch(
  layer: Layer,
  group: Group | undefined,
  query: unknown,
): boolean {
  const normalized = normalizeLayerSearchQuery(query);
  if (!normalized) return true;
  const haystack = layerSearchText(layer, group);
  const visible = layer.visible && group?.visible !== false;
  const locked = layer.locked || group?.locked === true;
  return tokens(normalized).every((token) => {
    if (!STATE_TOKENS.has(token)) return haystack.includes(token);
    if (token === 'visible') return visible;
    if (token === 'hidden') return !visible;
    if (token === 'locked') return locked;
    return !locked;
  });
}

/** Match a group row itself, including an empty group with no child metadata. */
export function groupMatchesSearch(group: Group, query: unknown): boolean {
  const normalized = normalizeLayerSearchQuery(query);
  return !normalized || groupNameMatches(group, normalized);
}

/** Filter layers without mutating the frame or changing stack order. */
export function filterLayersBySearch(
  layers: readonly Layer[],
  groups: readonly Group[],
  query: unknown,
): Layer[] {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  return layers.filter((layer) =>
    layerMatchesSearch(layer, layer.groupId ? groupById.get(layer.groupId) : undefined, query),
  );
}
