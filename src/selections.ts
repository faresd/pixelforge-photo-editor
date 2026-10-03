import {
  decodeAsset,
  surface,
  type Assets,
  type Selection,
  type SelectionOperation,
  type SelectionPart,
} from './document';

function drawPart(context: CanvasRenderingContext2D, part: SelectionPart) {
  context.fillStyle = '#fff';
  if (part.shape === 'ellipse') {
    context.beginPath();
    context.ellipse(part.x + part.w / 2, part.y + part.h / 2, part.w / 2, part.h / 2, 0, 0, Math.PI * 2);
    context.fill();
  } else if (part.shape === 'polygon' && part.points) {
    context.beginPath();
    context.moveTo(part.points[0].x, part.points[0].y);
    for (const point of part.points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
  } else context.fillRect(part.x, part.y, part.w, part.h);
}

/** Resolve alpha before its affine transform, then clip to the document canvas. */
export async function renderSelection(
  selection: Selection,
  w: number,
  h: number,
  assets: Assets,
) {
  const raw = surface(w, h), context = raw.getContext('2d')!;
  if (selection.mask) {
    context.drawImage(await decodeAsset(assets[selection.mask]), 0, 0);
  } else {
    const parts: SelectionPart[] = selection.parts?.length ? selection.parts : [{
      shape: selection.shape, x: selection.x, y: selection.y,
      w: selection.w, h: selection.h, points: selection.points, operation: 'replace',
    }];
    for (const part of parts) {
      const shape = surface(w, h);
      drawPart(shape.getContext('2d')!, part);
      if (part.operation === 'replace') context.clearRect(0, 0, w, h);
      context.globalCompositeOperation = part.operation === 'subtract' ? 'destination-out'
        : part.operation === 'intersect' ? 'destination-in' : 'source-over';
      context.drawImage(shape, 0, 0);
    }
  }
  const out = surface(w, h), target = out.getContext('2d')!;
  target.filter = selection.feather > 0 ? `blur(${selection.feather}px)` : 'none';
  target.drawImage(raw, 0, 0);
  if (selection.inverted) {
    const image = target.getImageData(0, 0, w, h);
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i];
    target.putImageData(image, 0, 0);
  }
  if (!selection.matrix) return out;
  const transformed = surface(w, h), transformedContext = transformed.getContext('2d')!;
  transformedContext.setTransform(...selection.matrix);
  transformedContext.drawImage(out, 0, 0);
  return transformed;
}

/** Compose resolved alpha rather than discarding a color mask, feather or inversion. */
export async function composeSelection(
  previous: Selection,
  next: Selection,
  operation: SelectionOperation,
  w: number,
  h: number,
  assets: Assets,
) {
  const left = await renderSelection(previous, w, h, assets),
    right = await renderSelection(next, w, h, assets),
    context = left.getContext('2d')!;
  if (operation === 'replace') context.clearRect(0, 0, w, h);
  context.globalCompositeOperation = operation === 'subtract' ? 'destination-out'
    : operation === 'intersect' ? 'destination-in' : 'source-over';
  context.drawImage(right, 0, 0);
  return left;
}
