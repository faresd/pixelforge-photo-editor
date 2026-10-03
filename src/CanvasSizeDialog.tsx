import { useEffect, useRef, useState } from 'react';
import type { CanvasAnchor, CanvasSizeRequest } from './canvasSize';

type Props = {
  width: number;
  height: number;
  close: () => void;
  apply: (request: CanvasSizeRequest) => void;
};

const anchors: Array<[CanvasAnchor, string]> = [
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['middle-left', 'Middle left'],
  ['center', 'Center'],
  ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
];

export default function CanvasSizeDialog({ width, height, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [anchor, setAnchor] = useState<CanvasAnchor>('center');
  const parsedWidth = Number(w), parsedHeight = Number(h);
  const valid = Number.isInteger(parsedWidth) && parsedWidth >= 1 && parsedWidth <= 16000 && Number.isInteger(parsedHeight) && parsedHeight >= 1 && parsedHeight <= 16000 && parsedWidth * parsedHeight <= 16000000;
  useEffect(() => {
    const target = dialog.current;
    if (!target) return;
    target.showModal();
    const onCancel = (event: Event) => { event.preventDefault(); close(); };
    target.addEventListener('cancel', onCancel);
    return () => target.removeEventListener('cancel', onCancel);
  }, [close]);
  return (
    <dialog ref={dialog} className="editor-dialog canvas-size-dialog" onClose={close}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); if (valid) apply({ width: parsedWidth, height: parsedHeight, anchor }); }}>
        <h2>Canvas Size</h2>
        <p>Change the document canvas without resampling layer pixels. The anchor controls where existing artwork stays when the canvas expands or shrinks.</p>
        <div className="resize-size-row">
          <label><span>Width (px)</span><input aria-label="Width (px)" type="number" min="1" max="16000" step="1" value={w} onChange={(event) => setW(event.target.value)} /></label>
          <label>Pixels<select aria-label="Width unit" disabled><option>Pixels</option></select></label>
        </div>
        <div className="resize-size-row">
          <label><span>Height (px)</span><input aria-label="Height (px)" type="number" min="1" max="16000" step="1" value={h} onChange={(event) => setH(event.target.value)} /></label>
          <label>Pixels<select aria-label="Height unit" disabled><option>Pixels</option></select></label>
        </div>
        <label><span>Anchor</span><select aria-label="Anchor" value={anchor} onChange={(event) => setAnchor(event.target.value as CanvasAnchor)}>{anchors.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="anchor-preview" aria-label="Canvas anchor preview">{anchors.map(([value]) => <span key={value} className={anchor === value ? 'selected' : ''} />)}</div>
        {!valid && <p role="alert" className="resize-error">Choose whole dimensions up to 16,000 pixels and 16 megapixels total.</p>}
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!valid}>Apply canvas size</button></div>
      </form>
    </dialog>
  );
}
