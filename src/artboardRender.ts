import {
  artboardLayers,
  effectiveArtboards,
  validArtboards,
  type Artboard,
} from './artboards.ts';
import {
  renderFrame,
  surface,
  validateFrame,
  type Assets,
  type Frame,
  type RenderOptions,
} from './document.ts';
import {
  encodeImage,
  encodeImageForTarget,
  type ExportFormat,
} from './export.ts';

/** A bounded target for rendering one named viewport. */
export type ArtboardId = string | undefined;

/**
 * Resolve a named artboard without allocating a pixel buffer.
 *
 * Legacy frames have no `artboards` field. They resolve to the deterministic
 * virtual Canvas viewport, so callers can use this API for every document
 * without a special-case that changes legacy export dimensions.
 */
export function resolveArtboard(frame: Frame, artboardId?: ArtboardId): Artboard {
  if (
    !validArtboards(
      frame.artboards ?? [],
      frame.w,
      frame.h,
      frame.activeArtboardId,
      frame.layers.map((layer) => layer.id),
    )
  )
    throw new Error('Artboard metadata is invalid');
  const list = effectiveArtboards(frame.w, frame.h, frame.artboards);
  const id = artboardId ?? frame.activeArtboardId ?? list[0]?.id;
  const artboard = list.find((item) => item.id === id);
  if (!artboard) throw new Error('The requested artboard does not exist');
  if (!artboard.visible) throw new Error('The requested artboard is hidden');
  return { ...artboard };
}

function assertNotCancelled(options?: RenderOptions): void {
  if (options?.isCancelled?.()) {
    const error =
      typeof DOMException === 'function'
        ? new DOMException('Artboard rendering cancelled', 'AbortError')
        : Object.assign(new Error('Artboard rendering cancelled'), {
            name: 'AbortError',
          });
    throw error;
  }
}

export type ArtboardRenderResult = {
  canvas: HTMLCanvasElement;
  artboard: Artboard;
};

/**
 * Render one artboard into a fresh, pixel-aligned canvas.
 *
 * A selected membership tree is rendered through the normal full-frame
 * compositor before the requested frame-space viewport is copied into a new
 * surface. This keeps transforms, masks, groups and effects on the same
 * renderer path, while source assets, matrices and history remain untouched.
 * A solid artboard background is painted underneath transparent composite
 * pixels, matching the persisted swatch while keeping the source transparent.
 * The subset path deliberately retains a full-frame intermediate allocation;
 * this is a bounded viewport operation, not tiled or independent multi-canvas
 * compositing.
 */
export async function renderArtboard(
  frame: Frame,
  assets: Assets,
  artboardId?: ArtboardId,
  options?: RenderOptions,
): Promise<ArtboardRenderResult> {
  validateFrame(frame, assets);
  const artboard = resolveArtboard(frame, artboardId);
  assertNotCancelled(options);
  const membership = artboardLayers(frame, artboard);
  // Omitted membership preserves the exact legacy/full-canvas render. An
  // explicit membership list uses a safe layer/group subset, including the
  // intentional empty-list transparent render, before viewport cropping.
  const renderFrameInput =
    artboard.layerIds === undefined
      ? frame
      : {
          ...frame,
          layers: membership.layers,
          groups: membership.groups,
          active: membership.layers[0]?.id ?? frame.active,
        };
  const composite = await renderFrame(renderFrameInput, assets, undefined, options);
  assertNotCancelled(options);
  const output = surface(artboard.w, artboard.h);
  const context = output.getContext('2d');
  if (!context) throw new Error('Artboard rendering is unavailable in this browser.');
  context.imageSmoothingEnabled = false;
  if (artboard.background) {
    context.fillStyle = artboard.background;
    context.fillRect(0, 0, artboard.w, artboard.h);
  }
  context.drawImage(
    composite,
    artboard.x,
    artboard.y,
    artboard.w,
    artboard.h,
    0,
    0,
    artboard.w,
    artboard.h,
  );
  return { canvas: output, artboard };
}

export type ArtboardExportResult = {
  blob: Blob;
  artboard: Artboard;
  format: ExportFormat;
  quality: number;
  targetBytes?: number;
  targetMet: boolean;
};

/** Encode the active/named artboard while preserving the normal export rules. */
export async function exportArtboard(
  frame: Frame,
  assets: Assets,
  artboardId: ArtboardId,
  format: ExportFormat,
  quality: number,
  targetBytes?: number,
  options?: RenderOptions,
): Promise<ArtboardExportResult> {
  const rendered = await renderArtboard(frame, assets, artboardId, options);
  const encoded =
    targetBytes !== undefined
      ? await encodeImageForTarget(rendered.canvas, format, targetBytes)
      : {
          blob: await encodeImage(rendered.canvas, format, quality),
          quality,
          targetMet: true,
        };
  return {
    blob: encoded.blob,
    artboard: rendered.artboard,
    format,
    quality: encoded.quality,
    ...(targetBytes === undefined ? {} : { targetBytes }),
    targetMet: encoded.targetMet,
  };
}
