import { useEffect, useRef, useState } from 'react';
import {
  layerTransformMatrix,
  selectionDecimal,
  type Matrix,
} from './document';

/** Local painted bounds used as the pivot box for a layer transform. */
export type LayerTransformBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

/**
 * Apply a validated affine delta to the active layer. The dialog intentionally
 * returns only the delta; the caller composes it with the persisted layer
 * matrix, keeping source assets, masks and history nondestructive.
 */
export default function LayerTransformDialog({
  bounds,
  layerMatrix,
  close,
  apply,
}: {
  bounds: LayerTransformBounds;
  layerMatrix: Matrix;
  close: () => void;
  apply: (matrix: Matrix) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<Field, string>>(
    Object.fromEntries(
      fields.map(([key, , value]) => [key, value]),
    ) as Record<Field, string>,
  );
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  useEffect(() => {
    const target = dialog.current;
    target?.showModal();
    return () => target?.close();
  }, []);

  let matrix: Matrix | undefined;
  let error = '';
  try {
    matrix = layerTransformMatrix(bounds, layerMatrix, {
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
    error = cause instanceof Error ? cause.message : 'Invalid layer transform';
  }

  return (
    <dialog
      ref={dialog}
      className="editor-dialog selection-transform-dialog"
      aria-labelledby="free-transform-title"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (matrix) apply(matrix);
        }}
      >
        <h2 id="free-transform-title">Free Transform</h2>
        <p>
          Move, scale, rotate, skew or flip the active layer around its painted
          centre. Source pixels and masks stay editable, and the change can be
          undone.
        </p>
        {fields.map(([key, label, , min, max], index) => (
          <label key={key}>
            <span>
              {label}
              <small>
                {min} to {max}
              </small>
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus={index === 0}
              aria-invalid={error ? true : undefined}
              value={values[key]}
              onChange={(event) =>
                setValues({ ...values, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <label className="resize-lock">
          <input
            type="checkbox"
            checked={flipX}
            onChange={(event) => setFlipX(event.target.checked)}
          />
          Flip horizontally
        </label>
        <label className="resize-lock">
          <input
            type="checkbox"
            checked={flipY}
            onChange={(event) => setFlipY(event.target.checked)}
          />
          Flip vertically
        </label>
        {error && (
          <p role="alert" className="resize-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={!matrix}>
            Apply free transform
          </button>
        </div>
      </form>
    </dialog>
  );
}
