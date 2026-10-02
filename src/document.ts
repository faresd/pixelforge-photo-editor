/** Version 2 stores immutable raster assets once; history contains editable layer metadata. */
export const BLENDS = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
] as const;
export const FONTS = ['Arial', 'Georgia', 'Courier New', 'Verdana'] as const;
export type Matrix = [number, number, number, number, number, number];
export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  filter: string;
};
export const neutral: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  filter: 'none',
};
export const FILTER_VALUES = [
  'none',
  'saturate(1.45) contrast(1.08)',
  'grayscale(1) contrast(1.12)',
  'sepia(.35) saturate(1.2)',
  'hue-rotate(18deg) saturate(.9)',
];
type Common = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: (typeof BLENDS)[number];
  matrix: Matrix;
  adjustments: Adjustments;
  /** Optional canvas-space alpha mask asset. Source pixels remain untouched. */
  mask?: string;
};
export type Layer = Common &
  (
    | { kind: 'raster'; asset: string }
    | {
        kind: 'text';
        text: string;
        color: string;
        fontSize: number;
        fontFamily: (typeof FONTS)[number];
        bold: boolean;
      }
    | {
        kind: 'rectangle';
        width: number;
        height: number;
        color: string;
        stroke: number;
        fill: boolean;
      }
    | {
        kind: 'ellipse';
        width: number;
        height: number;
        color: string;
        stroke: number;
        fill: boolean;
      }
  );
export type SelectionOperation = 'replace' | 'add' | 'subtract' | 'intersect';
export type SelectionPart = {
  shape: 'rectangle' | 'ellipse' | 'polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  operation: SelectionOperation;
  points?: { x: number; y: number }[];
};
export type Selection = {
  shape: SelectionPart['shape'];
  x: number;
  y: number;
  w: number;
  h: number;
  feather: number;
  inverted: boolean;
  points?: { x: number; y: number }[];
  parts?: SelectionPart[];
};
export type Frame = {
  w: number;
  h: number;
  layers: Layer[];
  active: string;
  selection?: Selection;
};
export type Asset = { url: string; w: number; h: number };
export type Assets = Record<string, Asset>;
export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
export const commonLayer = (name: string): Common => ({
  id: crypto.randomUUID(),
  name,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: identity(),
  adjustments: { ...neutral },
});
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export const transformFrame = (
  frame: Frame,
  matrix: Matrix,
  w = frame.w,
  h = frame.h,
): Frame => ({
  ...frame,
  w,
  h,
  selection: undefined,
  layers: frame.layers.map((layer) => ({
    ...layer,
    matrix: multiply(matrix, layer.matrix),
  })),
});
export const filterCSS = (a: Adjustments) =>
  `${a.filter === 'none' ? '' : a.filter} brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) blur(${a.blur}px)`;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const short = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max;
