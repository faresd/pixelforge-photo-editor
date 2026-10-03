export const EXPORT_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Target-size controls are intentionally bounded so an invalid draft cannot
 * trigger an unbounded encoder/search loop or claim an impossible guarantee. */
export const MIN_EXPORT_TARGET_BYTES = 1024;
export const MAX_EXPORT_TARGET_BYTES = 64 * 1024 * 1024;
export const exportLabels: Record<ExportFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
};

export function validExportQuality(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  );
}

export function validExportTargetBytes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_EXPORT_TARGET_BYTES &&
    value <= MAX_EXPORT_TARGET_BYTES
  );
}

// Encode the composite, not the source file: no original EXIF/GPS metadata is copied.
// A browser may silently fall back to PNG for an unsupported MIME type; reject that
// result rather than download PNG bytes with a JPEG/WebP filename.
export async function encodeImage(
  image: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  if (!EXPORT_FORMATS.includes(format) || !validExportQuality(quality))
    throw new Error('Choose a supported format and quality from 1 to 100.');
  let output = image;
  if (format === 'jpeg') {
    output = image.ownerDocument.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const context = output.getContext('2d');
    if (!context)
      throw new Error('Image export is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0);
  }
  const mime = `image/${format}`;
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, mime, format === 'png' ? undefined : quality / 100),
  );
  if (!blob || blob.size === 0)
    throw new Error(
      'The browser could not encode this image. Your editable draft is kept.',
    );
  if (blob.type !== mime)
    throw new Error(
      `${exportLabels[format]} export is unavailable in this browser. Try PNG instead.`,
    );
  return blob;
}

export type TargetEncodeResult = {
  blob: Blob;
  /** The quality actually used for the encoded blob. */
  quality: number;
  targetBytes: number;
  /** False means even quality 1 could not fit; no dimensions were silently reduced. */
  targetMet: boolean;
};

/**
 * Encode a lossy format at the highest quality that fits a byte target.
 *
 * Browser encoders are asynchronous and their output is content dependent, so
 * this uses a bounded binary search over the integer quality range. The
 * returned blob is always a valid encode; `targetMet` makes an impossible
 * target explicit instead of silently changing dimensions or dropping pixels.
 */
export async function encodeImageForTarget(
  image: HTMLCanvasElement,
  format: ExportFormat,
  targetBytes: number,
): Promise<TargetEncodeResult> {
  if (format === 'png')
    throw new Error(
      'Target-size export requires JPEG or WebP; PNG quality is lossless.',
    );
  if (!validExportTargetBytes(targetBytes))
    throw new Error('Choose a target between 1 KB and 64 MB.');

  const maximum = await encodeImage(image, format, 100);
  if (maximum.size <= targetBytes)
    return { blob: maximum, quality: 100, targetBytes, targetMet: true };

  let low = 1;
  let high = 99;
  let best: { blob: Blob; quality: number } | undefined;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const blob = await encodeImage(image, format, quality);
    if (blob.size <= targetBytes) {
      best = { blob, quality };
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }
  if (best) return { ...best, targetBytes, targetMet: true };

  // Keep the user's pixels and dimensions when the request is impossible.
  const minimum = await encodeImage(image, format, 1);
  return {
    blob: minimum,
    quality: 1,
    targetBytes,
    targetMet: minimum.size <= targetBytes,
  };
}
