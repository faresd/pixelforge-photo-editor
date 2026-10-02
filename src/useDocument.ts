import { useCallback, useRef, useState } from 'react';
import {
  decodeAsset,
  referencedAssets,
  renderFrame,
  validateFrame,
  type Assets,
  type Frame,
} from './document';
import type { Draft } from './drafts';

export function useDocument(onError: (message: string) => void) {
  const canvas = useRef<HTMLCanvasElement>(null),
    assets = useRef<Assets>({}),
    history = useRef<Frame[]>([]),
    index = useRef(-1);
  const [frame, setFrame] = useState<Frame | null>(null),
    [revision, setRevision] = useState(0),
    [rendering, setRendering] = useState(false);
  const renderSequence = useRef(0);
  const paint = useCallback(
    async (value: Frame, overrides?: Record<string, HTMLCanvasElement>) => {
      const sequence = ++renderSequence.current;
      setRendering(true);
      try {
        const image = await renderFrame(value, assets.current, overrides);
        if (sequence !== renderSequence.current) return;
        const target = canvas.current;
        if (target) {
          target.width = value.w;
          target.height = value.h;
          target.getContext('2d')!.drawImage(image, 0, 0);
        }
      } catch (error) {
        if (sequence === renderSequence.current)
          onError(
            error instanceof Error
              ? error.message
              : 'Could not render document',
          );
      } finally {
        if (sequence === renderSequence.current) setRendering(false);
      }
    },
    [onError],
  );
  const publish = useCallback(
    (value: Frame) => {
      setFrame(value);
      setRevision((v) => v + 1);
      void paint(value);
    },
    [paint],
  );
  const commit = useCallback(
    (value: Frame, replace = false) => {
      try {
        validateFrame(value, assets.current);
        let next = replace
          ? [value]
          : [...history.current.slice(0, index.current + 1), value];
        let used = referencedAssets(next, assets.current);
        while (
          next.length > 1 &&
          (next.length > 24 ||
            Object.values(used).reduce((n, a) => n + a.url.length, 0) >
              32 * 1024 * 1024)
        ) {
          next = next.slice(1);
          used = referencedAssets(next, assets.current);
        }
        if (
          Object.values(used).reduce((n, a) => n + a.url.length, 0) >
          64 * 1024 * 1024
        )
          throw new Error(
            'This document exceeds 64 MB. Export a copy before adding more images.',
          );
        history.current = next;
        index.current = next.length - 1;
        assets.current = used;
        publish(value);
        return true;
      } catch (error) {
        assets.current = referencedAssets(history.current, assets.current);
        onError(
          error instanceof Error ? error.message : 'Edit could not be applied',
        );
        return false;
      }
    },
    [publish, onError],
  );
  const install = useCallback(async (draft: Draft) => {
    const expected = history.current[index.current];
    // Validate every history asset before switching, so undo never discovers a corrupt import.
    for (const asset of Object.values(draft.assets)) await decodeAsset(asset);
    // Decode and render before switching documents, preserving the current work on import failure.
    const image = await renderFrame(draft.history[draft.index], draft.assets);
    if (history.current[index.current] !== expected)
      throw new Error('Document changed during import. Please try again.');
    ++renderSequence.current;
    assets.current = draft.assets;
    history.current = draft.history;
    index.current = draft.index;
    const target = canvas.current!;
    target.width = image.width;
    target.height = image.height;
    target.getContext('2d')!.drawImage(image, 0, 0);
    setFrame(draft.history[draft.index]);
    setRevision((v) => v + 1);
    setRendering(false);
  }, []);
  const select = useCallback(
    (id: string) => {
      const current = history.current[index.current];
      if (!current?.layers.some((l) => l.id === id)) return;
      const next = { ...current, active: id };
      history.current[index.current] = next;
      publish(next);
    },
    [publish],
  );
  const travel = useCallback(
    (direction: number) => {
      const target = index.current + direction;
      if (target < 0 || target >= history.current.length) return;
      index.current = target;
      publish(history.current[target]);
    },
    [publish],
  );
  return {
    canvas,
    assets,
    history,
    index,
    frame,
    revision,
    rendering,
    paint,
    commit,
    install,
    select,
    travel,
  };
}
