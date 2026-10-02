import { useEffect, useRef, useState } from 'react';
import { renderFrame, type Assets, type Frame } from './document';
import { encodeImage, exportLabels, type ExportFormat } from './export';

type Props = {
  frame: Frame;
  assets: Assets;
  name: string;
  format: ExportFormat;
  quality: number;
  setFormat: (format: ExportFormat) => void;
  setQuality: (quality: number) => void;
  close: () => void;
  downloaded: (message: string) => void;
};
type Preview = { blob: Blob; url: string; format: ExportFormat; quality: number };

export default function ExportDialog({ frame, assets, name, format, quality, setFormat, setQuality, close, downloaded }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const snapshot = useRef({ frame, assets });
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    void renderFrame(snapshot.current.frame, snapshot.current.assets).then((result) => {
      if (!cancelled) setImage(result);
    }).catch(() => {
      if (!cancelled) setError('Could not prepare the image. Your editable draft is kept.');
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    let url: string | undefined;
    void encodeImage(image, format, quality).then((blob) => {
      if (cancelled) return;
      setError('');
      url = URL.createObjectURL(blob);
      setPreview({ blob, url, format, quality });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Export failed. Your editable draft is kept.');
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [image, format, quality]);
  const current = preview?.format === format && preview?.quality === quality ? preview : null;
  const filename = `${name || 'pixelforge-edit'}.${format === 'jpeg' ? 'jpg' : format}`;
  return (
    <dialog ref={dialog} className="editor-dialog export-dialog" aria-labelledby="export-heading" onCancel={close}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!current) return;
        const anchor = document.createElement('a');
        anchor.download = filename;
        anchor.href = current.url;
        anchor.click();
        downloaded(`${exportLabels[format]} export downloaded (${current.blob.size.toLocaleString()} bytes)`);
      }}>
        <h2 id="export-heading">Export image</h2>
        <p>Download a flattened image at {frame.w} × {frame.h} px. Keep a project file to continue editing layers.</p>
        <label>Format<select aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          <option value="png">PNG — lossless</option>
          <option value="jpeg">JPEG — smaller, opaque</option>
          <option value="webp">WebP — smaller, transparent</option>
        </select></label>
        {format !== 'png' && <label>Quality<output>{quality}%</output><input aria-label="Export quality" type="range" min="1" max="100" step="1" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
        <p className="export-format-note">{format === 'jpeg' ? 'JPEG uses lossy compression. Transparent areas become white.' : format === 'webp' ? 'WebP uses lossy color compression and preserves transparency. Quality 100 is not a lossless guarantee.' : 'PNG preserves transparency and pixels without lossy compression. Quality does not apply.'}</p>
        <div className="export-preview">{current && <img src={current.url} alt={`${exportLabels[format]} export preview`} />}</div>
        <output className="export-size" aria-label="Encoded file size" aria-live="polite" data-bytes={current?.blob.size ?? ''}>
          {current ? `${current.blob.size.toLocaleString()} bytes · ${filename}` : error ? 'Preview unavailable' : 'Encoding preview…'}
        </output>
        {error && <p role="alert" className="resize-error">{error}</p>}
        <p>Encoded locally. Original EXIF/GPS metadata is not copied; source color profiles are not preserved. File size depends on image content and browser encoding.</p>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button><button type="submit" disabled={!current}>Download image</button></div>
      </form>
    </dialog>
  );
}
