/**
 * Pure Image Size calculations shared by the dialog and document command.
 * PixelForge stores raster dimensions in pixels, while print dimensions are
 * derived from the document's resolution metadata. Keeping these conversions
 * outside React makes locale, bounds and resampling behavior testable without
 * a browser or a canvas implementation.
 */

export const IMAGE_SIZE_UNITS = [
  'pixels',
  'inches',
  'centimeters',
  'millimeters',
] as const;
export type ImageSizeUnit = (typeof IMAGE_SIZE_UNITS)[number];

export const RESOLUTION_UNITS = ['ppi', 'ppcm'] as const;
export type ResolutionUnit = (typeof RESOLUTION_UNITS)[number];

export const RESAMPLE_METHODS = ['automatic', 'nearest', 'bilinear'] as const;
export type ResampleMethod = (typeof RESAMPLE_METHODS)[number];

export const MAX_IMAGE_DIMENSION = 16000;
export const MAX_IMAGE_PIXELS = 16000000;
export const MIN_RESOLUTION = 1;
export const MAX_RESOLUTION = 2400;

export type ImageSizeMetadata = {
  resolution: number;
  resolutionUnit: ResolutionUnit;
};

export const DEFAULT_IMAGE_SIZE: ImageSizeMetadata = {
  resolution: 72,
  resolutionUnit: 'ppi',
};

export type ImageSizeRequest = {
  width: number;
  height: number;
  widthUnit: ImageSizeUnit;
  heightUnit: ImageSizeUnit;
  resolution: number;
  resolutionUnit: ResolutionUnit;
  resample: boolean;
  method: ResampleMethod;
};

export type ImageSizePlan = {
  width: number;
  height: number;
  imageSize: ImageSizeMetadata;
  resample: boolean;
  method: ResampleMethod;
};

/** Parse a decimal text field from either a dot or the locale comma form. */
export function imageSizeDecimal(value: string): number {
  const text = value.trim();
  if (!/^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN;
  return Number(text.replace(',', '.'));
}

/** Convert a resolution value to pixels per inch for physical conversions. */
export function resolutionInPpi(
  resolution: number,
  unit: ResolutionUnit,
): number {
  return unit === 'ppcm' ? resolution * 2.54 : resolution;
}

function inchesPerUnit(unit: ImageSizeUnit): number {
  if (unit === 'inches') return 1;
  if (unit === 'centimeters') return 1 / 2.54;
  if (unit === 'millimeters') return 1 / 25.4;
  return 0;
}

/** Convert a display value to pixels, preserving fractional precision. */
export function imageSizeToPixels(
  value: number,
  unit: ImageSizeUnit,
  metadata: ImageSizeMetadata,
): number {
  if (!Number.isFinite(value) || value <= 0) return NaN;
  if (unit === 'pixels') return value;
  return value * inchesPerUnit(unit) * resolutionInPpi(metadata.resolution, metadata.resolutionUnit);
}

/** Convert pixels to the selected display unit. */
export function pixelsToImageSize(
  pixels: number,
  unit: ImageSizeUnit,
  metadata: ImageSizeMetadata,
): number {
  if (!Number.isFinite(pixels) || pixels <= 0) return NaN;
  if (unit === 'pixels') return pixels;
  return pixels / (inchesPerUnit(unit) * resolutionInPpi(metadata.resolution, metadata.resolutionUnit));
}

export function validImageSizeMetadata(value: unknown): value is ImageSizeMetadata {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ImageSizeMetadata>;
  return (
    typeof candidate.resolution === 'number' &&
    Number.isFinite(candidate.resolution) &&
    candidate.resolution >= MIN_RESOLUTION &&
    candidate.resolution <= MAX_RESOLUTION &&
    RESOLUTION_UNITS.includes(candidate.resolutionUnit as ResolutionUnit)
  );
}

export function effectiveImageSize(value: Partial<ImageSizeMetadata> | undefined): ImageSizeMetadata {
  const candidate = {
    ...DEFAULT_IMAGE_SIZE,
    ...value,
  };
  return validImageSizeMetadata(candidate) ? candidate : { ...DEFAULT_IMAGE_SIZE };
}

function validPixels(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION;
}

/**
 * Resolve a dialog request into bounded pixel dimensions and metadata.
 * With resample disabled, dimensions are intentionally retained and only the
 * print metadata changes. This is the key Photoshop-style resolution-only
 * behavior and prevents accidental pixel loss.
 */
export function planImageSize(
  currentWidth: number,
  currentHeight: number,
  currentImageSize: Partial<ImageSizeMetadata> | undefined,
  request: ImageSizeRequest,
): ImageSizePlan {
  if (!validPixels(currentWidth) || !validPixels(currentHeight))
    throw new Error('Current image dimensions are invalid');
  const requestedMetadata = {
    resolution: request.resolution,
    resolutionUnit: request.resolutionUnit,
  };
  if (!validImageSizeMetadata(requestedMetadata))
    throw new Error('Resolution must be between 1 and 2,400');
  if (
    !IMAGE_SIZE_UNITS.includes(request.widthUnit) ||
    !IMAGE_SIZE_UNITS.includes(request.heightUnit) ||
    !RESAMPLE_METHODS.includes(request.method) ||
    typeof request.resample !== 'boolean' ||
    !Number.isFinite(request.width) ||
    !Number.isFinite(request.height) ||
    request.width <= 0 ||
    request.height <= 0
  )
    throw new Error('Image Size values are invalid');

  const width = Math.round(imageSizeToPixels(request.width, request.widthUnit, requestedMetadata));
  const height = Math.round(imageSizeToPixels(request.height, request.heightUnit, requestedMetadata));
  if (!validPixels(width) || !validPixels(height) || width * height > MAX_IMAGE_PIXELS)
    throw new Error('Choose dimensions up to 16,000 pixels and 16 megapixels total');
  if (!request.resample)
    return {
      width: currentWidth,
      height: currentHeight,
      imageSize: requestedMetadata,
      resample: false,
      method: request.method,
    };
  return { width, height, imageSize: requestedMetadata, resample: true, method: request.method };
}

export function imageSizeMegapixels(width: number, height: number): number {
  return (width * height) / 1000000;
}
