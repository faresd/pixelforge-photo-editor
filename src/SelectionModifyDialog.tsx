import { useEffect, useRef, useState } from 'react';
import { selectionDecimal } from './document';
import type { SelectionRefineMode } from './selectionRefine';

export default function SelectionModifyDialog({
  mode,
  close,
  apply,
}: {
  mode: SelectionRefineMode;
  close: () => void;
  apply: (radius: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [radius, setRadius] = useState('2');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const parsed = selectionDecimal(radius);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000;
  return (
    <dialog
      ref={dialog}
      className="editor-dialog selection-modify-dialog"
      aria-labelledby="selection-modify-title"
      onCancel={close}
    >
      <form onSubmit={(event) => { event.preventDefault(); if (valid) apply(parsed); }}>
        <h2 id="selection-modify-title">
          {mode === 'grow'
            ? 'Grow Selection'
            : mode === 'contract'
              ? 'Contract Selection'
              : 'Border Selection'}
        </h2>
        <p>
          {mode === 'grow'
            ? 'Expand the selected alpha by a bounded local radius. Image pixels stay unchanged.'
            : mode === 'contract'
              ? 'Shrink the selected alpha by a bounded local radius. Image pixels stay unchanged.'
              : 'Create a bounded alpha border by subtracting the contracted inner selection from the expanded outer selection. Image pixels stay unchanged.'}
        </p>
        <label>
          Radius (px)
          <input
            aria-label="Selection refinement radius (px)"
            type="text"
            inputMode="numeric"
            value={radius}
            aria-invalid={radius !== '' && !valid ? true : undefined}
            onChange={(event) => setRadius(event.target.value)}
          />
        </label>
        {!valid && <p role="alert" className="resize-error">Enter a whole radius from 1 to 1000 px.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Apply selection refinement</button>
        </div>
      </form>
    </dialog>
  );
}
