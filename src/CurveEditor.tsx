'use client';

import { useMemo, useRef, useState } from 'react';
import {
  identityCurve,
  moveCurvePoint,
  normalizeCurvePoints,
  removeCurvePoint,
  sampleCurve,
  setCurvePoint,
  type CurvePoints,
} from './curves';

type Props = {
  label: string;
  points: CurvePoints;
  onChange: (points: CurvePoints) => void;
};

const WIDTH = 240;
const HEIGHT = 160;

function fromPointer(
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(
    0,
    Math.min(255, ((event.clientX - rect.left) / rect.width) * 255),
  );
  const y = Math.max(
    0,
    Math.min(255, (1 - (event.clientY - rect.top) / rect.height) * 255),
  );
  return { x, y };
}

export default function CurveEditor({ label, points, onChange }: Props) {
  const normalized = useMemo(() => normalizeCurvePoints(points), [points]);
  const [dragging, setDragging] = useState(false);
  const activeX = useRef<number | null>(null);
  const midpoint = sampleCurve(normalized, 128);
  const selectPoint = (x: number, y: number) => {
    const nearest = normalized.reduce<{ x: number; distance: number } | null>(
      (best, point) => {
        const distance = Math.abs(point[0] - x);
        return !best || distance < best.distance
          ? { x: point[0], distance }
          : best;
      },
      null,
    );
    activeX.current =
      nearest && nearest.distance <= 14 ? nearest.x : Math.round(x);
    onChange(setCurvePoint(normalized, activeX.current, y));
  };
  const movePoint = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    const { x, y } = fromPointer(event);
    const sourceX = activeX.current ?? x;
    onChange(moveCurvePoint(normalized, sourceX, x, y));
    activeX.current =
      sourceX === 0 || sourceX === 255
        ? sourceX
        : Math.max(1, Math.min(254, Math.round(x)));
  };
  const polyline = normalized
    .map(([x, y]) => `${(x / 255) * WIDTH},${HEIGHT - (y / 255) * HEIGHT}`)
    .join(' ');
  return (
    <fieldset className="curve-editor" aria-label={`${label} curve editor`}>
      <div className="curve-editor__header">
        <strong>{label}</strong>
        <button
          type="button"
          className="curve-editor__reset"
          onClick={() => onChange(identityCurve)}
          aria-label={`Reset ${label} curve`}
        >
          Reset
        </button>
      </div>
      <button
        type="button"
        className="curve-editor__graph"
        aria-label={`${label} curve; drag to add or move points`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          const pointer = fromPointer(event);
          selectPoint(pointer.x, pointer.y);
        }}
        onPointerMove={movePoint}
        onPointerUp={() => {
          setDragging(false);
          activeX.current = null;
        }}
        onPointerCancel={() => {
          setDragging(false);
          activeX.current = null;
        }}
        onDoubleClick={(event) => {
          const { x } = fromPointer(event);
          const nearest = normalized.reduce<{
            x: number;
            distance: number;
          } | null>((best, point) => {
            const distance = Math.abs(point[0] - x);
            return !best || distance < best.distance
              ? { x: point[0], distance }
              : best;
          }, null);
          if (nearest && nearest.distance <= 14)
            onChange(removeCurvePoint(normalized, nearest.x));
        }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          <path
            className="curve-editor__grid"
            d={`M0 ${HEIGHT / 2}H${WIDTH}M${WIDTH / 2} 0V${HEIGHT}`}
          />
          <polyline className="curve-editor__line" points={polyline} />
          {normalized.map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              className="curve-editor__point"
              cx={(x / 255) * WIDTH}
              cy={HEIGHT - (y / 255) * HEIGHT}
              r={x === 0 || x === 255 ? 4 : 5}
            />
          ))}
        </svg>
      </button>
      <label className="curve-editor__fallback">
        <span>{label} midpoint</span>
        <input
          type="range"
          min={0}
          max={255}
          value={midpoint}
          aria-label={`${label} midpoint`}
          onChange={(event) =>
            onChange(setCurvePoint(normalized, 128, Number(event.target.value)))
          }
        />
        <output>{midpoint}</output>
      </label>
    </fieldset>
  );
}
