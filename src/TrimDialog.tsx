import { useEffect, useRef, useState } from 'react';
import type { TrimMode, TrimSides } from './canvasSize';

type Props = {
  close: () => void;
  apply: (mode: TrimMode, sides: TrimSides) => void;
};

export default function TrimDialog({ close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<TrimMode>('transparent');
  const [sides, setSides] = useState<TrimSides>({ top: true, left: true, bottom: true, right: true });
  useEffect(() => {
    const target = dialog.current;
    if (!target) return;
    target.showModal();
    const onCancel = (event: Event) => { event.preventDefault(); close(); };
    target.addEventListener('cancel', onCancel);
    return () => target.removeEventListener('cancel', onCancel);
  }, [close]);
  const toggle = (side: keyof TrimSides) => setSides((value) => ({ ...value, [side]: !value[side] }));
  return (
    <dialog ref={dialog} className="editor-dialog trim-dialog" onClose={close}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); apply(mode, sides); }}>
        <h2>Trim</h2>
        <p>Remove empty canvas pixels around the visible artwork. Source layer pixels remain editable and the operation can be undone.</p>
        <label><span>Trim based on</span><select aria-label="Trim based on" value={mode} onChange={(event) => setMode(event.target.value as TrimMode)}><option value="transparent">Transparent pixels</option><option value="top-left">Top-left pixel color</option><option value="top-right">Top-right pixel color</option><option value="bottom-left">Bottom-left pixel color</option><option value="bottom-right">Bottom-right pixel color</option></select></label>
        <fieldset><legend>Trim away</legend><label className="resize-lock"><input type="checkbox" checked={sides.top} onChange={() => toggle('top')} />Top</label><label className="resize-lock"><input type="checkbox" checked={sides.left} onChange={() => toggle('left')} />Left</label><label className="resize-lock"><input type="checkbox" checked={sides.bottom} onChange={() => toggle('bottom')} />Bottom</label><label className="resize-lock"><input type="checkbox" checked={sides.right} onChange={() => toggle('right')} />Right</label></fieldset>
        <p className="trim-help">Trim samples the rendered composite. Leave a side unchecked to preserve that edge of the canvas.</p>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply trim</button></div>
      </form>
    </dialog>
  );
}
