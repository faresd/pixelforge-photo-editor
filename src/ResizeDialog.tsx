import { useEffect, useRef, useState } from 'react';

export default function ResizeDialog({ width, height, close, apply }: { width: number; height: number; close: () => void; apply: (width: number, height: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [w, setW] = useState(String(width)), [h, setH] = useState(String(height)), [locked, setLocked] = useState(true);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const update = (value: string, axis: 'width' | 'height') => {
    if (axis === 'width') { setW(value); if (locked && Number(value) > 0) setH(String(Math.max(1, Math.round(Number(value) * height / width)))); }
    else { setH(value); if (locked && Number(value) > 0) setW(String(Math.max(1, Math.round(Number(value) * width / height)))); }
  };
  const valid = Number.isInteger(Number(w)) && Number.isInteger(Number(h)) && Number(w) > 0 && Number(h) > 0 && Number(w) <= 16000 && Number(h) <= 16000 && Number(w) * Number(h) <= 16000000;
  return <dialog ref={dialog} className="editor-dialog" onCancel={close}><form onSubmit={event => { event.preventDefault(); if (valid) apply(Number(w), Number(h)); }}><h2>Resize image</h2><p>Set exact pixel dimensions. This change can be undone.</p><label>Width (px)<input type="number" min="1" max="16000" value={w} onChange={event => update(event.target.value, 'width')} /></label><label>Height (px)<input type="number" min="1" max="16000" value={h} onChange={event => update(event.target.value, 'height')} /></label><label className="resize-lock"><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)} />Keep proportions</label><div className="resize-presets">{[50, 75, 150, 200].map(percent => <button type="button" key={percent} onClick={() => { setW(String(Math.round(width * percent / 100))); setH(String(Math.round(height * percent / 100))); }}>{percent}%</button>)}</div>{!valid && <p className="resize-error">Choose whole dimensions up to 16,000 pixels and 16 megapixels total.</p>}<div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!valid}>Apply resize</button></div></form></dialog>;
}
