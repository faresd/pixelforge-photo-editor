'use client';

import {
  Brush,
  Crop,
  Download,
  Eraser,
  FileImage,
  Copy,
  Columns3,
  Palette,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Hand,
  Pipette,
  PaintBucket,
  Pencil,
  MousePointer2,
  Redo2,
  Rows3,
  RotateCcw,
  RotateCw,
  Save,
  Shapes,
  Sparkles,
  Type,
  Undo2,
  Upload,
  WandSparkles,
  Wand2,
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
  colorSelectMask,
  commonLayer,
  decodeAsset,
  inversePoint,
  localSize,
  neutral,
  rasterFrame,
  replaceColorStroke,
  renderFrame,
  surface,
  transformFrameWithMasks,
  floodFill,
  type Adjustments,
  type Group,
  type Layer,
  type Frame,
  type Matrix,
  type Selection,
  type SelectionOperation,
  type SelectionPart,
} from '../src/document';
import { useDocument } from '../src/useDocument';
import LayersPanel from '../src/LayersPanel';
import ResizeDialog from '../src/ResizeDialog';
import ExportDialog from '../src/ExportDialog';
import { type ExportFormat } from '../src/export';
import { renderSelection } from '../src/selections';
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
  | 'webp'
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
  { id: 'hand', label: 'Hand', icon: Hand, key: 'H' },
  { id: 'zoom', label: 'Zoom', icon: ZoomIn, key: 'Z' },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette, key: 'I' },
  { id: 'fill', label: 'Fill', icon: PaintBucket, key: 'G' },
  { id: 'gradient', label: 'Gradient', icon: Palette, key: 'G' },
  { id: 'clone', label: 'Clone', icon: Copy, key: 'S' },
  { id: 'heal', label: 'Healing', icon: WandSparkles, key: 'J' },
  { id: 'crop', label: 'Crop', icon: Crop, key: 'C' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'pencil', label: 'Pencil', icon: Pencil, key: 'B' },
  { id: 'color-replace', label: 'Color Replace', icon: Palette, key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'text', label: 'Text', icon: Type, key: 'T' },
  { id: 'rectangle', label: 'Shape', icon: Shapes, key: 'U' },
  { id: 'ellipse', label: 'Ellipse', icon: Shapes, key: 'U' },
  { id: 'select', label: 'Select', icon: Crop, key: 'M' },
  { id: 'ellipse-select', label: 'Elliptical marquee', icon: Shapes, key: 'M' },
  { id: 'row-select', label: 'Single Row marquee', icon: Rows3, key: 'M' },
  { id: 'column-select', label: 'Single Column marquee', icon: Columns3, key: 'M' },
  { id: 'lasso', label: 'Lasso', icon: WandSparkles, key: 'L' },
  { id: 'magic-wand', label: 'Magic Wand', icon: Wand2, key: 'W' },
];
const MARQUEE_TOOLS: Tool[] = [
  'select',
  'ellipse-select',
  'row-select',
  'column-select',
];
/** Photoshop's repeated-key tool groups, limited to tools PixelForge actually implements. */
const TOOL_GROUPS: Record<string, Tool[]> = {
  g: ['gradient', 'fill'],
  b: ['brush', 'pencil', 'color-replace'],
  u: ['rectangle', 'ellipse'],
  m: MARQUEE_TOOLS,
};
/** Existing PixelForge aliases retained while the primary keys follow Photoshop. */
const TOOL_ALIASES: Record<string, Tool> = {
  a: 'color-replace',
  o: 'ellipse',
  p: 'pencil',
  r: 'rectangle',
};
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
    { label: 'Export as JPEG', command: 'jpg' },
    { label: 'Export as WebP', command: 'webp' },
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
  source?: HTMLCanvasElement;
  replaceTarget?: [number, number, number, number];
  pending?: Promise<void>;
  queued?: { x: number; y: number }[];
  points?: { x: number; y: number }[];
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
    [selectionOperation, setSelectionOperation] = useState<SelectionOperation>('replace'),
    [zoom, setZoom] = useState(72),
    [color, setColor] = useState('#ff5c35'),
    [backgroundColor, setBackgroundColor] = useState('#ffffff'),
    [size, setSize] = useState(18),
    [brushOpacity, setBrushOpacity] = useState(100),
    [hardness, setHardness] = useState(100),
    [colorTolerance, setColorTolerance] = useState(24),
    [exportFormat, setExportFormat] = useState<ExportFormat>('png'),
    [exportQuality, setExportQuality] = useState(92),
    [text, setText] = useState('Your text'),
    [fontSize, setFontSize] = useState(56);
  const [cloneSource, setCloneSource] = useState<{ x: number; y: number } | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null),
    [exporting, setExporting] = useState<{ frame: Frame; assets: typeof assets.current; name: string } | null>(null),
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
    backgroundColor,
    size,
    brushOpacity,
    hardness,
    colorTolerance,
    exportFormat,
    exportQuality,
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
    setBackgroundColor(s.backgroundColor || '#ffffff');
    setSize(s.size);
    setBrushOpacity(s.brushOpacity ?? 100);
    setHardness(s.hardness ?? 100);
    setColorTolerance(s.colorTolerance ?? 24);
    setExportFormat(s.exportFormat ?? 'png');
    setExportQuality(s.exportQuality ?? 92);
    setText(s.text);
    setFontSize(s.fontSize);
  };
  const resetColors = () => {
    setColor('#000000');
    setBackgroundColor('#ffffff');
    setNotice('Foreground and background colors reset');
  };
  const swapColors = () => {
    setColor(backgroundColor);
    setBackgroundColor(color);
    setNotice('Foreground and background colors swapped');
  };
  const current = () => history.current[index.current];
  const groupForLayer = (f: Frame, layer: Layer) =>
    layer.groupId ? f.groups?.find((group) => group.id === layer.groupId) : undefined;
  const layerIsLocked = (f: Frame, layer: Layer) =>
    layer.locked || Boolean(groupForLayer(f, layer)?.locked);
  const editLayer = (patch: Partial<Layer>) => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    const group = groupForLayer(f, layer);
    if (group?.locked || (layer.locked && !('locked' in patch) && !('visible' in patch))) {
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
  const editGroup = (id: string, patch: Partial<Group>) => {
    const f = current(),
      group = f.groups?.find((item) => item.id === id);
    if (!group) return false;
    if (
      group.locked &&
      !('locked' in patch) &&
      !('visible' in patch) &&
      !('collapsed' in patch)
    ) {
      setNotice('Unlock this group before editing it');
      return false;
    }
    const next = { ...group, ...patch };
    if (JSON.stringify(next) === JSON.stringify(group)) return true;
    if (
      commit({
        ...f,
        groups: (f.groups || []).map((item) => (item.id === id ? next : item)),
      })
    ) {
      setNotice('Group updated');
      return true;
    }
    return false;
  };
  const setSelection = (selection: Selection | undefined) => {
    const f = current();
    if (JSON.stringify(f.selection) === JSON.stringify(selection)) return;
    if (commit({ ...f, selection }))
      setNotice(selection ? `${selection.shape === 'ellipse' ? 'Elliptical' : 'Rectangular'} selection created` : 'Selection cleared');
  };
  const selectAll = () => {
    const f = current();
    setSelection({
      shape: 'rectangle',
      x: 0,
      y: 0,
      w: f.w,
      h: f.h,
      feather: 0,
      inverted: false,
      parts: [
        {
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          operation: 'replace',
        },
      ],
    });
    setNotice('Entire canvas selected');
  };
  const selectionPart = (selection: Selection): SelectionPart => ({
    shape: selection.shape,
    x: selection.x,
    y: selection.y,
    w: selection.w,
    h: selection.h,
    points: selection.points,
    operation: 'replace',
  });
  const mergeSelection = (next: Selection) => {
    const currentSelection = current().selection;
    if (!currentSelection || selectionOperation === 'replace') {
      setSelection({ ...next, parts: [selectionPart(next)] });
      return;
    }
    const parts = currentSelection.parts?.slice() || [selectionPart(currentSelection)];
    parts.push({ ...selectionPart(next), operation: selectionOperation });
    setSelection({ ...next, parts });
  };
  const invertSelection = () => {
    const f = current();
    if (!f.selection) {
      setNotice('Select an area before inverting it');
      return;
    }
    setSelection({ ...f.selection, inverted: !f.selection.inverted });
  };
  const setSelectionFeather = (feather: number) => {
    const f = current();
    if (f.selection && commit({ ...f, selection: { ...f.selection, feather } }))
      setNotice(`Selection feather set to ${Math.round(feather)} px`);
  };
  const createMaskFromSelection = async () => {
    const f = current(), layer = f.layers.find((l) => l.id === f.active);
    if (!f.selection || !layer || layer.kind !== 'raster') {
      setNotice('Select a raster layer and create a selection first');
      return;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before editing its mask');
      return;
    }
    const mask = await renderSelection(f.selection, f.w, f.h, assets.current);
    const maskId = addAsset(assets.current, mask);
    if (editLayer({ mask: maskId })) setNotice('Nondestructive layer mask created');
  };
  const clearMask = () => {
    const layer = current().layers.find((l) => l.id === current().active);
    if (layer?.mask && editLayer({ mask: undefined })) setNotice('Layer mask removed; source pixels kept');
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
      settings: { tool, zoom, color, backgroundColor, size, brushOpacity, hardness, colorTolerance, exportFormat, exportQuality, text, fontSize, ...neutral },
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
    backgroundColor,
    size,
    brushOpacity,
    hardness,
    colorTolerance,
    exportFormat,
    exportQuality,
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
  const resizeImage = async (w: number, h: number) => {
    const f = current();
    const next = await transformFrameWithMasks(
      f,
      [w / f.w, 0, 0, h / f.h, 0, 0],
      assets.current,
      w,
      h,
    );
    if (!commit(next))
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
  const groupActiveLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer) return;
    if (layer.groupId) {
      setNotice('The active layer is already in a group');
      return;
    }
    if ((f.groups || []).length >= 32) {
      setNotice('32-group limit reached');
      return;
    }
    const group: Group = {
      id: crypto.randomUUID(),
      name: `Group ${(f.groups || []).length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      collapsed: false,
    };
    if (
      commit({
        ...f,
        groups: [...(f.groups || []), group],
        layers: f.layers.map((item) =>
          item.id === layer.id ? { ...item, groupId: group.id } : item,
        ),
      })
    )
      setNotice('Layer added to a new group');
  };
  const ungroupActiveLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active),
      groupId = layer?.groupId;
    if (!layer || !groupId) {
      setNotice('Select a grouped layer first');
      return;
    }
    const group = f.groups?.find((item) => item.id === groupId);
    if (group?.locked) {
      setNotice('Unlock this group before ungrouping');
      return;
    }
    const layers = f.layers.map((item) => {
      if (item.id !== layer.id) return item;
      const { groupId: _groupId, ...withoutGroup } = item;
      return withoutGroup as Layer;
    });
    const stillUsed = layers.some((item) => item.groupId === groupId);
    if (
      commit({
        ...f,
        groups: stillUsed ? f.groups : (f.groups || []).filter((item) => item.id !== groupId),
        layers,
      })
    )
      setNotice(stillUsed ? 'Layer removed from group' : 'Empty group removed');
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
    if (layerIsLocked(f, layer)) return;
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
    if (layerIsLocked(f, layer) || f.layers.length === 1) return;
    const layers = f.layers.filter((l) => l.id !== f.active);
    commit({ ...f, layers, active: layers.at(-1)!.id });
    setNotice('Layer deleted. Undo restores it.');
  };
  const reorder = (direction: number) => {
    const f = current(),
      layers = f.layers.slice(),
      from = layers.findIndex((l) => l.id === f.active),
      to = from + direction;
    if (to < 0 || to >= layers.length || layerIsLocked(f, layers[from])) return;
    [layers[from], layers[to]] = [layers[to], layers[from]];
    commit({ ...f, layers });
  };
  const rasterize = async () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    if (layerIsLocked(f, layer)) return;
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
        groupId: layer.groupId,
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
  const pressure = (e: React.PointerEvent<HTMLCanvasElement>) =>
    (e.pointerType === 'pen' || e.pointerType === 'touch') && e.pressure > 0 && e.pressure <= 1
      ? e.pressure
      : 1;
  const pointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current || doc.rendering || !frame) return;
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!,
      p = point(e);
    const local =
      layer.kind === 'raster' ? inversePoint(layer.matrix, p) || p : p;
    canvas.current!.setPointerCapture(e.pointerId);
    if (tool === 'zoom') {
      setZoom((value) => Math.min(140, value + 10));
      setNotice('Zoomed in');
      return;
    }
    if (tool === 'eyedropper') {
      const pixel = canvas.current!.getContext('2d')!.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor('#' + [pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, '0')).join(''));
      setNotice('Color sampled from image');
      return;
    }
    if (tool === 'hand') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (tool === 'fill') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before filling');
        return;
      }
      try {
        const image = await decodeAsset(assets.current[layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        if (!floodFill(buffer, local.x, local.y, color)) {
          setNotice('No contiguous pixels matched at that point');
          return;
        }
        const asset = addAsset(assets.current, buffer);
        if (commit({ ...f, layers: f.layers.map((item) => item.id === layer.id ? { ...item, asset } : item) }))
          setNotice('Area filled; undo restores the original pixels');
      } catch {
        setNotice('Could not fill this layer');
      }
      return;
    }
    if (tool === 'clone' || tool === 'heal') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before retouching');
        return;
      }
      if (!cloneSource) {
        setCloneSource(local);
        setNotice('Clone source set; drag on the image to paint it');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        moved: false,
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        const sourceImage = await decodeAsset(assets.current[layer.asset]),
          source = surface(sourceImage.naturalWidth, sourceImage.naturalHeight);
        source.getContext('2d')!.drawImage(sourceImage, 0, 0);
        if (gesture.current !== g) return;
        g.source = source;
        g.buffer = surface(source.width, source.height);
        g.buffer.getContext('2d')!.drawImage(source, 0, 0);
      })();
      await g.pending;
      return;
    }
    if (tool === 'color-replace') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before replacing colors');
        return;
      }
      const g = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        moved: false,
      } as Gesture;
      gesture.current = g;
      g.pending = (async () => {
        try {
          const sourceImage = await decodeAsset(assets.current[layer.asset]),
            source = surface(sourceImage.naturalWidth, sourceImage.naturalHeight);
          source.getContext('2d')!.drawImage(sourceImage, 0, 0);
          if (gesture.current !== g) return;
          const sample = source
            .getContext('2d')!
            .getImageData(
              Math.max(0, Math.min(source.width - 1, Math.floor(local.x))),
              Math.max(0, Math.min(source.height - 1, Math.floor(local.y))),
              1,
              1,
            ).data;
          g.source = source;
          g.replaceTarget = [sample[0], sample[1], sample[2], sample[3]];
          g.buffer = surface(source.width, source.height);
          g.buffer.getContext('2d')!.drawImage(source, 0, 0);
          replaceColorStroke(
            source,
            g.buffer,
            g.replaceTarget,
            local.x,
            local.y,
            local.x,
            local.y,
            color,
            size,
            colorTolerance,
            brushOpacity / 100,
          );
          void paint(f, { [layer.id]: g.buffer });
        } catch {
          gesture.current = null;
          setNotice('Could not prepare color replacement');
        }
      })();
      await g.pending;
      return;
    }
    if (tool === 'gradient') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before applying a gradient');
        return;
      }
      gesture.current = { tool, start: local, last: local, frame: f, layer, moved: false };
      return;
    }
    if (tool === 'magic-wand') {
      if (layerIsLocked(f, layer) || !layer.visible || layer.kind !== 'raster') {
        setNotice('Select a visible, unlocked raster layer before color-selecting');
        return;
      }
      try {
        const source = await renderFrame({ ...f, layers: [layer] }, assets.current),
          mask = colorSelectMask(source, p.x, p.y),
          maskId = addAsset(assets.current, mask);
        if (selectionOperation !== 'replace')
          setNotice('Color selection currently replaces the active selection; geometric selections support composition');
        setSelection({ shape: 'rectangle', x: 0, y: 0, w: f.w, h: f.h, feather: 0, inverted: false, mask: maskId });
        setNotice('Color selection created from contiguous pixels');
      } catch {
        setNotice('Could not create a color selection');
      }
      return;
    }
    if (tool === 'row-select' || tool === 'column-select') {
      // Photoshop's single-row and single-column marquees are one-pixel
      // precision presets. A click is enough; using the pointer-down point
      // also keeps the interaction reliable on touch and pen devices.
      const x = Math.max(0, Math.min(f.w - 1, Math.floor(p.x))),
        y = Math.max(0, Math.min(f.h - 1, Math.floor(p.y)));
      const row = tool === 'row-select';
      mergeSelection({
        shape: 'rectangle',
        x: row ? 0 : x,
        y: row ? y : 0,
        w: row ? f.w : 1,
        h: row ? 1 : f.h,
        feather: 0,
        inverted: false,
      });
      setNotice(row ? 'Single row selection created' : 'Single column selection created');
      return;
    }
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
    if (tool === 'select' || tool === 'ellipse-select' || tool === 'lasso') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false, points: [p] };
      return;
    }
    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'crop') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (layerIsLocked(current(), layer) || !layer.visible) {
      setNotice('Select a visible, unlocked layer');
      return;
    }
    if ((tool === 'brush' || tool === 'pencil' || tool === 'eraser') && layer.kind !== 'raster') {
      setNotice('Add a paint layer, or rasterize this layer before painting');
      return;
    }
    const rasterAsset = layer.kind === 'raster' ? layer.asset : null;
    const g = {
      tool,
      start: tool === 'move' ? p : local,
      last: tool === 'move' ? p : local,
      frame: f,
      layer,
      moved: false,
      queued: [local],
    } as Gesture;
    gesture.current = g;
    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      g.pending = (async () => {
        try {
          const image = await decodeAsset(assets.current[rasterAsset!]),
            buffer = surface(image.naturalWidth, image.naturalHeight);
          buffer.getContext('2d')!.drawImage(image, 0, 0);
          if (gesture.current !== g) return;
          g.buffer = buffer;
          const x = buffer.getContext('2d')!;
          x.fillStyle = color;
          x.globalCompositeOperation =
            tool === 'eraser' ? 'destination-out' : 'source-over';
          const pointPressure = pressure(e),
            radius = Math.max(0.5, (localSize(layer.matrix, size) * pointPressure) / 2),
            softness = tool === 'pencil' ? 0 : Math.max(0, Math.min(1, (100 - hardness) / 100));
          x.globalAlpha = (brushOpacity / 100) * pointPressure;
          x.filter = softness ? `blur(${Math.max(0.1, radius * softness)}px)` : 'none';
          x.beginPath();
          x.arc(local.x, local.y, radius, 0, Math.PI * 2);
          x.fill();
          x.strokeStyle = color;
          x.lineWidth = radius * 2;
          x.lineCap = 'round';
          x.lineJoin = 'round';
          x.beginPath();
          x.moveTo(local.x, local.y);
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
    const local =
      g.layer?.kind === 'raster' ? inversePoint(g.layer.matrix, p) || p : p;
    g.moved = true;
    if (g.tool === 'hand') {
      if (stage.current) {
        stage.current.scrollLeft -= p.x - g.last.x;
        stage.current.scrollTop -= p.y - g.last.y;
      }
      g.last = p;
      return;
    }
    if ((g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') && !g.buffer)
      g.queued?.push(local);
    if ((g.tool === 'clone' || g.tool === 'heal') && g.buffer && g.source && cloneSource) {
      const x = g.buffer.getContext('2d')!, radius = Math.max(0.5, (localSize(g.layer!.matrix, size) * pressure(e)) / 2);
      const dx = local.x - g.start.x, dy = local.y - g.start.y;
      x.save();
      x.globalAlpha = (g.tool === 'heal' ? 0.65 : 1) * (brushOpacity / 100) * pressure(e);
      x.filter = g.tool === 'heal' || hardness < 100 ? `blur(${g.tool === 'heal' ? 1 : Math.max(0.1, radius * (100 - hardness) / 100)}px)` : 'none';
      x.beginPath();
      x.arc(local.x, local.y, radius, 0, Math.PI * 2);
      x.clip();
      x.drawImage(g.source, cloneSource.x + dx - radius, cloneSource.y + dy - radius, radius * 2, radius * 2, local.x - radius, local.y - radius, radius * 2, radius * 2);
      x.restore();
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (g.tool === 'color-replace' && g.buffer && g.source && g.replaceTarget && g.layer) {
      replaceColorStroke(
        g.source,
        g.buffer,
        g.replaceTarget,
        g.last.x,
        g.last.y,
        local.x,
        local.y,
        color,
        size,
        colorTolerance,
        (brushOpacity / 100) * pressure(e),
      );
      void paint(g.frame, { [g.layer.id]: g.buffer });
      g.last = local;
      return;
    }
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
    } else if ((g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') && g.buffer && g.layer) {
      const x = g.buffer.getContext('2d')!;
      x.strokeStyle = color;
      x.globalAlpha = (brushOpacity / 100) * pressure(e);
      const diameter = localSize(g.layer.matrix, size) * pressure(e);
      x.filter = g.tool === 'pencil' || hardness >= 100 ? 'none' : `blur(${Math.max(0.1, (diameter / 2) * (100 - hardness) / 100)}px)`;
      x.lineWidth = g.tool === 'pencil' ? Math.max(1, Math.round(diameter)) : diameter;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(local.x, local.y);
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
    } else if (g.tool === 'select' || g.tool === 'ellipse-select') {
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const c = canvas.current!, x = c.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        const left = Math.min(g.start.x, p.x), top = Math.min(g.start.y, p.y),
          width = Math.abs(p.x - g.start.x), height = Math.abs(p.y - g.start.y);
        if (g.tool === 'ellipse-select') {
          x.beginPath();
          x.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
          x.stroke();
        } else x.strokeRect(left, top, width, height);
        x.restore();
      });
    } else if (g.tool === 'lasso') {
      const points = g.points || (g.points = [g.start]);
      if (Math.hypot(p.x - g.last.x, p.y - g.last.y) >= 2) points.push(p);
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const x = canvas.current!.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        x.beginPath();
        x.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) x.lineTo(point.x, point.y);
        x.stroke();
        x.restore();
      });
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
    g.last = g.layer?.kind === 'raster' ? local : p;
  };
  const pointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e),
      f = g.frame;
    const local =
      g.layer?.kind === 'raster' ? inversePoint(g.layer.matrix, p) || p : p;
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
    } else if ((g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') && g.buffer && g.layer) {
      const x = g.buffer.getContext('2d')!;
      x.globalAlpha = (brushOpacity / 100) * pressure(e);
      const diameter = localSize(g.layer.matrix, size) * pressure(e);
      x.filter = g.tool === 'pencil' || hardness >= 100 ? 'none' : `blur(${Math.max(0.1, (diameter / 2) * (100 - hardness) / 100)}px)`;
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(local.x, local.y);
      x.stroke();
      const asset = addAsset(assets.current, g.buffer);
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id
            ? ({ ...l, kind: 'raster', asset } as Layer)
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
    } else if ((g.tool === 'select' || g.tool === 'ellipse-select') && g.moved) {
      const x = Math.max(0, Math.min(g.start.x, p.x)),
        y = Math.max(0, Math.min(g.start.y, p.y)),
        w = Math.min(f.w - x, Math.abs(p.x - g.start.x)),
        h = Math.min(f.h - y, Math.abs(p.y - g.start.y));
      if (w > 0 && h > 0)
        mergeSelection({ shape: g.tool === 'ellipse-select' ? 'ellipse' : 'rectangle', x, y, w, h, feather: 0, inverted: false });
      else void paint(f);
    } else if (g.tool === 'lasso' && g.moved) {
      const points = g.points || [];
      if (points.length >= 3) {
        const x = Math.max(0, Math.min(...points.map((point) => point.x))),
          y = Math.max(0, Math.min(...points.map((point) => point.y))),
          right = Math.min(f.w, Math.max(...points.map((point) => point.x))),
          bottom = Math.min(f.h, Math.max(...points.map((point) => point.y)));
        mergeSelection({ shape: 'polygon', x, y, w: right - x, h: bottom - y, points, feather: 0, inverted: false });
      } else void paint(f);
    } else if (g.tool === 'crop' && g.moved) {
      const left = Math.max(0, Math.floor(Math.min(p.x, g.start.x))),
        top = Math.max(0, Math.floor(Math.min(p.y, g.start.y))),
        w = Math.floor(Math.min(f.w - left, Math.abs(p.x - g.start.x))),
        h = Math.floor(Math.min(f.h - top, Math.abs(p.y - g.start.y)));
      if (w > 0 && h > 0) {
        if (commit(await transformFrameWithMasks(f, [1, 0, 0, 1, -left, -top], assets.current, w, h)))
          setNotice('Canvas cropped; layer pixels retained');
      } else void paint(f);
    } else if (g.tool === 'gradient' && g.moved && g.layer) {
      try {
        if (g.layer.kind !== 'raster') return;
        const image = await decodeAsset(assets.current[g.layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        const context = buffer.getContext('2d')!,
          gradient = context.createLinearGradient(g.start.x, g.start.y, local.x, local.y);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#ffffff00');
        context.fillStyle = gradient;
        context.fillRect(0, 0, buffer.width, buffer.height);
        const asset = addAsset(assets.current, buffer);
        if (commit({ ...f, layers: f.layers.map((item) => item.id === g.layer!.id ? { ...item, asset } : item) }))
          setNotice('Gradient applied; undo restores the original pixels');
      } catch {
        setNotice('Could not apply gradient');
      }
    } else if ((g.tool === 'clone' || g.tool === 'heal') && g.buffer && g.layer) {
      const asset = addAsset(assets.current, g.buffer);
      if (commit({ ...f, layers: f.layers.map((item) => item.id === g.layer!.id ? { ...item, asset } : item) }))
        setNotice(g.tool === 'heal' ? 'Healing stroke applied' : 'Clone stroke applied');
    } else if (g.tool === 'color-replace' && g.buffer && g.layer) {
      const asset = addAsset(assets.current, g.buffer);
      if (commit({ ...f, layers: f.layers.map((item) => item.id === g.layer!.id ? { ...item, asset } : item) }))
        setNotice('Color replacement applied; undo restores the original pixels');
    } else void paint(f);
  };
  const transform = async (a: 'left' | 'right' | 'h' | 'v') => {
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
      await transformFrameWithMasks(
        f,
        matrix,
        assets.current,
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
  const download = (format?: ExportFormat) => {
    if (format) setExportFormat(format);
    setExporting({ frame: current(), assets: { ...assets.current }, name });
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
        if (
          ['z', 'y', 's', 'o', 'n', 'a', 'd', 'g', 'j', 'i'].includes(k) ||
          (k === 'w' && !e.altKey)
        )
          e.preventDefault();
        if (k === 'z') {
          if (e.shiftKey) redo();
          else undo();
        }
        if (k === 'y') redo();
        if (k === 's') {
          if (e.shiftKey) exportProject();
          else download();
        }
        if (k === 'o') openFile();
        if (k === 'n') newDocument(false);
        if (k === 'a') {
          if (e.shiftKey) setSelection(undefined);
          else selectAll();
        }
        if (k === 'd') setSelection(undefined);
        if (k === 'i') {
          if (e.altKey) setResizing({ width: current().w, height: current().h });
          else invertSelection();
        }
        if (k === 'g' && !e.altKey) {
          if (e.shiftKey) ungroupActiveLayer();
          else groupActiveLayer();
        }
        if (k === 'j' && !e.shiftKey) duplicate();
        return;
      }
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        resetColors();
        return;
      }
      if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        swapColors();
        return;
      }
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        setSize((value) => Math.max(2, Math.min(100, value + (e.key === ']' ? 2 : -2))));
        return;
      }
      if (e.altKey) return;
      const lower = e.key.toLowerCase();
      const group = TOOL_GROUPS[lower];
      if (group) {
        e.preventDefault();
        const index = group.indexOf(tool);
        const direction = e.shiftKey ? -1 : 1;
        const next = group[(index < 0 ? 0 : index + direction + group.length) % group.length];
        setTool(next);
        setNotice(`${TOOLS.find((item) => item.id === next)?.label || next} tool selected`);
        return;
      }
      const alias = TOOL_ALIASES[lower];
      if (alias) {
        e.preventDefault();
        setTool(alias);
        setNotice(`${TOOLS.find((item) => item.id === alias)?.label || alias} tool selected`);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        fitToScreen();
      }
      if (e.key === '1') {
        e.preventDefault();
        setZoom(100);
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((v) => Math.min(140, v + 10));
      }
      if (e.key === '-') {
        e.preventDefault();
        setZoom((v) => Math.max(20, v - 10));
      }
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
    else if (command === 'png') download('png');
    else if (command === 'jpg') download('jpeg');
    else if (command === 'webp') download('webp');
    else if (command === 'undo') undo();
    else if (command === 'redo') redo();
    else if (command === 'reset') resetAdjustments();
    else if (command === 'crop') {
      setTool('crop');
      setNotice('Drag on the image to crop');
    } else if (command === 'rotate-left') void transform('left');
    else if (command === 'rotate-right') void transform('right');
    else if (command === 'flip-h') void transform('h');
    else if (command === 'flip-v') void transform('v');
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
      {exporting && <ExportDialog {...exporting} format={exportFormat} quality={exportQuality} setFormat={setExportFormat} setQuality={setExportQuality} close={() => setExporting(null)} downloaded={setNotice} />}
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
                setCloneSource(null);
                setNotice(`${label} tool selected`);
              }}
              aria-label={`${label} tool`}
              aria-pressed={tool === id}
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
          <label className="color">
            <input
              aria-label="Background color"
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
            />
            <i style={{ background: backgroundColor }} />
            <small>Background</small>
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
              groupActive={groupActiveLayer}
              ungroupActive={ungroupActiveLayer}
              editGroup={editGroup}
              rasterize={() => void rasterize()}
              importImage={() => layerFile.current?.click()}
              createMask={createMaskFromSelection}
              clearMask={clearMask}
              clearSelection={() => setSelection(undefined)}
              invertSelection={invertSelection}
              selectionOperation={selectionOperation}
              setSelectionOperation={setSelectionOperation}
              setSelectionFeather={setSelectionFeather}
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
          {(tool === 'brush' || tool === 'pencil' || tool === 'color-replace' || tool === 'eraser' || tool === 'clone' || tool === 'heal' || tool === 'rectangle' || tool === 'ellipse') && (
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
              {(tool === 'brush' || tool === 'pencil' || tool === 'color-replace' || tool === 'eraser' || tool === 'clone' || tool === 'heal') && (
                <>
                  {tool !== 'pencil' && tool !== 'color-replace' && (
                    <Slider
                      label="Hardness"
                      value={hardness}
                      min={1}
                      max={100}
                      set={setHardness}
                      suffix="%"
                    />
                  )}
                  <Slider
                    label="Opacity"
                    value={brushOpacity}
                    min={1}
                    max={100}
                    set={setBrushOpacity}
                    suffix="%"
                  />
                  {tool === 'color-replace' && (
                    <Slider
                      label="Color tolerance"
                      value={colorTolerance}
                      min={0}
                      max={255}
                      set={setColorTolerance}
                      suffix=""
                    />
                  )}
                </>
              )}
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
          <Save /> Save JPEG
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
