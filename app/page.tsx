'use client';

import {
  Brush,
  Crop,
  Download,
  Eraser,
  FileImage,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  MousePointer2,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Shapes,
  Sparkles,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  LOCAL_CONFLICT,
  createDraftId,
  discardDraft,
  initialDraftId,
  readDraft,
  saveDraft,
  validateDraft,
  type Tool,
  type Draft,
  type Settings,
} from '../src/drafts';
import {
  useMember,
  saveCloudProject,
  SIGN_IN,
  type CloudLink,
} from '../src/cloud';
import {
  addAsset,
  commonLayer,
  identity,
  neutral,
  rasterFrame,
  renderFrame,
  surface,
  transformFrame,
  type Adjustments,
  type Layer,
  type Frame,
  type Matrix,
} from '../src/document';
import { useDocument } from '../src/useDocument';
import LayersPanel from '../src/LayersPanel';
import ResizeDialog from '../src/ResizeDialog';
import { BrandLockup } from '../src/Brand';
type MenuName = 'File' | 'Edit' | 'Image' | 'Filter' | 'View';
type Command =
  | 'resize'
  | 'project-save'
  | 'project-open'
  | 'new-white'
  | 'new-transparent'
  | 'open'
  | 'png'
  | 'jpg'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'crop'
  | 'rotate-left'
  | 'rotate-right'
  | 'flip-h'
  | 'flip-v'
  | 'filter-original'
  | 'filter-vivid'
  | 'filter-mono'
  | 'filter-warm'
  | 'filter-cool'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'actual';
type MenuItem = { label: string; shortcut?: string; command: Command };

const TOOLS: { id: Tool; label: string; icon: typeof Brush; key: string }[] = [
  { id: 'move', label: 'Move', icon: MousePointer2, key: 'V' },
  { id: 'crop', label: 'Crop', icon: Crop, key: 'C' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'text', label: 'Text', icon: Type, key: 'T' },
  { id: 'rectangle', label: 'Shape', icon: Shapes, key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: Shapes, key: 'O' },
];
const FILTERS = [
  ['Original', 'none', '#315277', '#d59b6c'],
  ['Vivid', 'saturate(1.45) contrast(1.08)', '#244d96', '#ef854a'],
  ['Mono', 'grayscale(1) contrast(1.12)', '#3d4249', '#c6cbd0'],
  ['Warm', 'sepia(.35) saturate(1.2)', '#654737', '#e8a467'],
  ['Cool', 'hue-rotate(18deg) saturate(.9)', '#335d91', '#83bbc4'],
] as const;
const MENU_DEFS: Record<MenuName, MenuItem[]> = {
  File: [
    { label: 'Open project…', command: 'project-open' },
    { label: 'Download project file', command: 'project-save' },
    { label: 'New white document', shortcut: 'Ctrl+N', command: 'new-white' },
    { label: 'New transparent document', command: 'new-transparent' },
    { label: 'Open image…', shortcut: 'Ctrl+O', command: 'open' },
    { label: 'Export as PNG', shortcut: 'Ctrl+S', command: 'png' },
    { label: 'Export as JPG', command: 'jpg' },
  ],
  Edit: [
    { label: 'Undo', shortcut: 'Ctrl+Z', command: 'undo' },
    { label: 'Redo', shortcut: 'Ctrl+Y', command: 'redo' },
    { label: 'Reset adjustments', command: 'reset' },
    { label: 'Clear to transparent', command: 'new-transparent' },
  ],
  Image: [
    { label: 'Resize image…', command: 'resize' },
    { label: 'Crop', shortcut: 'C', command: 'crop' },
    { label: 'Rotate left', command: 'rotate-left' },
    { label: 'Rotate right', command: 'rotate-right' },
    { label: 'Flip horizontal', command: 'flip-h' },
    { label: 'Flip vertical', command: 'flip-v' },
  ],
  Filter: [
    { label: 'Original', command: 'filter-original' },
    { label: 'Vivid', command: 'filter-vivid' },
    { label: 'Mono', command: 'filter-mono' },
    { label: 'Warm', command: 'filter-warm' },
    { label: 'Cool', command: 'filter-cool' },
  ],
  View: [
    { label: 'Zoom in', shortcut: '+', command: 'zoom-in' },
    { label: 'Zoom out', shortcut: '−', command: 'zoom-out' },
    { label: 'Fit to screen', shortcut: '0', command: 'fit' },
    { label: 'Actual size', shortcut: '1', command: 'actual' },
  ],
};

type Gesture = {
  tool: Tool;
  start: { x: number; y: number };
  last: { x: number; y: number };
  frame: Frame;
  layer?: Layer;
  buffer?: HTMLCanvasElement;
  pending?: Promise<void>;
  queued?: { x: number; y: number }[];
  moved: boolean;
};

