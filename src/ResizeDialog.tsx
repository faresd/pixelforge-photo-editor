import { useEffect, useRef, useState } from 'react';
import {
  effectiveImageSize,
  imageSizeDecimal,
  imageSizeMegapixels,
  imageSizeToPixels,
  IMAGE_SIZE_UNITS,
  pixelsToImageSize,
  planImageSize,
  RESAMPLE_METHODS,
  RESOLUTION_UNITS,
  type ImageSizeMetadata,
  type ImageSizeRequest,
} from './imageSize';

const unitLabels = { pixels: 'Pixels', inches: 'Inches', centimeters: 'Centimeters', millimeters: 'Millimeters' } as const;
const unitSuffix = { pixels: 'px', inches: 'in', centimeters: 'cm', millimeters: 'mm' } as const;
const format = (value: number, unit: (typeof IMAGE_SIZE_UNITS)[number]) => {
  if (!Number.isFinite(value)) return '';
  return unit === 'pixels' ? String(Math.round(value)) : value.toFixed(2);
};

type ResizeDialogProps = {
  width: number;
  height: number;
  imageSize?: Partial<ImageSizeMetadata>;
  close: () => void;
  apply: (request: ImageSizeRequest) => void;
};

export default function ResizeDialog({ width, height, imageSize, close, apply }: ResizeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initial = effectiveImageSize(imageSize);
  const [metadata, setMetadata] = useState<ImageSizeMetadata>(initial);
  const [widthUnit, setWidthUnit] = useState<(typeof IMAGE_SIZE_UNITS)[number]>('pixels');
  const [heightUnit, setHeightUnit] = useState<(typeof IMAGE_SIZE_UNITS)[number]>('pixels');
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [resolution, setResolution] = useState(String(initial.resolution));
  const [locked, setLocked] = useState(true);
  const [resample, setResample] = useState(true);
  const [method, setMethod] = useState<(typeof RESAMPLE_METHODS)[number]>('automatic');
  useEffect(() => { dialog.current?.showModal(); }, []);

  const readPixels = (value: string, unit: typeof widthUnit, meta = metadata) => {
    const numeric = imageSizeDecimal(value);
    return Number.isFinite(numeric) ? imageSizeToPixels(numeric, unit, meta) : NaN;
  };
  const update = (value: string, axis: 'width' | 'height') => {
    if (axis === 'width') {
      setW(value);
      if (locked) {
        const pixels = readPixels(value, widthUnit);
        if (Number.isFinite(pixels) && pixels > 0) setH(format(pixelsToImageSize(pixels * height / width, heightUnit, metadata), heightUnit));
      }
    } else {
      setH(value);
      if (locked) {
        const pixels = readPixels(value, heightUnit);
        if (Number.isFinite(pixels) && pixels > 0) setW(format(pixelsToImageSize(pixels * width / height, widthUnit, metadata), widthUnit));
      }
    }
  };
  const changeUnit = (axis: 'width' | 'height', unit: typeof widthUnit) => {
    if (axis === 'width') {
      const pixels = readPixels(w, widthUnit);
      setWidthUnit(unit);
      if (Number.isFinite(pixels)) setW(format(pixelsToImageSize(pixels, unit, metadata), unit));
    } else {
      const pixels = readPixels(h, heightUnit);
      setHeightUnit(unit);
      if (Number.isFinite(pixels)) setH(format(pixelsToImageSize(pixels, unit, metadata), unit));
    }
  };
  const changeResolution = (value: string) => {
    const previous = metadata;
    setResolution(value);
    const numeric = imageSizeDecimal(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const next = { resolution: numeric, resolutionUnit: metadata.resolutionUnit } as ImageSizeMetadata;
    const widthPixels = readPixels(w, widthUnit, previous), heightPixels = readPixels(h, heightUnit, previous);
    setMetadata(next);
    if (Number.isFinite(widthPixels) && widthUnit !== 'pixels') setW(format(pixelsToImageSize(widthPixels, widthUnit, next), widthUnit));
    if (Number.isFinite(heightPixels) && heightUnit !== 'pixels') setH(format(pixelsToImageSize(heightPixels, heightUnit, next), heightUnit));
  };
  const changeResolutionUnit = (unit: ImageSizeMetadata['resolutionUnit']) => {
    const previous = metadata;
    const widthPixels = readPixels(w, widthUnit, previous), heightPixels = readPixels(h, heightUnit, previous);
    const next = { ...metadata, resolutionUnit: unit };
    setMetadata(next);
    if (widthUnit !== 'pixels' && Number.isFinite(widthPixels)) setW(format(pixelsToImageSize(widthPixels, widthUnit, next), widthUnit));
    if (heightUnit !== 'pixels' && Number.isFinite(heightPixels)) setH(format(pixelsToImageSize(heightPixels, heightUnit, next), heightUnit));
  };
  const request: ImageSizeRequest = {
    width: imageSizeDecimal(w), height: imageSizeDecimal(h), widthUnit, heightUnit,
    resolution: imageSizeDecimal(resolution), resolutionUnit: metadata.resolutionUnit,
    resample, method,
  };
  let error = '';
  try { planImageSize(width, height, initial, request); } catch (reason) { error = reason instanceof Error ? reason.message : 'Image Size values are invalid'; }
  const valid = !error;
  const preview = (() => {
    try {
      const plan = planImageSize(width, height, initial, request);
      return `${plan.width} × ${plan.height} px · ${imageSizeMegapixels(plan.width, plan.height).toFixed(2)} MP`;
    } catch {
      return 'Enter valid dimensions to preview';
    }
  })();
  const label = (unit: typeof widthUnit) => unitSuffix[unit];
  return <dialog ref={dialog} className="editor-dialog image-size-dialog" onCancel={close}>
    <form onSubmit={event => { event.preventDefault(); if (valid) apply(request); }}>
      <h2>Image Size</h2><h3>Resize image</h3>
      <p>Set print dimensions and resolution, or resample the editable pixels. This change can be undone.</p>
      <div className="image-size-grid">
        <label>Width ({label(widthUnit)})<input aria-label={`Width (${label(widthUnit)})`} type="text" inputMode="decimal" value={w} onChange={event => update(event.target.value, 'width')} /></label>
        <label>Unit<select aria-label="Width unit" value={widthUnit} onChange={event => changeUnit('width', event.target.value as typeof widthUnit)}>{IMAGE_SIZE_UNITS.map(unit => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}</select></label>
        <label>Height ({label(heightUnit)})<input aria-label={`Height (${label(heightUnit)})`} type="text" inputMode="decimal" value={h} onChange={event => update(event.target.value, 'height')} /></label>
        <label>Unit<select aria-label="Height unit" value={heightUnit} onChange={event => changeUnit('height', event.target.value as typeof heightUnit)}>{IMAGE_SIZE_UNITS.map(unit => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}</select></label>
      </div>
      <label className="resize-lock"><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} />Keep proportions</label>
      <label>Resolution<input aria-label="Resolution" type="text" inputMode="decimal" value={resolution} onChange={event => changeResolution(event.target.value)} /><select aria-label="Resolution unit" value={metadata.resolutionUnit} onChange={event => changeResolutionUnit(event.target.value as ImageSizeMetadata['resolutionUnit'])}>{RESOLUTION_UNITS.map(unit => <option key={unit} value={unit}>{unit === 'ppi' ? 'Pixels/Inch' : 'Pixels/Centimeter'}</option>)}</select></label>
      <label className="resize-lock"><input aria-label="Resample" type="checkbox" checked={resample} onChange={event => setResample(event.target.checked)} />Resample</label>
      <label>Resample method<select aria-label="Resample method" disabled={!resample} value={method} onChange={event => setMethod(event.target.value as typeof method)}>{RESAMPLE_METHODS.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Fit To<select aria-label="Fit To" defaultValue="Original Size" onChange={event => { const value = event.target.value; if (value === 'Original Size') { setWidthUnit('pixels'); setHeightUnit('pixels'); setW(String(width)); setH(String(height)); } else { const percent = Number(value); setWidthUnit('pixels'); setHeightUnit('pixels'); setW(String(Math.max(1, Math.round(width * percent / 100)))); setH(String(Math.max(1, Math.round(height * percent / 100)))); } }}><option>Original Size</option><option value="25">25%</option><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></select></label>
      <output aria-live="polite">Preview: {preview}</output>
      {!resample && <output>Resampling off: pixel dimensions stay {width} × {height}; only print metadata changes.</output>}
      <div className="resize-presets">{[50, 75, 150, 200].map(percent => <button type="button" key={percent} onClick={() => { setWidthUnit('pixels'); setHeightUnit('pixels'); setW(String(Math.round(width * percent / 100))); setH(String(Math.round(height * percent / 100))); }}>{percent}%</button>)}</div>
      {error && <p role="alert" className="resize-error">{error.includes('Image Size values are invalid') || error.startsWith('Choose dimensions') ? 'Choose whole dimensions up to 16,000 pixels and 16 megapixels total.' : error}</p>}
      <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!valid}>Apply resize</button></div>
    </form>
  </dialog>;
}
