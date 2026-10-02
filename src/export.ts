export const EXPORT_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const exportLabels: Record<ExportFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
};

export function validExportQuality(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
}

// Encode the composite, not the source file: no original EXIF/GPS metadata is copied.
// A browser may silently fall back to PNG for an unsupported MIME type; reject that
// result rather than download PNG bytes with a JPEG/WebP filename.
export async function encodeImage(image: HTMLCanvasElement, format: ExportFormat, quality: number): Promise<Blob> {
  if (!EXPORT_FORMATS.includes(format) || !validExportQuality(quality))
    throw new Error('Choose a supported format and quality from 1 to 100.');
  let output = image;
  if (format === 'jpeg') {
    output = image.ownerDocument.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0);
  }
  const mime = `image/${format}`;
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, mime, format === 'png' ? undefined : quality / 100),
  );
  if (!blob || blob.size === 0) throw new Error('The browser could not encode this image. Your editable draft is kept.');
  if (blob.type !== mime) throw new Error(`${exportLabels[format]} export is unavailable in this browser. Try PNG instead.`);
  return blob;
}