export default function Home() {
  const file = useRef<HTMLInputElement>(null),
    layerFile = useRef<HTMLInputElement>(null),
    projectFile = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLElement>(null),
    menuArea = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState('Ready'),
    [ready, setReady] = useState(false),
    [name, setName] = useState('coastline-edit');
  const doc = useDocument(setNotice),
    {
      canvas,
      assets,
      history,
      index,
      frame,
      revision,
      commit,
      install,
      select,
      travel,
      paint,
    } = doc;
  const [tool, setTool] = useState<Tool>('move'),
    [zoom, setZoom] = useState(72),
    [color, setColor] = useState('#ff5c35'),
    [size, setSize] = useState(18),
    [text, setText] = useState('Your text'),
    [fontSize, setFontSize] = useState(56);
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null),
    [drag, setDrag] = useState(false),
    [resizing, setResizing] = useState<{
      width: number;
      height: number;
    } | null>(null);
  const [draftId, setDraftId] = useState(initialDraftId),
    openingDraftId = useRef(draftId),
    [saveStatus, setSaveStatus] = useState('Opening saved document…');
  const localVersions = useRef(new Map<string, number>());
  const saveQueue = useRef(Promise.resolve());
  const saveSequence = useRef(0),
    saving = useRef(false),
    discarding = useRef(false);
  const { member } = useMember();
  const [cloud, setCloud] = useState<CloudLink | undefined>(),
    [cloudBusy, setCloudBusy] = useState(false),
    [cloudMessage, setCloudMessage] = useState('');
  const active = frame?.layers.find((l) => l.id === frame.active),
    adjustments = active?.adjustments || neutral;
  const { brightness, contrast, saturation, blur, filter } = adjustments;
  const dimensions = frame ? `${frame.w} × ${frame.h} px` : 'Opening…',
    canUndo = index.current > 0,
    canRedo = index.current < history.current.length - 1;
  const gesture = useRef<Gesture | null>(null);
  const settings = (): Settings => ({
    tool,
    zoom,
    color,
    size,
    text,
    fontSize,
    ...neutral,
  });
  const documentValue = (): Draft => ({
    version: 2,
    history: history.current,
    assets: assets.current,
    index: index.current,
    name,
    settings: settings(),
  });
  const restoreSettings = (s: Settings) => {
    setTool(s.tool);
    setZoom(s.zoom);
    setColor(s.color);
    setSize(s.size);
    setText(s.text);
    setFontSize(s.fontSize);
  };
  const current = () => history.current[index.current];
  const editLayer = (patch: Partial<Layer>) => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    if (layer.locked && !('locked' in patch) && !('visible' in patch)) {
      setNotice('Unlock this layer before editing');
      return false;
    }
    const next =
      patch.kind && patch.kind !== layer.kind
        ? (patch as Layer)
        : ({ ...layer, ...patch } as Layer);
    if (JSON.stringify(next) === JSON.stringify(layer)) return true;
    if (
      commit({
        ...f,
        layers: f.layers.map((l) => (l.id === layer.id ? next : l)),
      })
    ) {
      setNotice('Layer updated');
      return true;
    }
    return false;
  };
  const adjust = (patch: Partial<Adjustments>) => {
    const layer = current().layers.find((l) => l.id === current().active)!;
    return editLayer({ adjustments: { ...layer.adjustments, ...patch } });
  };
  const resetAdjustments = () => adjust({ ...neutral });
  const setBrightness = (brightness: number) => adjust({ brightness }),
    setContrast = (contrast: number) => adjust({ contrast }),
    setSaturation = (saturation: number) => adjust({ saturation }),
    setBlur = (blur: number) => adjust({ blur });
  const chooseFilter = (filter: string, label: string) => {
    if (adjust({ filter }))
      setNotice(`${label} applied to selected layer; remains editable`);
  };
  const clearCloud = () => {
    setCloud(undefined);
    setCloudMessage('');
  };
  const startRaster = (image: HTMLCanvasElement, title: string) => {
    const f = rasterFrame(image, assets.current);
    if (commit(f, true)) {
      setDraftId(createDraftId());
      clearCloud();
      setName(title.slice(0, 160));
      setZoom(72);
      return true;
    }
    return false;
  };
  const newDocument = (transparent = false) => {
    const image = surface(1200, 800);
    if (!transparent) {
      image.getContext('2d')!.fillStyle = '#fff';
      image.getContext('2d')!.fillRect(0, 0, 1200, 800);
    }
    startRaster(image, transparent ? 'untitled-transparent' : 'untitled');
    setNotice(transparent ? 'New transparent document' : 'New document');
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await readDraft(openingDraftId.current);
        if (cancelled) return;
        if (saved) {
          await install(saved);
          if (cancelled) return;
          setName(saved.name);
          setCloud(saved.cloud);
          localVersions.current.set(
            openingDraftId.current,
            saved.localRevision || 0,
          );
          restoreSettings(saved.settings);
          if (saved.migrated) {
            setDraftId(createDraftId());
            setNotice(
              'Upgraded to layers. Your original draft bookmark is kept.',
            );
          } else setNotice('Saved document restored');
          setReady(true);
          return;
        }
      } catch {
        if (cancelled) return;
        setDraftId(createDraftId());
        setNotice(
          'Recovery unavailable. Original draft kept; export backups of your work.',
        );
      }
      if (cancelled) return;
      const c = surface(1440, 960),
        x = c.getContext('2d')!,
        g = x.createLinearGradient(0, 0, 0, 960);
      g.addColorStop(0, '#163154');
      g.addColorStop(0.48, '#719ab4');
      g.addColorStop(0.49, '#dec6a4');
      g.addColorStop(1, '#986b49');
      x.fillStyle = g;
      x.fillRect(0, 0, 1440, 960);
      x.fillStyle = '#c9814f';
      x.beginPath();
      x.arc(1120, 260, 110, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#223b42';
      x.beginPath();
      x.moveTo(0, 580);
      x.lineTo(300, 370);
      x.lineTo(515, 575);
      x.lineTo(730, 430);
      x.lineTo(970, 610);
      x.lineTo(1440, 390);
      x.lineTo(1440, 720);
      x.lineTo(0, 720);
      x.fill();
      x.fillStyle = '#244e62';
      x.fillRect(0, 650, 1440, 310);
      x.strokeStyle = '#ffffff60';
      x.lineWidth = 8;
      for (let y = 690; y < 920; y += 55) {
        x.beginPath();
        x.moveTo(40, y);
        x.bezierCurveTo(350, y - 38, 610, y + 34, 980, y - 6);
        x.stroke();
      }
      commit(rasterFrame(c, assets.current), true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Settings are loaded once from the opening bookmark.
  }, [assets, commit, install]);
  useEffect(() => {
    if (!ready || index.current < 0 || discarding.current) return;
    const sequence = ++saveSequence.current;
    saving.current = true;
    setSaveStatus('Saving on this device…');
    const value: Draft = {
      version: 2,
      cloud,
      history: history.current.slice(),
      assets: { ...assets.current },
      index: index.current,
      name,
      settings: { tool, zoom, color, size, text, fontSize, ...neutral },
    };
    saveQueue.current = saveQueue.current
      .then(async () => {
        if (discarding.current) return;
        const version = await saveDraft(
          draftId,
          value,
          localVersions.current.get(draftId) || 0,
        );
        localVersions.current.set(draftId, version);
      })
      .then(() => {
        if (sequence === saveSequence.current) {
          saving.current = false;
          setSaveStatus('Saved on this device');
        }
      })
      .catch((error: unknown) => {
        if (sequence === saveSequence.current) {
          saving.current = true;
          setSaveStatus(
            error instanceof Error && error.message === LOCAL_CONFLICT
              ? LOCAL_CONFLICT
              : 'Local save failed — export a copy',
          );
        }
      });
  }, [
    ready,
    revision,
    draftId,
    cloud,
    name,
    tool,
    zoom,
    color,
    size,
    text,
    fontSize,
    history,
    index,
    assets,
  ]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (saving.current || cloudBusy || gesture.current)
        event.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [cloudBusy]);
  useEffect(() => {
    const open = () => {
      if (new URLSearchParams(location.hash.slice(1)).get('draft') !== draftId)
        location.reload();
    };
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [draftId]);
  const saveToCloud = async (asCopy = false) => {
    if (!member || cloudBusy) return;
    setCloudBusy(true);
    setCloudMessage('Saving private cloud project…');
    const link = !asCopy && cloud?.owner === member.id ? cloud : undefined;
    try {
      const result = await saveCloudProject(
        link?.id || crypto.randomUUID(),
        link?.generation || '0',
        documentValue(),
      );
      setCloud({ ...result, owner: member.id });
      setCloudMessage(
        'Cloud copy saved. Choose Update cloud project after further edits.',
      );
    } catch (error) {
      setCloudMessage(
        error instanceof Error
          ? error.message
          : 'Cloud save failed. Your local draft is safe.',
      );
    } finally {
      setCloudBusy(false);
    }
  };
  const exportProject = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(documentValue())], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = (name || 'untitled') + '.pixelforge';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Editable project file downloaded');
  };
  const importProject = async (selected?: File) => {
    if (!selected) return;
    const expected = current();
    try {
      if (selected.size > 64 * 1024 * 1024)
        throw new Error('Project file exceeds 64 MB');
      const saved = validateDraft(JSON.parse(await selected.text()));
      if (current() !== expected)
        throw new Error('Document changed during import. Please try again.');
      await install(saved);
      setDraftId(createDraftId());
      clearCloud();
      setName(saved.name);
      restoreSettings(saved.settings);
      setNotice('Project opened with editable layers and history');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Project could not be opened',
      );
    } finally {
      if (projectFile.current) projectFile.current.value = '';
    }
  };
  const resizeImage = (w: number, h: number) => {
    const f = current();
    if (!commit(transformFrame(f, [w / f.w, 0, 0, h / f.h, 0, 0], w, h)))
      return;
    setResizing(null);
    setNotice('Image resized; layers remain editable');
  };
  const discard = async () => {
    if (
      !confirm(
        'Discard this saved draft? This cannot be undone. Download a project file first if you want to keep a copy.',
      )
    )
      return;
    discarding.current = true;
    saving.current = false;
    ++saveSequence.current;
    try {
      await saveQueue.current;
      await discardDraft(draftId, localVersions.current.get(draftId) || 0);
      location.assign('/');
    } catch {
      discarding.current = false;
      saving.current = true;
      setSaveStatus('Could not discard the draft. Please try again.');
    }
  };
  const addLayer = (layer: Layer) => {
    const f = current();
    if (f.layers.length >= 32) {
      setNotice('32-layer limit reached');
      void paint(f);
      return false;
    }
    if (commit({ ...f, layers: [...f.layers, layer], active: layer.id })) {
      setNotice('Layer added');
      return true;
    }
    return false;
  };
  const addPaint = () => {
    const f = current();
    addLayer({
      ...commonLayer('Paint ' + f.layers.length),
      kind: 'raster',
      asset: addAsset(assets.current, surface(f.w, f.h)),
    });
    setTool('brush');
  };
  const duplicate = () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    addLayer({
      ...layer,
      id: crypto.randomUUID(),
      name: (layer.name + ' copy').slice(0, 160),
      locked: false,
    });
  };
  const remove = () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    if (layer.locked || f.layers.length === 1) return;
    const layers = f.layers.filter((l) => l.id !== f.active);
    commit({ ...f, layers, active: layers.at(-1)!.id });
    setNotice('Layer deleted. Undo restores it.');
  };
  const reorder = (direction: number) => {
    const f = current(),
      layers = f.layers.slice(),
      from = layers.findIndex((l) => l.id === f.active),
      to = from + direction;
    if (to < 0 || to >= layers.length || layers[from].locked) return;
    [layers[from], layers[to]] = [layers[to], layers[from]];
    commit({ ...f, layers });
  };
  const rasterize = async () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    if (layer.locked) return;
    try {
      const image = await renderFrame(
        {
          ...f,
          layers: [
            {
              ...layer,
              visible: true,
              opacity: 1,
              blend: 'source-over',
              adjustments: { ...neutral },
            },
          ],
        },
        assets.current,
      );
      if (current() !== f) return;
      const changed = editLayer({
        ...commonLayer(layer.name),
        id: layer.id,
        kind: 'raster',
        asset: addAsset(assets.current, image),
        opacity: layer.opacity,
        blend: layer.blend,
        visible: layer.visible,
        adjustments: layer.adjustments,
      });
      if (changed)
        setNotice('Layer rasterized. Undo restores editable content.');
    } catch {
      setNotice('Could not rasterize layer');
    }
  };
  const load = async (selected?: File, asLayer = false) => {
    if (!selected?.type.startsWith('image/')) {
      setNotice('Choose an image file');
      return;
    }
    const original = current();
    try {
      if (selected.size > 64 * 1024 * 1024)
        throw new Error('Image file exceeds 64 MB');
      const url = URL.createObjectURL(selected);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (
        image.width * image.height > 16000000 ||
        image.width > 16000 ||
        image.height > 16000
      )
        throw new Error(
          'Image exceeds 16 megapixels. Current draft unchanged.',
        );
      const c = surface(image.width, image.height);
      c.getContext('2d')!.drawImage(image, 0, 0);
      if (current() !== original)
        throw new Error('Document changed during import. Please try again.');
      if (asLayer) {
        const added = addLayer({
          ...commonLayer(selected.name.slice(0, 160)),
          kind: 'raster',
          asset: addAsset(assets.current, c),
        });
        if (!added) return;
      } else if (
        !startRaster(c, selected.name.replace(/\.[^/.]+$/, '').slice(0, 160))
      )
        return;
      setNotice(asLayer ? 'Image layer added' : 'Photo opened');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'This image could not be opened',
      );
    } finally {
      if (file.current) file.current.value = '';
      if (layerFile.current) layerFile.current.value = '';
    }
  };
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };
  const pointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current || doc.rendering || !frame) return;
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!,
      p = point(e);
    canvas.current!.setPointerCapture(e.pointerId);
    if (tool === 'text') {
      const added = addLayer({
        ...commonLayer('Text ' + f.layers.length),
        kind: 'text',
        text: text || 'Your text',
        fontSize,
        fontFamily: 'Arial',
        bold: true,
        color,
        matrix: [1, 0, 0, 1, p.x, p.y],
      });
      if (added) setNotice('Editable text layer added');
      return;
    }
    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'crop') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (layer.locked || !layer.visible) {
      setNotice('Select a visible, unlocked layer');
      return;
    }
    if ((tool === 'brush' || tool === 'eraser') && layer.kind !== 'raster') {
      setNotice('Add a paint layer, or rasterize this layer before painting');
      return;
    }
    const g = {
      tool,
      start: p,
      last: p,
      frame: f,
      layer,
      moved: false,
      queued: [p],
    } as Gesture;
    gesture.current = g;
    if (tool === 'brush' || tool === 'eraser') {
      g.pending = (async () => {
        try {
          const buffer = await renderFrame(
            {
              ...f,
              layers: [
                {
                  ...layer,
                  opacity: 1,
                  blend: 'source-over',
                  adjustments: { ...neutral },
                },
              ],
            },
            assets.current,
          );
          if (gesture.current !== g) return;
          g.buffer = buffer;
          const x = buffer.getContext('2d')!;
          x.fillStyle = color;
          x.globalCompositeOperation =
            tool === 'eraser' ? 'destination-out' : 'source-over';
          x.beginPath();
          x.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
          x.fill();
          x.strokeStyle = color;
          x.lineWidth = size;
          x.lineCap = 'round';
          x.lineJoin = 'round';
          x.beginPath();
          x.moveTo(p.x, p.y);
          for (const point of g.queued || []) x.lineTo(point.x, point.y);
          x.stroke();
          g.queued = undefined;
          void paint(f, { [layer.id]: buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare paint layer');
        }
      })();
      await g.pending;
    }
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    g.moved = true;
    if ((g.tool === 'brush' || g.tool === 'eraser') && !g.buffer)
      g.queued?.push(p);
    if (g.tool === 'move' && g.layer) {
      const matrix = [...g.layer.matrix] as Matrix;
      matrix[4] += p.x - g.start.x;
      matrix[5] += p.y - g.start.y;
      void paint({
        ...g.frame,
        layers: g.frame.layers.map((l) =>
          l.id === g.layer!.id ? { ...l, matrix } : l,
        ),
      });
    } else if (g.buffer && g.layer) {
      const x = g.buffer.getContext('2d')!;
      x.strokeStyle = color;
      x.lineWidth = size;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(p.x, p.y);
      x.stroke();
      void paint(g.frame, { [g.layer.id]: g.buffer });
    } else if (g.tool === 'rectangle' || g.tool === 'ellipse') {
      const width = Math.abs(p.x - g.start.x),
        height = Math.abs(p.y - g.start.y);
      const layer: Layer = {
        ...commonLayer('Shape'),
        kind: g.tool === 'ellipse' ? 'ellipse' : 'rectangle',
        width: Math.max(1, width),
        height: Math.max(1, height),
        stroke: Math.max(1, size / 3),
        color,
        fill: false,
        matrix: [
          1,
          0,
          0,
          1,
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
        ],
      };
      void paint({ ...g.frame, layers: [...g.frame.layers, layer] });
    } else if (g.tool === 'crop') {
      const c = canvas.current!,
        x = c.getContext('2d')!;
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        x.save();
        x.strokeStyle = '#ffffff';
        x.lineWidth = 2;
        x.setLineDash([10, 6]);
        x.strokeRect(g.start.x, g.start.y, p.x - g.start.x, p.y - g.start.y);
        x.restore();
      });
    }
    g.last = p;
  };
  const pointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e),
      f = g.frame;
    await g.pending;
    if (gesture.current !== g) return;
    gesture.current = null;
    if (e.type === 'pointercancel') {
      void paint(current());
      setNotice('Gesture cancelled');
      return;
    }
    if (g.tool === 'move' && g.layer && g.moved) {
      const matrix = [...g.layer.matrix] as Matrix;
      matrix[4] += p.x - g.start.x;
      matrix[5] += p.y - g.start.y;
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id ? { ...l, matrix } : l,
        ),
      });
      if (changed) setNotice('Layer moved');
    } else if (g.buffer && g.layer) {
      const x = g.buffer.getContext('2d')!;
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(p.x, p.y);
      x.stroke();
      const asset = addAsset(assets.current, g.buffer);
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id
            ? ({ ...l, kind: 'raster', asset, matrix: identity() } as Layer)
            : l,
        ),
      });
      if (changed) setNotice('Paint layer updated');
    } else if ((g.tool === 'rectangle' || g.tool === 'ellipse') && g.moved) {
      addLayer({
        ...commonLayer('Shape ' + f.layers.length),
        kind: g.tool === 'ellipse' ? 'ellipse' : 'rectangle',
        width: Math.max(1, Math.round(Math.abs(p.x - g.start.x))),
        height: Math.max(1, Math.round(Math.abs(p.y - g.start.y))),
        stroke: Math.max(1, size / 3),
        color,
        fill: false,
        matrix: [
          1,
          0,
          0,
          1,
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
        ],
      });
    } else if (g.tool === 'crop' && g.moved) {
      const left = Math.max(0, Math.floor(Math.min(p.x, g.start.x))),
        top = Math.max(0, Math.floor(Math.min(p.y, g.start.y))),
        w = Math.floor(Math.min(f.w - left, Math.abs(p.x - g.start.x))),
        h = Math.floor(Math.min(f.h - top, Math.abs(p.y - g.start.y)));
      if (w > 0 && h > 0) {
        if (commit(transformFrame(f, [1, 0, 0, 1, -left, -top], w, h)))
          setNotice('Canvas cropped; layer pixels retained');
      } else void paint(f);
    } else void paint(f);
  };
  const transform = (a: 'left' | 'right' | 'h' | 'v') => {
    const f = current();
    const matrix: Matrix =
      a === 'left'
        ? [0, -1, 1, 0, 0, f.w]
        : a === 'right'
          ? [0, 1, -1, 0, f.h, 0]
          : a === 'h'
            ? [-1, 0, 0, 1, f.w, 0]
            : [1, 0, 0, -1, 0, f.h];
    const changed = commit(
      transformFrame(
        f,
        matrix,
        a === 'left' || a === 'right' ? f.h : f.w,
        a === 'left' || a === 'right' ? f.w : f.h,
      ),
    );
    if (changed) setNotice('Transform applied to document; layers preserved');
  };
  const undo = () => {
      travel(-1);
      setNotice('Undone');
    },
    redo = () => {
      travel(1);
      setNotice('Redone');
    };
  const download = async (type: 'png' | 'jpeg' = 'png') => {
    try {
      const image = await renderFrame(current(), assets.current),
        out = surface(image.width, image.height),
        x = out.getContext('2d')!;
      if (type === 'jpeg') {
        x.fillStyle = '#fff';
        x.fillRect(0, 0, out.width, out.height);
      }
      x.drawImage(image, 0, 0);
      const a = document.createElement('a');
      a.download = `${name || 'pixelforge-edit'}.${type === 'jpeg' ? 'jpg' : type}`;
      a.href = out.toDataURL(`image/${type}`, 0.92);
      a.click();
      setNotice(`${type === 'jpeg' ? 'JPG' : 'PNG'} export downloaded`);
    } catch {
      setNotice('Export failed. Your editable draft is kept.');
    }
  };
  const fitToScreen = () => {
      setZoom(72);
      stage.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      setNotice('Fit to screen');
    },
    openFile = () => file.current?.click();
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!menuArea.current?.contains(e.target as Node)) setActiveMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement,
        typing =
          /INPUT|TEXTAREA|SELECT/.test(target.tagName) ||
          target.isContentEditable,
        command = e.ctrlKey || e.metaKey;
      if (
        !ready ||
        cloudBusy ||
        gesture.current ||
        document.querySelector('dialog[open]')
      )
        return;
      if (e.key === 'Escape') {
        setActiveMenu(null);
        return;
      }
      if (typing) return;
      if (command) {
        const k = e.key.toLowerCase();
        if (['z', 'y', 's', 'o', 'n'].includes(k)) e.preventDefault();
        if (k === 'z') {
          if (e.shiftKey) redo();
          else undo();
        }
        if (k === 'y') redo();
        if (k === 's') void download();
        if (k === 'o') openFile();
        if (k === 'n') newDocument(false);
        return;
      }
      if (e.altKey) return;
      const match = TOOLS.find(
        (t) => t.key.toLowerCase() === e.key.toLowerCase(),
      );
      if (match) setTool(match.id);
      if (e.key === '0') fitToScreen();
      if (e.key === '1') setZoom(100);
      if (e.key === '+' || e.key === '=') setZoom((v) => Math.min(140, v + 10));
      if (e.key === '-') setZoom((v) => Math.max(20, v - 10));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const runCommand = (command: Command) => {
    if (command === 'resize')
      setResizing({ width: current().w, height: current().h });
    else if (command === 'project-save') exportProject();
    else if (command === 'project-open') projectFile.current?.click();
    else if (command === 'new-white') newDocument(false);
    else if (command === 'new-transparent') newDocument(true);
    else if (command === 'open') openFile();
    else if (command === 'png') void download();
    else if (command === 'jpg') void download('jpeg');
    else if (command === 'undo') undo();
    else if (command === 'redo') redo();
    else if (command === 'reset') resetAdjustments();
    else if (command === 'crop') {
      setTool('crop');
      setNotice('Drag on the image to crop');
    } else if (command === 'rotate-left') transform('left');
    else if (command === 'rotate-right') transform('right');
    else if (command === 'flip-h') transform('h');
    else if (command === 'flip-v') transform('v');
    else if (command.startsWith('filter-')) {
      const match = FILTERS.find(
        (f) => f[0].toLowerCase() === command.slice(7),
      );
      if (match) chooseFilter(match[1], match[0]);
    } else if (command === 'zoom-in') setZoom((v) => Math.min(140, v + 10));
    else if (command === 'zoom-out') setZoom((v) => Math.max(20, v - 10));
    else if (command === 'fit') fitToScreen();
    else if (command === 'actual') setZoom(100);
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <main
      className="editor-shell"
      role="application"
      aria-label="PixelForge photo editor"
      aria-busy={!ready}
      inert={!ready || cloudBusy}
      tabIndex={-1}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void load(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={layerFile}
        data-testid="layer-input"
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(e) => void load(e.target.files?.[0], true)}
      />
      <input
        ref={projectFile}
        data-testid="project-input"
        className="hidden"
        type="file"
        accept=".pixelforge,application/json"
        onChange={(event) => void importProject(event.target.files?.[0])}
      />
      {resizing && (
        <ResizeDialog
          width={resizing.width}
          height={resizing.height}
          close={() => setResizing(null)}
          apply={resizeImage}
        />
      )}
      <input
        ref={file}
        data-testid="file-input"
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(e) => load(e.target.files?.[0])}
      />
      <header className="topbar">
        <BrandLockup />
        <nav ref={menuArea} aria-label="Editor menus">
          {(Object.keys(MENU_DEFS) as MenuName[]).map((menuName) => (
            <div className="menu" key={menuName}>
              <button
                className={activeMenu === menuName ? 'menu-active' : ''}
                aria-haspopup="menu"
                aria-expanded={activeMenu === menuName}
                onClick={() =>
                  setActiveMenu((current) =>
                    current === menuName ? null : menuName,
                  )
                }
              >
                {menuName}
              </button>
              {activeMenu === menuName && (
                <div
                  className="menu-popup"
                  role="menu"
                  aria-label={`${menuName} menu`}
                >
                  {MENU_DEFS[menuName].map((item) => (
                    <button
                      key={item.label}
                      role="menuitem"
                      disabled={
                        (item.command === 'undo' && !canUndo) ||
                        (item.command === 'redo' && !canRedo)
                      }
                      onClick={() => {
                        setActiveMenu(null);
                        runCommand(item.command);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="top-actions">
          <button
            aria-label="Undo"
            className="icon"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo2 />
          </button>
          <button
            aria-label="Redo"
            className="icon"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo2 />
          </button>
          <button className="open" onClick={openFile}>
            <Upload /> Open image
          </button>
          <button className="export" onClick={() => download()}>
            <Download /> Export
          </button>
        </div>
      </header>
      <section className="docbar">
        <div>
          <FileImage />
          <input
            aria-label="Document name"
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <small>• &nbsp;{dimensions}</small>
        </div>
        <div className="draft-actions">
          <button
            onClick={() => {
              setDraftId(createDraftId());
              clearCloud();
              setNotice('New local copy created. The original draft is kept.');
            }}
          >
            Save local copy
          </button>
          <a href="/">Home</a>
          <button onClick={() => void discard()}>Discard draft</button>
        </div>
      </section>
      <div className="workspace">
        <aside className="toolbar" aria-label="Tools">
          {TOOLS.map(({ id, label, icon: Icon, key }) => (
            <button
              key={id}
              className={tool === id ? 'active' : ''}
              onClick={() => {
                setTool(id);
                setNotice(`${label} tool selected`);
              }}
              aria-label={`${label} tool`}
              title={`${label} (${key})`}
            >
              <Icon />
              <span>{label}</span>
              <kbd>{key}</kbd>
            </button>
          ))}
          <hr />
          <label className="color">
            <input
              aria-label="Drawing color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <i style={{ background: color }} />
            <small>Color</small>
          </label>
        </aside>
        <section ref={stage} className={`stage ${drag ? 'dragging' : ''}`}>
          {saveStatus === LOCAL_CONFLICT && (
            <div role="alert" className="draft-conflict">
              {LOCAL_CONFLICT}
            </div>
          )}
          {drag && (
            <div className="drop">
              <ImagePlus />
              <b>Drop your photo here</b>
              <span>JPG, PNG, WEBP and more</span>
            </div>
          )}
          <div className="canvas-wrap" style={{ width: `${zoom}%` }}>
            <canvas
              ref={canvas}
              data-testid="editor-canvas"
              data-rendering={doc.rendering ? 'true' : 'false'}
              onPointerDown={(e) => void pointerDown(e)}
              onPointerMove={pointerMove}
              onPointerUp={(e) => void pointerUp(e)}
              onPointerCancel={(e) => void pointerUp(e)}
              className={`tool-${tool}`}
            />
          </div>
          <div className="zoom">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(20, zoom - 10))}
            >
              <ZoomOut />
            </button>
            <input
              aria-label="Zoom"
              type="range"
              min="20"
              max="140"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
            <span>{zoom}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(140, zoom + 10))}
            >
              <ZoomIn />
            </button>
          </div>
        </section>
        <aside className="inspector">
          {frame && (
            <LayersPanel
              frame={frame}
              select={select}
              edit={editLayer}
              add={addPaint}
              duplicate={duplicate}
              remove={remove}
              reorder={reorder}
              rasterize={() => void rasterize()}
              importImage={() => layerFile.current?.click()}
            />
          )}
          <section className="panel">
            <Title
              icon={WandSparkles}
              text="Adjust selected layer"
              action="Reset"
              onClick={() => {
                resetAdjustments();
                setNotice('Adjustments reset');
              }}
            />
            <Slider
              label="Brightness"
              value={brightness}
              min={20}
              max={180}
              set={setBrightness}
            />
            <Slider
              label="Contrast"
              value={contrast}
              min={20}
              max={180}
              set={setContrast}
            />
            <Slider
              label="Saturation"
              value={saturation}
              min={0}
              max={200}
              set={setSaturation}
            />
            <Slider
              label="Blur"
              value={blur}
              min={0}
              max={12}
              set={setBlur}
              suffix="px"
            />
            <p className="adjust-note">
              Adjustments stay editable on the selected layer.
            </p>
          </section>
          <section className="panel">
            <Title icon={Crop} text="Transform" />
            <div className="transform">
              <button
                aria-label="Rotate left"
                onClick={() => transform('left')}
              >
                <RotateCcw />
              </button>
              <button
                aria-label="Rotate right"
                onClick={() => transform('right')}
              >
                <RotateCw />
              </button>
              <button
                aria-label="Flip horizontal"
                onClick={() => transform('h')}
              >
                <FlipHorizontal2 />
              </button>
              <button aria-label="Flip vertical" onClick={() => transform('v')}>
                <FlipVertical2 />
              </button>
            </div>
          </section>
          {(tool === 'brush' || tool === 'eraser' || tool === 'rectangle' || tool === 'ellipse') && (
            <section className="panel">
              <Title icon={Brush} text="Tool options" />
              <Slider
                label="Size"
                value={size}
                min={2}
                max={100}
                set={setSize}
                suffix="px"
              />
            </section>
          )}
          {tool === 'text' && (
            <section className="panel">
              <Title icon={Type} text="Text" />
              <input
                aria-label="Text content"
                className="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Slider
                label="Size"
                value={fontSize}
                min={16}
                max={160}
                set={setFontSize}
                suffix="px"
              />
            </section>
          )}
          <section className="panel">
            <Title icon={Sparkles} text="Quick filters" />
            <div className="filters">
              {FILTERS.map(([label, value, first, second]) => (
                <button
                  key={label}
                  className={filter === value ? 'selected' : ''}
                  onClick={() => chooseFilter(value, label)}
                  aria-label={`${label} filter`}
                >
                  <i
                    style={{
                      background: `linear-gradient(135deg,${first},${second})`,
                    }}
                  />
                  <small>{label}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="panel cloud-panel">
            <h3>My projects</h3>
            {member ? (
              <>
                <p>Signed in as {member.name}</p>
                <button
                  className="apply"
                  disabled={cloudBusy}
                  onClick={() => void saveToCloud()}
                >
                  {cloud?.owner === member.id
                    ? 'Update cloud project'
                    : 'Save to my projects'}
                </button>
                {cloud?.owner === member.id && (
                  <button
                    className="apply"
                    disabled={cloudBusy}
                    onClick={() => void saveToCloud(true)}
                  >
                    Save as new cloud project
                  </button>
                )}
                <p>
                  Local changes autosave. Use Update to sync your cloud copy, or
                  save a new project to keep both versions.
                </p>
                <a href="/#projects-heading">View my projects</a>
              </>
            ) : (
              <>
                <p>
                  Editing is free. Optionally sign in to save private projects
                  across devices.
                </p>
                <a href={SIGN_IN}>Sign in with Cheaply</a>
              </>
            )}
            <p aria-live="polite">{cloudMessage}</p>
          </section>
        </aside>
      </div>
      <footer>
        <span>
          <i />
          {notice}
        </span>
        <span>{tool[0].toUpperCase() + tool.slice(1)} tool</span>
        <output
          aria-label="Draft save status"
          title="This bookmark restores the document in this browser. Clearing browser data removes local documents; export a backup."
        >
          {saveStatus}
        </output>
        <button onClick={() => download('jpeg')}>
          <Save /> Save JPG
        </button>
      </footer>
    </main>
  );
}

function Title({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: typeof Brush;
  text: string;
  action?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="panel-title">
      <span>
        <Icon />
        {text}
      </span>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}
function Slider({
  label,
  value,
  min,
  max,
  set,
  suffix = '%',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="slider">
      <span>
        <b>{label}</b>
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(+e.target.value)}
      />
    </label>
  );
}
