import { useEffect, useRef, useState } from 'react';
import { selectionDecimal } from './document';

export default function ColorRangeDialog({
  initialColor,
  initialFuzziness,
  close,
  apply,
}: {
  initialColor: string;
  initialFuzziness: number;
  close: () => void;
  apply: (color: string, fuzziness: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [color, setColor] = useState(initialColor);
  const [fuzziness, setFuzziness] = useState(String(initialFuzziness));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const parsed = selectionDecimal(fuzziness);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
  return (
    <dialog
      ref={dialog}
      className="editor-dialog color-range-dialog"
      aria-labelledby="color-range-title"
      onCancel={close}
    >
      <form onSubmit={(event) => { event.preventDefault(); if (valid) apply(color, parsed); }}>
        <h2 id="color-range-title">Color Range</h2>
        <p>
          Select matching RGB colours with a soft edge. The source pixels stay
          unchanged; the result is an editable alpha selection.
        </p>
        <label>
          Sample colour
          <input
            aria-label="Color Range sample color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <label>
          Fuzziness (0–255)
          <input
            aria-label="Color Range fuzziness"
            type="text"
            inputMode="numeric"
            value={fuzziness}
            aria-invalid={fuzziness !== '' && !valid ? true : undefined}
            onChange={(event) => setFuzziness(event.target.value)}
          />
        </label>
        {!valid && <p role="alert" className="resize-error">Enter a whole fuzziness from 0 to 255.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Apply Color Range</button>
        </div>
      </form>
    </dialog>
  );
}
