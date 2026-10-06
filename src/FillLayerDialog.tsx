import { useEffect, useRef, useState } from 'react';
export default function FillLayerDialog({ initialColor, close, apply }: { initialColor: string; close: () => void; apply: (color: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const [color, setColor] = useState(/^#[a-f\d]{6}$/i.test(initialColor) ? initialColor : '#000000');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="editor-dialog color-range-dialog" aria-labelledby="fill-layer-title" onCancel={close}><form onSubmit={(event) => { event.preventDefault(); apply(color); }}><h2 id="fill-layer-title">New Solid Fill Layer</h2><p>Creates an editable local solid-color layer. Its source color remains metadata, so opacity, blend mode, transforms and adjustments stay nondestructive.</p><label>Fill colour<input aria-label="Fill layer colour" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Create Fill Layer</button></div></form></dialog>;
}
