import { useEffect, useRef, useState } from 'react';
import {
  selectionDecimal,
  selectionTransformMatrix,
  type Matrix,
  type Selection,
} from './document';

const fields = [
  ['offsetX', 'Horizontal offset (px)', '0', -16000, 16000],
  ['offsetY', 'Vertical offset (px)', '0', -16000, 16000],
  ['scaleX', 'Width scale (%)', '100', 1, 1000],
  ['scaleY', 'Height scale (%)', '100', 1, 1000],
  ['angle', 'Rotation (degrees)', '0', -180, 180],
  ['skewX', 'Horizontal skew (degrees)', '0', -80, 80],
  ['skewY', 'Vertical skew (degrees)', '0', -80, 80],
] as const;
type Field = (typeof fields)[number][0];

export default function SelectionTransformDialog({
  selection,
  close,
  apply,
}: {
  selection: Selection;
  close: () => void;
  apply: (matrix: Matrix) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<Field, string>>(
    Object.fromEntries(fields.map(([key, , value]) => [key, value])) as Record<Field, string>,
  );
  const [flipX, setFlipX] = useState(false), [flipY, setFlipY] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  let matrix: Matrix | undefined, error = '';
  try {
    matrix = selectionTransformMatrix(selection, {
      offsetX: selectionDecimal(values.offsetX),
      offsetY: selectionDecimal(values.offsetY),
      scaleX: selectionDecimal(values.scaleX),
      scaleY: selectionDecimal(values.scaleY),
      angle: selectionDecimal(values.angle),
      skewX: selectionDecimal(values.skewX),
      skewY: selectionDecimal(values.skewY),
      flipX,
      flipY,
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Invalid selection transform';
  }
  return (
    <dialog ref={dialog} className="editor-dialog selection-transform-dialog" aria-labelledby="selection-transform-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (matrix) apply(matrix); }}>
        <h2 id="selection-transform-title">Transform Selection</h2>
        <p>Move, scale, rotate, skew or flip the selection around its centre. Image pixels stay unchanged. The selection is clipped at the canvas edges and can be undone.</p>
        {fields.map(([key, label, , min, max], index) => (
          <label key={key}>
            <span>{label}<small>{min} to {max}</small></span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus={index === 0}
              aria-invalid={error ? true : undefined}
              value={values[key]}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </label>
        ))}
        <label className="resize-lock"><input type="checkbox" checked={flipX} onChange={(event) => setFlipX(event.target.checked)} />Flip horizontally</label>
        <label className="resize-lock"><input type="checkbox" checked={flipY} onChange={(event) => setFlipY(event.target.checked)} />Flip vertically</label>
        {error && <p role="alert" className="resize-error">{error}</p>}
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!matrix}>Apply selection transform</button></div>
      </form>
    </dialog>
  );
}
