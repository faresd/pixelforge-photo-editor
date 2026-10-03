/**
 * Pure document geometry for Photoshop-style Canvas Size, Trim and Reveal All.
 *
 * These commands only calculate the new canvas rectangle and affine translation.
 * The caller applies the returned matrix through transformFrameWithMasks so
 * raster sources remain immutable and canvas-space masks stay valid.
 */
import type { Assets, Frame, Layer, Matrix } from './document.ts';
import { identity, validMatrix } from './document.ts';
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  effectiveImageSize,
} from './imageSize.ts';

export const CANVAS_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type CanvasAnchor = (typeof CANVAS_ANCHORS)[number];

export type CanvasSizeRequest = {
  width: number;
  height: number;
  anchor: CanvasAnchor;
};

export type CanvasSizePlan = {
  width: number;
  height: number;
  /** Translation applied to old content when moved into the new canvas. */
  offsetX: number;
  offsetY: number;
  matrix: Matrix;
  changed: boolean;
};

export type PixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Corner samples mirror Photoshop's Trim dialog. `color` is an explicit target-color mode for API callers. */
export type TrimMode =
  | 'transparent'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'color';
export type TrimSides = { top: boolean; left: boolean; bottom: boolean; right: boolean };
export type TrimColor = [number, number, number, number];
export type TrimRequest = {
  mode: TrimMode;
  /** Used only for `color`; omitted means the top-left pixel. */
  color?: TrimColor;
  /** Inclusive per-channel tolerance, default 0. */
  tolerance?: number;
};

export type TrimPlan = CanvasSizePlan & {
  bounds: PixelBounds;
  mode: TrimMode;
};

export type RevealAllRequest = {
  /** Hidden layers are ignored by default because they do not contribute to the visible canvas. */
  includeHidden?: boolean;
};

export type RevealAllPlan = CanvasSizePlan & {
  bounds: PixelBounds;
  includedLayerIds: string[];
};

const validDimension = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION;
const validPixels = (width: number, height: number): boolean =>
  validDimension(width) && validDimension(height) && width * height <= MAX_IMAGE_PIXELS;

function assertDimensions(width: number, height: number, label: string): void {
  if (!validPixels(width, height))
    throw new Error(`${label} must be whole dimensions up to 16,000 pixels and 16 megapixels total`);
}

function anchorOffset(
  current: number,
  next: number,
  side: 'start' | 'center' | 'end',
): number {
  if (side === 'start') return 0;
  if (side === 'end') return next - current;
  // Integer translation avoids half-pixel anti-aliasing when an odd delta is centered.
  return Math.floor((next - current) / 2);
}

function anchorSides(anchor: CanvasAnchor): ['start' | 'center' | 'end', 'start' | 'center' | 'end'] {
  const vertical = anchor.startsWith('top')
    ? 'start'
    : anchor.startsWith('bottom')
      ? 'end'
      : 'center';
  const horizontal = anchor.endsWith('left')
    ? 'start'
    : anchor.endsWith('right')
      ? 'end'
      : 'center';
  return [horizontal, vertical];
}

/** Plan a canvas resize without touching source pixels. */
export function planCanvasSize(
  currentWidth: number,
  currentHeight: number,
  request: CanvasSizeRequest,
): CanvasSizePlan {
  assertDimensions(currentWidth, currentHeight, 'Current canvas');
  if (!CANVAS_ANCHORS.includes(request.anchor)) throw new Error('Canvas anchor is invalid');
  assertDimensions(request.width, request.height, 'Canvas size');
  const [horizontal, vertical] = anchorSides(request.anchor),
    offsetX = anchorOffset(currentWidth, request.width, horizontal),
    offsetY = anchorOffset(currentHeight, request.height, vertical),
    matrix: Matrix = [1, 0, 0, 1, offsetX, offsetY];
  if (!validMatrix(matrix)) throw new Error('Canvas translation is invalid');
  return {
    width: request.width,
    height: request.height,
    offsetX,
    offsetY,
    matrix,
    changed: request.width !== currentWidth || request.height !== currentHeight || offsetX !== 0 || offsetY !== 0,
  };
}

