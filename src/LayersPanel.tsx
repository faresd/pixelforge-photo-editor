import { useState } from 'react';
import { BLENDS, FONTS, type Frame, type Layer } from './document';

type Props = {
  frame: Frame;
  select: (id: string) => void;
  edit: (patch: Partial<Layer>) => void;
  add: () => void;
  duplicate: () => void;
  remove: () => void;
  reorder: (direction: number) => void;
  rasterize: () => void;
  importImage: () => void;
};
export default function LayersPanel({
  frame,
  select,
  edit,
  add,
  duplicate,
  remove,
  reorder,
  rasterize,
  importImage,
}: Props) {
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  return (
    <section className="panel layers-panel" aria-label="Layers">
      <h3>
        Layers <small>{frame.layers.length} / 32</small>
      </h3>
      <div className="layer-actions">
        <button onClick={add} disabled={frame.layers.length >= 32}>
          Add paint layer
        </button>
        <button onClick={importImage} disabled={frame.layers.length >= 32}>
          Add image layer
        </button>
      </div>
      <div className="layer-list">
        {[...frame.layers].reverse().map((item) => (
          <button
            key={item.id}
            className={
              item.id === layer.id ? 'layer-row selected' : 'layer-row'
            }
            onClick={() => select(item.id)}
            aria-pressed={item.id === layer.id}
            aria-label={`Select layer ${item.name}`}
          >
            <span className="layer-type">
              {item.kind === 'text' ? 'T' : item.kind === 'raster' ? '▧' : '□'}
            </span>
            <span>
              <b>{item.name || 'Untitled layer'}</b>
              <small>
                {item.kind} {item.locked ? '· locked' : ''}{' '}
                {!item.visible ? '· hidden' : ''}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="layer-toggles">
        <label>
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(e) => edit({ visible: e.target.checked })}
          />
          Visible
        </label>
        <label>
          <input
            type="checkbox"
            checked={layer.locked}
            onChange={(e) => edit({ locked: e.target.checked })}
          />
          Lock layer
        </label>
      </div>
      <label className="layer-field">
        Layer name
        <input
          aria-label="Layer name"
          maxLength={160}
          value={layer.name}
          disabled={layer.locked}
          onChange={(e) => edit({ name: e.target.value })}
        />
      </label>
      <label className="layer-field">
        Opacity {Math.round(layer.opacity * 100)}%
        <input
          aria-label="Layer opacity"
          type="range"
          min="0"
          max="100"
          value={Math.round(layer.opacity * 100)}
          disabled={layer.locked}
          onChange={(e) => edit({ opacity: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="layer-field">
        Blend mode
        <select
          aria-label="Blend mode"
          value={layer.blend}
          disabled={layer.locked}
          onChange={(e) => edit({ blend: e.target.value as Layer['blend'] })}
        >
          {BLENDS.map((blend) => (
            <option key={blend} value={blend}>
              {blend === 'source-over'
                ? 'Normal'
                : blend[0].toUpperCase() + blend.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="layer-position">
        <NumberField
          key={layer.id + 'x' + layer.matrix[4]}
          label="Layer X"
          value={layer.matrix[4]}
          min={-32000}
          max={32000}
          disabled={layer.locked}
          apply={(x) =>
            edit({
              matrix: [
                ...layer.matrix.slice(0, 4),
                x,
                layer.matrix[5],
              ] as Layer['matrix'],
            })
          }
        />
        <NumberField
          key={layer.id + 'y' + layer.matrix[5]}
          label="Layer Y"
          value={layer.matrix[5]}
          min={-32000}
          max={32000}
          disabled={layer.locked}
          apply={(y) =>
            edit({
              matrix: [...layer.matrix.slice(0, 5), y] as Layer['matrix'],
            })
          }
        />
      </div>
      {layer.kind === 'text' && (
        <div className="layer-typography">
          <label className="layer-field">
            Editable text
            <textarea
              aria-label="Edit layer text"
              maxLength={10000}
              value={layer.text}
              disabled={layer.locked}
              onChange={(e) => edit({ text: e.target.value })}
            />
          </label>
          <label className="layer-field">
            Typeface
            <select
              aria-label="Layer font"
              value={layer.fontFamily}
              disabled={layer.locked}
              onChange={(e) =>
                edit({ fontFamily: e.target.value as (typeof FONTS)[number] })
              }
            >
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
          <NumberField
            key={layer.id + layer.fontSize}
            label="Layer font size"
            value={layer.fontSize}
            min={1}
            max={1000}
            disabled={layer.locked}
            apply={(fontSize) => edit({ fontSize })}
          />
          <label>
            <input
              type="checkbox"
              checked={layer.bold}
              disabled={layer.locked}
              onChange={(e) => edit({ bold: e.target.checked })}
            />
            Bold
          </label>
          <label className="layer-field">
            Text color
            <input
              type="color"
              aria-label="Layer text color"
              value={layer.color}
              disabled={layer.locked}
              onChange={(e) => edit({ color: e.target.value })}
            />
          </label>
        </div>
      )}
      {(layer.kind === 'rectangle' || layer.kind === 'ellipse') && (
        <div className="layer-position">
          <NumberField
            key={layer.id + layer.width}
            label="Shape width"
            value={layer.width}
            min={1}
            max={16000}
            disabled={layer.locked}
            apply={(width) => edit({ width })}
          />
          <NumberField
            key={layer.id + layer.height}
            label="Shape height"
            value={layer.height}
            min={1}
            max={16000}
            disabled={layer.locked}
            apply={(height) => edit({ height })}
          />
          <label>
            <input
              type="checkbox"
              checked={layer.fill}
              disabled={layer.locked}
              onChange={(e) => edit({ fill: e.target.checked })}
            />
            Filled shape
          </label>
          <input
            type="color"
            aria-label="Shape color"
            value={layer.color}
            disabled={layer.locked}
            onChange={(e) => edit({ color: e.target.value })}
          />
        </div>
      )}
      <div className="layer-actions">
        <button
          onClick={() => reorder(1)}
          disabled={layer.locked || frame.layers.at(-1)?.id === layer.id}
        >
          Raise layer
        </button>
        <button
          onClick={() => reorder(-1)}
          disabled={layer.locked || frame.layers[0].id === layer.id}
        >
          Lower layer
        </button>
        <button onClick={duplicate} disabled={frame.layers.length >= 32}>
          Duplicate layer
        </button>
        <button
          onClick={remove}
          disabled={layer.locked || frame.layers.length === 1}
        >
          Delete layer
        </button>
        {layer.kind !== 'raster' && (
          <button onClick={rasterize} disabled={layer.locked}>
            Rasterize layer
          </button>
        )}
      </div>
      <p>
        Edits affect the selected layer. Deleting and rasterizing can be undone.
      </p>
    </section>
  );
}
function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  apply,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  apply: (v: number) => void;
}) {
  const [input, setInput] = useState(String(Math.round(value * 100) / 100));
  const commit = () => {
    const n = Number(input);
    if (input.trim() && Number.isFinite(n) && n >= min && n <= max) apply(n);
    else setInput(String(value));
  };
  return (
    <label className="layer-field">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="any"
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