export const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
export function validAdjustments(v: unknown): v is Adjustments {
  return (
    record(v) &&
    number(v.brightness, 0, 200) &&
    number(v.contrast, 0, 200) &&
    number(v.saturation, 0, 200) &&
    number(v.blur, 0, 20) &&
    typeof v.filter === 'string' &&
    FILTER_VALUES.includes(v.filter)
  );
}
export function validAsset(value: unknown): value is Asset {
  if (
    !record(value) ||
    !integer(value.w, 1, 16000) ||
    !integer(value.h, 1, 16000) ||
    Number(value.w) * Number(value.h) > 16000000 ||
    typeof value.url !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.url)
  )
    return false;
  // Verify the PNG header before decoding a potentially oversized bitmap.
  try {
    const header = atob(value.url.slice(22, 66));
    const bytes = Uint8Array.from(header, (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    return (
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a &&
      view.getUint32(12) === 0x49484452 &&
      view.getUint32(16) === value.w &&
      view.getUint32(20) === value.h
    );
  } catch {
    return false;
  }
}
export function validateFrame(
  value: unknown,
  assets: Assets,
): asserts value is Frame {
  const fail = () => {
    throw new Error('Invalid layer document');
  };
  if (
    !record(value) ||
    !integer(value.w, 1, 16000) ||
    !integer(value.h, 1, 16000) ||
    Number(value.w) * Number(value.h) > 16000000 ||
    !Array.isArray(value.layers) ||
    !value.layers.length ||
    value.layers.length > 32
  )
    return fail();
  const ids = new Set<string>();
  let pixels = 0;
  for (const layer of value.layers) {
    if (
      !record(layer) ||
      !validId(layer.id) ||
      ids.has(layer.id) ||
      !short(layer.name, 160) ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.locked !== 'boolean' ||
      !number(layer.opacity, 0, 1) ||
      !BLENDS.includes(layer.blend as (typeof BLENDS)[number]) ||
      !Array.isArray(layer.matrix) ||
      layer.matrix.length !== 6 ||
      !layer.matrix.every((v) => number(v, -1000000, 1000000)) ||
      !validAdjustments(layer.adjustments)
    )
      return fail();
    const m = layer.matrix as Matrix;
    if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 0.000000000001) return fail();
    ids.add(layer.id);
    if (layer.kind === 'raster') {
      if (!validId(layer.asset) || !Object.hasOwn(assets, layer.asset))
        return fail();
      if (
        layer.mask !== undefined &&
        (!validId(layer.mask) ||
          !Object.hasOwn(assets, layer.mask) ||
          assets[layer.mask].w !== value.w ||
          assets[layer.mask].h !== value.h)
      )
        return fail();
      pixels += assets[layer.asset].w * assets[layer.asset].h;
    } else if (layer.kind === 'text') {
      if (
        !short(layer.text, 10000) ||
        !/^#[a-f\d]{6}$/i.test(String(layer.color)) ||
        !number(layer.fontSize, 1, 1000) ||
        !FONTS.includes(layer.fontFamily as (typeof FONTS)[number]) ||
        typeof layer.bold !== 'boolean'
      )
        return fail();
    } else if (layer.kind === 'rectangle' || layer.kind === 'ellipse') {
      if (
        !number(layer.width, 1, 16000) ||
        !number(layer.height, 1, 16000) ||
        !number(layer.stroke, 1, 100) ||
        !/^#[a-f\d]{6}$/i.test(String(layer.color)) ||
        typeof layer.fill !== 'boolean'
      )
        return fail();
    } else return fail();
  }
  const selection = value.selection;
  if (selection !== undefined) {
    if (!record(selection)) return fail();
    const s = selection as Record<string, unknown>,
      frameWidth = Number(value.w),
      frameHeight = Number(value.h);
    const validPart = (part: unknown, requireOperation: boolean) => {
      if (!record(part)) return false;
      const p = part as Record<string, unknown>;
      return (
        ['rectangle', 'ellipse', 'polygon'].includes(String(p.shape)) &&
        number(p.x, 0, frameWidth) &&
        number(p.y, 0, frameHeight) &&
        number(p.w, 1, frameWidth) &&
        number(p.h, 1, frameHeight) &&
        Number(p.x) + Number(p.w) <= frameWidth &&
        Number(p.y) + Number(p.h) <= frameHeight &&
        (!requireOperation ||
          ['replace', 'add', 'subtract', 'intersect'].includes(String(p.operation))) &&
        (p.shape !== 'polygon' ||
          (Array.isArray(p.points) &&
            p.points.length >= 3 &&
            p.points.length <= 10000 &&
            p.points.every(
              (point) =>
                record(point) &&
                number(point.x, 0, frameWidth) &&
                number(point.y, 0, frameHeight),
            )))
      );
    };
    if (
      !validPart({ ...s, operation: 'replace' }, false) ||
      !number(s.feather, 0, 1000) ||
      typeof s.inverted !== 'boolean' ||
      (s.parts !== undefined &&
        (!Array.isArray(s.parts) ||
          s.parts.length < 1 ||
          s.parts.length > 1000 ||
          s.parts.some((part) => !validPart(part, true))))
    )
      return fail();
  }
  if (pixels > 64000000 || !validId(value.active) || !ids.has(value.active))
    return fail();
}
export function referencedAssets(history: Frame[], assets: Assets): Assets {
  const used: Assets = {};
  for (const frame of history)
    for (const layer of frame.layers)
      if (layer.kind === 'raster') {
        used[layer.asset] = assets[layer.asset];
        if (layer.mask) used[layer.mask] = assets[layer.mask];
      }
  return used;
}
export function addAsset(assets: Assets, canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL();
  const existing = Object.keys(assets).find((id) => assets[id].url === url);
  if (existing) return existing;
  const id = crypto.randomUUID();
  assets[id] = { url, w: canvas.width, h: canvas.height };
  return id;
}
export function rasterFrame(
  canvas: HTMLCanvasElement,
  assets: Assets,
  name = 'Background',
): Frame {
  const layer: Layer = {
    ...commonLayer(name),
    kind: 'raster',
    asset: addAsset(assets, canvas),
  };
  return {
    w: canvas.width,
    h: canvas.height,
    layers: [layer],
    active: layer.id,
  };
}
const decoded = new Map<Asset, Promise<HTMLImageElement>>();
export function decodeAsset(asset: Asset): Promise<HTMLImageElement> {
  const cached = decoded.get(asset);
  if (cached) {
    decoded.delete(asset);
    decoded.set(asset, cached);
    return cached;
  }
  const pending = decodeNewAsset(asset);
  decoded.set(asset, pending);
  let pixels = Array.from(decoded.keys()).reduce(
    (sum, item) => sum + item.w * item.h,
    0,
  );
  while (pixels > 64000000 && decoded.size > 1) {
    const oldest = decoded.keys().next().value!;
    pixels -= oldest.w * oldest.h;
    decoded.delete(oldest);
  }
  return pending;
}
async function decodeNewAsset(asset: Asset) {
  if (!validAsset(asset)) throw new Error('Invalid or oversized project image');
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  if (image.naturalWidth !== asset.w || image.naturalHeight !== asset.h)
    throw new Error('Project image dimensions do not match');
  return image;
}
export function surface(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
/** Paints a contiguous region, preserving antialias-free source pixels for undo. */
export function floodFill(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  color: string,
  tolerance = 24,
) {
  const context = canvas.getContext('2d')!,
    image = context.getImageData(0, 0, canvas.width, canvas.height),
    data = image.data,
    startX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x))),
    startY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y))),
    start = (startY * canvas.width + startX) * 4,
    target = [data[start], data[start + 1], data[start + 2], data[start + 3]],
    match = color.match(/^#([a-f\d]{6})$/i);
  if (!match) throw new Error('Fill color is invalid');
  const replacement = [
    parseInt(match[1].slice(0, 2), 16),
    parseInt(match[1].slice(2, 4), 16),
    parseInt(match[1].slice(4, 6), 16),
    255,
  ];
  const same = (index: number) =>
    Math.max(
      Math.abs(data[index] - target[0]),
      Math.abs(data[index + 1] - target[1]),
      Math.abs(data[index + 2] - target[2]),
      Math.abs(data[index + 3] - target[3]),
    ) <= tolerance;
  if (!same(start)) return false;
  const seen = new Uint8Array(canvas.width * canvas.height), queue = [startX, startY];
  while (queue.length) {
    const cy = queue.pop()!, cx = queue.pop()!, offset = (cy * canvas.width + cx) * 4;
    if (seen[cy * canvas.width + cx] || !same(offset)) continue;
    seen[cy * canvas.width + cx] = 1;
    data.set(replacement, offset);
    if (cx > 0) queue.push(cx - 1, cy);
    if (cx + 1 < canvas.width) queue.push(cx + 1, cy);
    if (cy > 0) queue.push(cx, cy - 1);
    if (cy + 1 < canvas.height) queue.push(cx, cy + 1);
  }
  context.putImageData(image, 0, 0);
  return true;
}
/** Render into an isolated surface. Callers publish only the newest completed render. */
export async function renderFrame(
  frame: Frame,
  assets: Assets,
  overrides?: Record<string, HTMLCanvasElement>,
): Promise<HTMLCanvasElement> {
  const out = surface(frame.w, frame.h),
    context = out.getContext('2d')!;
  for (const layer of frame.layers) {
    if (!layer.visible) continue;
    const override = overrides?.[layer.id];
    const image =
      layer.kind === 'raster' && !override
        ? await decodeAsset(assets[layer.asset])
        : undefined;
    if (layer.kind === 'raster' && layer.mask && image) {
      const masked = surface(frame.w, frame.h),
        maskContext = masked.getContext('2d')!;
      maskContext.save();
      maskContext.setTransform(...layer.matrix);
      maskContext.globalAlpha = 1;
      maskContext.globalCompositeOperation = 'source-over';
      maskContext.filter = filterCSS(layer.adjustments);
      maskContext.drawImage(image, 0, 0);
      maskContext.restore();
      const maskImage = await decodeAsset(assets[layer.mask]);
      maskContext.save();
      maskContext.globalCompositeOperation = 'destination-in';
      maskContext.setTransform(1, 0, 0, 1, 0, 0);
      maskContext.drawImage(maskImage, 0, 0);
      maskContext.restore();
      context.save();
      context.globalAlpha = layer.opacity;
      context.globalCompositeOperation = layer.blend;
      context.drawImage(masked, 0, 0);
      context.restore();
      continue;
    }
    context.save();
    context.setTransform(...layer.matrix);
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = layer.blend;
    context.filter = filterCSS(layer.adjustments);
    if (override) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(override, 0, 0);
      context.restore();
      continue;
    }
    if (layer.kind === 'raster' && image) context.drawImage(image, 0, 0);
    if (layer.kind === 'text') {
      context.fillStyle = layer.color;
      context.font = `${layer.bold ? '700' : '400'} ${layer.fontSize}px "${layer.fontFamily}"`;
      context.textBaseline = 'top';
      layer.text
        .split('\n')
        .forEach((line, i) =>
          context.fillText(line, 0, i * layer.fontSize * 1.2),
        );
    }
    if (layer.kind === 'rectangle') {
      context.fillStyle = layer.color;
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      if (layer.fill) context.fillRect(0, 0, layer.width, layer.height);
      else context.strokeRect(0, 0, layer.width, layer.height);
    }
    if (layer.kind === 'ellipse') {
      context.fillStyle = layer.color;
      context.strokeStyle = layer.color;
      context.lineWidth = layer.stroke;
      context.beginPath();
      context.ellipse(layer.width / 2, layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
      if (layer.fill) context.fill();
      else context.stroke();
    }
    context.restore();
  }
  return out;
}