function assertPixelBuffer(pixels: ArrayLike<number>, width: number, height: number): void {
  assertDimensions(width, height, 'Pixel buffer');
  if (pixels.length !== width * height * 4) throw new Error('Pixel buffer must contain RGBA data for every pixel');
  for (let index = 0; index < pixels.length; index += 1)
    if (!Number.isFinite(pixels[index]) || pixels[index] < 0 || pixels[index] > 255)
      throw new Error('Pixel buffer channels must be finite 8-bit values');
}

function validColor(value: unknown): value is TrimColor {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 255)
  );
}

function sameColor(
  pixels: ArrayLike<number>,
  index: number,
  target: TrimColor,
  tolerance: number,
): boolean {
  return (
    Math.abs(pixels[index] - target[0]) <= tolerance &&
    Math.abs(pixels[index + 1] - target[1]) <= tolerance &&
    Math.abs(pixels[index + 2] - target[2]) <= tolerance &&
    Math.abs(pixels[index + 3] - target[3]) <= tolerance
  );
}

/**
 * Find the smallest non-trimmed pixel rectangle. Bounds are half-open and
 * integer, matching canvas drawImage and document dimensions.
 */
export function findTrimBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  request: TrimRequest,
): PixelBounds | null {
  assertPixelBuffer(pixels, width, height);
  if (!['transparent', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'color'].includes(request.mode)) throw new Error('Trim mode is invalid');
  const tolerance = request.tolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255)
    throw new Error('Trim tolerance must be between 0 and 255');
  let target: TrimColor | undefined;
  if (request.mode === 'color') {
    target = request.color ? [...request.color] as TrimColor : [pixels[0], pixels[1], pixels[2], pixels[3]];
    if (!validColor(target)) throw new Error('Trim color is invalid');
  } else if (request.mode !== 'transparent') {
    const sampleX = request.mode.endsWith('right') ? width - 1 : 0,
      sampleY = request.mode.startsWith('bottom') ? height - 1 : 0,
      sampleIndex = (sampleY * width + sampleX) * 4;
    target = [pixels[sampleIndex], pixels[sampleIndex + 1], pixels[sampleIndex + 2], pixels[sampleIndex + 3]];
  }
  const isTrimmed = (index: number): boolean =>
    request.mode === 'transparent'
      ? pixels[index + 3] <= tolerance
      : sameColor(pixels, index, target!, tolerance);
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (isTrimmed(index)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (left === width) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Plan a trim operation from RGBA pixels. */
export function planTrim(
  currentWidth: number,
  currentHeight: number,
  pixels: ArrayLike<number>,
  request: TrimRequest,
): TrimPlan {
  assertDimensions(currentWidth, currentHeight, 'Current canvas');
  if (pixels.length !== currentWidth * currentHeight * 4)
    throw new Error('Pixel buffer must contain RGBA data for the current canvas');
  const bounds = findTrimBounds(pixels, currentWidth, currentHeight, request);
  if (!bounds) throw new Error('Trim would remove the entire image');
  const plan: CanvasSizePlan = {
    width: bounds.width,
    height: bounds.height,
    offsetX: -bounds.x,
    offsetY: -bounds.y,
    matrix: [1, 0, 0, 1, -bounds.x, -bounds.y],
    changed: bounds.x !== 0 || bounds.y !== 0 || bounds.width !== currentWidth || bounds.height !== currentHeight,
  };
  return { ...plan, bounds, mode: request.mode };
}

/**
 * Compatibility helper for the editor command. It returns half-open edges and
 * lets callers preserve any side instead of trimming every detected margin.
 */
export function trimBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  mode: TrimMode,
  sides: TrimSides = { top: true, left: true, bottom: true, right: true },
): { left: number; top: number; right: number; bottom: number } | null {
  for (const key of ['top', 'left', 'bottom', 'right'] as const)
    if (typeof sides[key] !== 'boolean') throw new Error('Trim sides are invalid');
  const found = findTrimBounds(pixels, width, height, { mode });
  if (!found) return null;
  const left = sides.left ? found.x : 0,
    top = sides.top ? found.y : 0,
    right = sides.right ? found.x + found.width : width,
    bottom = sides.bottom ? found.y + found.height : height;
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

function transformedCorners(local: PixelBounds, matrix: Matrix): PixelBounds {
  const corners = [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x, local.y + local.height],
    [local.x + local.width, local.y + local.height],
  ].map(([x, y]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }));
  const left = Math.min(...corners.map((point) => point.x)),
    top = Math.min(...corners.map((point) => point.y)),
    right = Math.max(...corners.map((point) => point.x)),
    bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Return the local painted bounds of a layer before its affine matrix. */
export function layerLocalBounds(layer: Layer, assets: Assets): PixelBounds {
  if (layer.kind === 'raster') {
    const asset = assets[layer.asset];
    if (!asset) throw new Error(`Raster asset ${layer.asset} is missing`);
    return { x: 0, y: 0, width: asset.w, height: asset.h };
  }
  if (layer.kind === 'text') {
    const lines = Math.max(1, layer.text.split('\n').length),
      lineHeight = Math.max(0.5, layer.lineHeight ?? 1.2);
    return {
      x: 0,
      y: 0,
      // boxWidth is the editable text box and is conservative for all alignments.
      width: Math.max(1, layer.boxWidth ?? 640),
      height: Math.max(1, lines * layer.fontSize * lineHeight),
    };
  }
  const stroke = Math.max(1, layer.stroke || 1);
  return {
    x: -stroke / 2,
    y: -stroke / 2,
    width: layer.width + stroke,
    height: layer.height + stroke,
  };
}

/** Return transformed painted bounds for one layer. */
export function layerBounds(layer: Layer, assets: Assets): PixelBounds {
  return transformedCorners(layerLocalBounds(layer, assets), layer.matrix);
}

function unionBounds(a: PixelBounds, b: PixelBounds): PixelBounds {
  const left = Math.min(a.x, b.x),
    top = Math.min(a.y, b.y),
    right = Math.max(a.x + a.width, b.x + b.width),
    bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Plan a Reveal All canvas expansion from transformed layer bounds. */
export function planRevealAll(
  frame: Pick<Frame, 'w' | 'h' | 'layers' | 'groups'>,
  assets: Assets,
  request: RevealAllRequest = {},
): RevealAllPlan {
  assertDimensions(frame.w, frame.h, 'Current canvas');
  const includeHidden = request.includeHidden === true;
  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  let bounds: PixelBounds = { x: 0, y: 0, width: frame.w, height: frame.h };
  const includedLayerIds: string[] = [];
  for (const layer of frame.layers) {
    const group = layer.groupId ? groups.get(layer.groupId) : undefined;
    if (
      !includeHidden &&
      (!layer.visible ||
        layer.opacity <= 0 ||
        (group !== undefined && (!group.visible || group.opacity <= 0)))
    )
      continue;
    const next = layerBounds(layer, assets);
    bounds = unionBounds(bounds, next);
    includedLayerIds.push(layer.id);
  }
  const left = Math.floor(bounds.x),
    top = Math.floor(bounds.y),
    right = Math.ceil(bounds.x + bounds.width),
    bottom = Math.ceil(bounds.y + bounds.height),
    width = right - left,
    height = bottom - top;
  assertDimensions(width, height, 'Reveal All canvas');
  const matrix: Matrix = [1, 0, 0, 1, -left, -top];
  if (!validMatrix(matrix)) throw new Error('Reveal All translation is invalid');
  return {
    width,
    height,
    offsetX: -left,
    offsetY: -top,
    matrix,
    changed: left !== 0 || top !== 0 || width !== frame.w || height !== frame.h,
    bounds: { x: left, y: top, width, height },
    includedLayerIds,
  };
}

/** Compatibility shape consumed by the Image > Reveal All command. */
export function revealAllBounds(
  frame: Pick<Frame, 'w' | 'h' | 'layers'>,
  assets: Assets,
): { left: number; top: number; right: number; bottom: number } {
  const bounds = planRevealAll(frame, assets).bounds;
  return {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
  };
}

/** Preserve print metadata when a canvas operation changes pixel dimensions. */
export function canvasSizeImageMetadata(frame: Pick<Frame, 'imageSize'>) {
  return effectiveImageSize(frame.imageSize);
}

/** Identity plan useful to callers that need an explicit no-op command record. */
export function noOpCanvasSize(width: number, height: number): CanvasSizePlan {
  assertDimensions(width, height, 'Canvas');
  return { width, height, offsetX: 0, offsetY: 0, matrix: identity(), changed: false };
}
