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
  Hexagon,
  Minus,
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
  effectiveAdjustments,
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
type MenuName =
  | 'File'
  | 'Edit'
  | 'Image'
  | 'Layer'
  | 'Type'
  | 'Select'
  | 'Filter'
  | 'View'
  | 'Plugins';
type Command =
  | 'noop'
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
  | 'copy-layer'
  | 'cut-layer'
  | 'paste-layer'
  | 'clear-layer'
  | 'fill-layer'
  | 'new-layer'
  | 'duplicate-layer'
  | 'delete-layer'
  | 'group-layer'
  | 'ungroup-layer'
  | 'hide-layer'
  | 'merge-visible'
  | 'flatten'
  | 'text-tool'
  | 'select-all'
  | 'deselect'
  | 'invert-selection'
  | 'mask-selection'
  | 'reset'
  | 'levels'
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
type MenuItem = {
  label: string;
  shortcut?: string;
  command: Command;
  disabled?: boolean;
  separator?: boolean;
};

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
  { id: 'line', label: 'Line', icon: Minus, key: 'U' },
  { id: 'polygon', label: 'Polygon', icon: Hexagon, key: 'U' },
  { id: 'select', label: 'Select', icon: Crop, key: 'M' },
  { id: 'ellipse-select', label: 'Elliptical marquee', icon: Shapes, key: 'M' },
  { id: 'row-select', label: 'Single Row marquee', icon: Rows3, key: 'M' },
  {
    id: 'column-select',
    label: 'Single Column marquee',
    icon: Columns3,
    key: 'M',
  },
  { id: 'lasso', label: 'Lasso', icon: WandSparkles, key: 'L' },
  {
    id: 'polygonal-lasso',
    label: 'Polygonal Lasso',
    icon: WandSparkles,
    key: 'L',
  },
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
  u: ['rectangle', 'ellipse', 'line', 'polygon'],
  m: MARQUEE_TOOLS,
  l: ['lasso', 'polygonal-lasso'],
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
    {
      label: 'Toggle Last State',
      shortcut: 'Ctrl+Alt+Z',
      command: 'undo',
      disabled: true,
    },
    { label: '', command: 'noop', separator: true },
    {
      label: 'Fade…',
      shortcut: 'Ctrl+Shift+F',
      command: 'noop',
      disabled: true,
    },
    { label: '', command: 'noop', separator: true },
    { label: 'Copy Layer', shortcut: 'Ctrl+C', command: 'copy-layer' },
    { label: 'Cut Layer', shortcut: 'Ctrl+X', command: 'cut-layer' },
    { label: 'Paste Layer', shortcut: 'Ctrl+V', command: 'paste-layer' },
    {
      label: 'Copy Merged',
      shortcut: 'Ctrl+Shift+C',
      command: 'noop',
      disabled: true,
    },
    { label: 'Clear', command: 'clear-layer' },
    { label: '', command: 'noop', separator: true },
    { label: 'Search', shortcut: 'Ctrl+F', command: 'noop', disabled: true },
    { label: 'Check Spelling…', command: 'noop', disabled: true },
    { label: 'Find and Replace Text…', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Fill…', shortcut: 'Shift+F5', command: 'fill-layer' },
    { label: 'Stroke…', command: 'noop', disabled: true },
    { label: 'Content-Aware Fill…', command: 'noop', disabled: true },
    { label: 'Prompt to Edit…', command: 'noop', disabled: true },
    { label: 'Generative Fill…', command: 'noop', disabled: true },
    { label: 'Generate Image…', command: 'noop', disabled: true },
    { label: 'Reflection Removal…', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    {
      label: 'Free Transform',
      shortcut: 'Ctrl+T',
      command: 'noop',
      disabled: true,
    },
    { label: 'Transform', command: 'noop', disabled: true },
    { label: 'Perspective Warp', command: 'noop', disabled: true },
    { label: 'Puppet Warp', command: 'noop', disabled: true },
    { label: 'Content-Aware Scale', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Define Brush Preset…', command: 'noop', disabled: true },
    { label: 'Define Pattern…', command: 'noop', disabled: true },
    { label: 'Purge', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Color Settings…', command: 'noop', disabled: true },
    { label: 'Keyboard Shortcuts…', command: 'noop', disabled: true },
    { label: 'Menus…', command: 'noop', disabled: true },
    { label: 'Toolbar…', command: 'noop', disabled: true },
    { label: 'Reset adjustments', command: 'reset' },
  ],
  Image: [
    { label: 'Mode', command: 'noop', disabled: true },
    { label: 'Adjustments', command: 'reset', disabled: true },
    { label: 'Levels…', command: 'levels' },
    {
      label: 'Auto Tone',
      shortcut: 'Shift+Ctrl+L',
      command: 'noop',
      disabled: true,
    },
    { label: 'Auto Contrast', command: 'noop', disabled: true },
    { label: 'Auto Color', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Image Size…', shortcut: 'Alt+Ctrl+I', command: 'resize' },
    { label: 'Generative Upscale…', command: 'noop', disabled: true },
    { label: 'Canvas Size…', command: 'noop', disabled: true },
    { label: 'Image Rotation', command: 'noop', disabled: true },
    { label: 'Resize image…', command: 'resize' },
    { label: 'Crop', shortcut: 'C', command: 'crop' },
    { label: 'Rotate left', command: 'rotate-left' },
    { label: 'Rotate right', command: 'rotate-right' },
    { label: 'Flip horizontal', command: 'flip-h' },
    { label: 'Flip vertical', command: 'flip-v' },
    { label: 'Trim…', command: 'noop', disabled: true },
    { label: 'Reveal All', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Duplicate…', command: 'noop', disabled: true },
    { label: 'Apply Image…', command: 'noop', disabled: true },
    { label: 'Calculations…', command: 'noop', disabled: true },
    { label: 'Analysis', command: 'noop', disabled: true },
  ],
  Layer: [
    { label: 'New Paint Layer', command: 'new-layer' },
    {
      label: 'Duplicate Layer…',
      shortcut: 'Ctrl+J',
      command: 'duplicate-layer',
    },
    { label: 'Delete Layer', command: 'delete-layer' },
    { label: '', command: 'noop', separator: true },
    { label: 'Quick Export document as PNG', command: 'png' },
    { label: 'Export As…', command: 'png' },
    { label: 'Rename Layer…', command: 'noop', disabled: true },
    { label: 'Layer Style', command: 'noop', disabled: true },
    { label: 'Smart Filter', command: 'noop', disabled: true },
    { label: 'New Fill Layer', command: 'noop', disabled: true },
    { label: 'New Adjustment Layer', command: 'noop', disabled: true },
    { label: 'Layer Mask', command: 'mask-selection' },
    { label: 'Vector Mask', command: 'noop', disabled: true },
    { label: 'Create Clipping Mask', command: 'noop', disabled: true },
    { label: 'Smart Objects', command: 'noop', disabled: true },
    { label: 'Rasterize', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Group Layers', shortcut: 'Ctrl+G', command: 'group-layer' },
    {
      label: 'Ungroup Layers',
      shortcut: 'Ctrl+Shift+G',
      command: 'ungroup-layer',
    },
    { label: 'Hide Layers', shortcut: 'Ctrl+,', command: 'hide-layer' },
    { label: 'Merge Layers', command: 'noop', disabled: true },
    { label: 'Merge Visible', command: 'merge-visible' },
    { label: 'Flatten Image', command: 'flatten' },
    { label: 'Arrange', command: 'noop', disabled: true },
    { label: 'Align', command: 'noop', disabled: true },
    { label: 'Distribute', command: 'noop', disabled: true },
    { label: 'Lock Layers…', command: 'noop', disabled: true },
  ],
  Type: [
    { label: 'Text Tool', shortcut: 'T', command: 'text-tool' },
    { label: 'Panels', command: 'noop', disabled: true },
    { label: 'Anti-Alias', command: 'noop', disabled: true },
    { label: 'Orientation', command: 'noop', disabled: true },
    { label: 'OpenType', command: 'noop', disabled: true },
    { label: 'Create Work Path', command: 'noop', disabled: true },
    { label: 'Convert to Shape', command: 'noop', disabled: true },
    { label: 'Rasterize Type Layer', command: 'noop', disabled: true },
    { label: 'Warp Text…', command: 'noop', disabled: true },
    { label: 'Font Preview Size', command: 'noop', disabled: true },
    { label: 'Language Options', command: 'noop', disabled: true },
    { label: 'Update All Text Layers', command: 'noop', disabled: true },
    { label: 'Manage Missing Fonts', command: 'noop', disabled: true },
    { label: 'Paste Lorem Ipsum', command: 'noop', disabled: true },
    { label: 'Load Default Type Styles', command: 'noop', disabled: true },
    { label: 'Save Default Type Styles', command: 'noop', disabled: true },
  ],
  Select: [
    { label: 'All', shortcut: 'Ctrl+A', command: 'select-all' },
    { label: 'Deselect', shortcut: 'Ctrl+D', command: 'deselect' },
    { label: 'Reselect', command: 'noop', disabled: true },
    { label: 'Inverse', shortcut: 'Ctrl+Shift+I', command: 'invert-selection' },
    { label: '', command: 'noop', separator: true },
    { label: 'All Layers', command: 'noop', disabled: true },
    { label: 'Deselect Layers', command: 'noop', disabled: true },
    { label: 'Find Layers', command: 'noop', disabled: true },
    { label: 'Isolate Layers', command: 'noop', disabled: true },
    { label: 'Color Range…', command: 'noop', disabled: true },
    { label: 'Focus Area…', command: 'noop', disabled: true },
    { label: 'Subject', command: 'noop', disabled: true },
    { label: 'Sky', command: 'noop', disabled: true },
    { label: 'Select and Mask…', command: 'noop', disabled: true },
    { label: 'Modify', command: 'noop', disabled: true },
    { label: 'Grow', command: 'noop', disabled: true },
    { label: 'Similar', command: 'noop', disabled: true },
    { label: 'Transform Selection', command: 'noop', disabled: true },
    { label: 'Edit in Quick Mask Mode', command: 'noop', disabled: true },
    { label: 'Load Selection…', command: 'noop', disabled: true },
    { label: 'Save Selection…', command: 'noop', disabled: true },
    { label: 'Mask from Selection', command: 'mask-selection' },
  ],
  Filter: [
    { label: 'Original', command: 'filter-original' },
    { label: 'Vivid', command: 'filter-vivid' },
    { label: 'Mono', command: 'filter-mono' },
    { label: 'Warm', command: 'filter-warm' },
    { label: 'Cool', command: 'filter-cool' },
    { label: '', command: 'noop', separator: true },
    { label: 'Convert for Smart Filters', command: 'noop', disabled: true },
    { label: 'Neural Filters…', command: 'noop', disabled: true },
    { label: 'Filter Gallery…', command: 'noop', disabled: true },
    { label: 'Camera Raw Filter…', command: 'noop', disabled: true },
    { label: 'AI Denoise…', command: 'noop', disabled: true },
    { label: 'AI Sharpen…', command: 'noop', disabled: true },
    { label: 'Lens Correction…', command: 'noop', disabled: true },
    { label: 'Liquify…', command: 'noop', disabled: true },
    { label: 'Vanishing Point…', command: 'noop', disabled: true },
    { label: '', command: 'noop', separator: true },
    { label: 'Blur', command: 'noop', disabled: true },
    { label: 'Average', command: 'noop', disabled: true },
    { label: 'Blur More', command: 'noop', disabled: true },
    { label: 'Box Blur…', command: 'noop', disabled: true },
    { label: 'Gaussian Blur…', command: 'noop', disabled: true },
    { label: 'Motion Blur…', command: 'noop', disabled: true },
    { label: 'Radial Blur…', command: 'noop', disabled: true },
    { label: 'Smart Blur…', command: 'noop', disabled: true },
    { label: 'Blur Gallery', command: 'noop', disabled: true },
    { label: 'Field Blur…', command: 'noop', disabled: true },
    { label: 'Iris Blur…', command: 'noop', disabled: true },
    { label: 'Tilt-Shift…', command: 'noop', disabled: true },
    { label: 'Distort', command: 'noop', disabled: true },
    { label: 'Displace…', command: 'noop', disabled: true },
    { label: 'Pinch…', command: 'noop', disabled: true },
    { label: 'Ripple…', command: 'noop', disabled: true },
    { label: 'Shear…', command: 'noop', disabled: true },
    { label: 'Spherize…', command: 'noop', disabled: true },
    { label: 'Twirl…', command: 'noop', disabled: true },
    { label: 'Wave…', command: 'noop', disabled: true },
    { label: 'Noise', command: 'noop', disabled: true },
    { label: 'Add Noise…', command: 'noop', disabled: true },
    { label: 'Pixelate', command: 'noop', disabled: true },
    { label: 'Color Halftone…', command: 'noop', disabled: true },
    { label: 'Mosaic…', command: 'noop', disabled: true },
    { label: 'Pointillize…', command: 'noop', disabled: true },
    { label: 'Render', command: 'noop', disabled: true },
    { label: 'Clouds', command: 'noop', disabled: true },
    { label: 'Difference Clouds', command: 'noop', disabled: true },
    { label: 'Fibers…', command: 'noop', disabled: true },
    { label: 'Lens Flare…', command: 'noop', disabled: true },
    { label: 'Sharpen', command: 'noop', disabled: true },
    { label: 'Sharpen Edges', command: 'noop', disabled: true },
    { label: 'Sharpen More', command: 'noop', disabled: true },
    { label: 'Smart Sharpen…', command: 'noop', disabled: true },
    { label: 'Unsharp Mask…', command: 'noop', disabled: true },
    { label: 'Stylize', command: 'noop', disabled: true },
    { label: 'Video', command: 'noop', disabled: true },
    { label: 'De-Interlace…', command: 'noop', disabled: true },
    { label: 'NTSC Colors', command: 'noop', disabled: true },
  ],
  View: [
    { label: 'Zoom in', shortcut: '+', command: 'zoom-in' },
    { label: 'Zoom out', shortcut: '−', command: 'zoom-out' },
    { label: 'Fit to screen', shortcut: '0', command: 'fit' },
    { label: 'Actual size', shortcut: '1', command: 'actual' },
    { label: 'Full Screen Mode', command: 'noop', disabled: true },
  ],
  Plugins: [
    { label: 'No plugins installed', command: 'noop', disabled: true },
    { label: 'Plugin Manager…', command: 'noop', disabled: true },
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
    [selectionOperation, setSelectionOperation] =
      useState<SelectionOperation>('replace'),
    [zoom, setZoom] = useState(72),
    [color, setColor] = useState('#ff5c35'),
    [backgroundColor, setBackgroundColor] = useState('#ffffff'),
    [size, setSize] = useState(18),
    [brushOpacity, setBrushOpacity] = useState(100),
    [hardness, setHardness] = useState(100),
    [colorTolerance, setColorTolerance] = useState(24),
    [exportFormat, setExportFormat] = useState<ExportFormat>('png'),
    [exportQuality, setExportQuality] = useState(92),
    [exportTargetBytes, setExportTargetBytes] = useState<number | undefined>(
      undefined,
    ),
    [text, setText] = useState('Your text'),
    [fontSize, setFontSize] = useState(56);
  const [cloneSource, setCloneSource] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const clipboardLayer = useRef<Layer | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null),
    [exporting, setExporting] = useState<{
      frame: Frame;
      assets: typeof assets.current;
      name: string;
    } | null>(null),
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
    adjustments = active ? effectiveAdjustments(active.adjustments) : neutral;
  const {
    brightness,
    contrast,
    saturation,
    blur,
    filter,
    levelsBlack,
    levelsWhite,
    levelsGamma,
  } = adjustments;
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
    exportTargetBytes,
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
    setExportTargetBytes(s.exportTargetBytes);
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
  const localSelectionMask = async (
    selection: Selection,
    frameWidth: number,
    frameHeight: number,
    layer: Layer,
    width: number,
    height: number,
  ) => {
    const frameMask = await renderSelection(
      selection,
      frameWidth,
      frameHeight,
      assets.current,
    );
    const [a, b, c, d, e, f] = layer.matrix;
    if (
      a === 1 &&
      b === 0 &&
      c === 0 &&
      d === 1 &&
      e === 0 &&
      f === 0 &&
      width === frameWidth &&
      height === frameHeight
    )
      return frameMask;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 0.000000000001) return frameMask;
    const localMask = surface(width, height),
      context = localMask.getContext('2d')!;
    context.setTransform(
      d / determinant,
      -b / determinant,
      -c / determinant,
      a / determinant,
      (c * f - d * e) / determinant,
      (b * e - a * f) / determinant,
    );
    context.drawImage(frameMask, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    return localMask;
  };
  const groupForLayer = (f: Frame, layer: Layer) =>
    layer.groupId
      ? f.groups?.find((group) => group.id === layer.groupId)
      : undefined;
  const layerIsLocked = (f: Frame, layer: Layer) =>
    layer.locked || Boolean(groupForLayer(f, layer)?.locked);
  const editLayer = (patch: Partial<Layer>) => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active)!;
    const group = groupForLayer(f, layer);
    if (
      group?.locked ||
      (layer.locked && !('locked' in patch) && !('visible' in patch))
    ) {
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
    if (commit({ ...f, selection })) {
      const label =
        selection?.shape === 'ellipse'
          ? 'Elliptical'
          : selection?.shape === 'polygon'
            ? 'Polygonal'
            : 'Rectangular';
      setNotice(selection ? `${label} selection created` : 'Selection cleared');
    }
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
    const parts = currentSelection.parts?.slice() || [
      selectionPart(currentSelection),
    ];
    parts.push({ ...selectionPart(next), operation: selectionOperation });
    setSelection({ ...next, parts });
  };
  const finishPolygonalLasso = (g: Gesture) => {
    const points = g.points || [];
    if (points.length < 3) {
      void paint(g.frame);
      setNotice('Polygonal lasso needs at least three points');
      return;
    }
    const bounded = points.map((point) => ({
      x: Math.max(0, Math.min(g.frame.w, point.x)),
      y: Math.max(0, Math.min(g.frame.h, point.y)),
    }));
    const x = Math.min(...bounded.map((point) => point.x)),
      y = Math.min(...bounded.map((point) => point.y)),
      right = Math.max(...bounded.map((point) => point.x)),
      bottom = Math.max(...bounded.map((point) => point.y));
    if (right - x <= 0 || bottom - y <= 0) {
      void paint(g.frame);
      setNotice('Polygonal lasso needs a non-zero area');
      return;
    }
    mergeSelection({
      shape: 'polygon',
      x,
      y,
      w: right - x,
      h: bottom - y,
      points: bounded,
      feather: 0,
      inverted: false,
    });
    setNotice('Polygonal selection created');
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
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active);
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
    if (editLayer({ mask: maskId }))
      setNotice('Nondestructive layer mask created');
  };
  const clearMask = () => {
    const layer = current().layers.find((l) => l.id === current().active);
    if (layer?.mask && editLayer({ mask: undefined }))
      setNotice('Layer mask removed; source pixels kept');
  };
  const adjust = (patch: Partial<Adjustments>) => {
    const layer = current().layers.find((l) => l.id === current().active)!;
    return editLayer({
      adjustments: { ...effectiveAdjustments(layer.adjustments), ...patch },
    });
  };
  const resetAdjustments = () => adjust({ ...neutral });
  const setBrightness = (brightness: number) => adjust({ brightness }),
    setContrast = (contrast: number) => adjust({ contrast }),
    setSaturation = (saturation: number) => adjust({ saturation }),
    setBlur = (blur: number) => adjust({ blur }),
    setLevelsBlack = (levelsBlack: number) => adjust({ levelsBlack }),
    setLevelsWhite = (levelsWhite: number) => adjust({ levelsWhite }),
    setLevelsGamma = (levelsGamma: number) => adjust({ levelsGamma });
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
      clearClipboard();
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
      settings: {
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
        exportTargetBytes,
        text,
        fontSize,
        ...neutral,
      },
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
    exportTargetBytes,
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
      clearClipboard();
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
    if (!commit(next)) return;
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
        groups: stillUsed
          ? f.groups
          : (f.groups || []).filter((item) => item.id !== groupId),
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
  const copyLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setNotice('Select a layer before copying');
      return false;
    }
    clipboardLayer.current = structuredClone(layer);
    setHasClipboard(true);
    setNotice('Active layer copied');
    return true;
  };
  const clearClipboard = () => {
    clipboardLayer.current = null;
    setHasClipboard(false);
  };
  const pasteLayer = () => {
    const copied = clipboardLayer.current;
    if (!copied) {
      setNotice('Copy a layer before pasting');
      return;
    }
    const f = current();
    if (
      copied.kind === 'raster' &&
      (!assets.current[copied.asset] ||
        (copied.mask && !assets.current[copied.mask]))
    ) {
      clearClipboard();
      setNotice('The copied layer is no longer available in this document');
      return;
    }
    const copiedGroup = copied.groupId
      ? f.groups?.find((group) => group.id === copied.groupId)
      : undefined;
    const pasted = {
      ...structuredClone(copied),
      id: crypto.randomUUID(),
      name: `${copied.name} copy`.slice(0, 160),
      locked: false,
      ...(copiedGroup && !copiedGroup.locked
        ? { groupId: copiedGroup.id }
        : { groupId: undefined }),
    } as Layer;
    addLayer(pasted);
    setNotice('Layer pasted');
  };
  const cutLayer = () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (!layer) {
      setNotice('Select a layer before cutting');
      return false;
    }
    if (f.layers.length === 1) {
      setNotice('The last layer cannot be cut');
      return false;
    }
    if (layerIsLocked(f, layer)) {
      setNotice('Unlock this layer before cutting');
      return false;
    }
    if (!copyLayer()) return false;
    if (!remove()) return false;
    setNotice('Layer cut');
    return true;
  };
  const hideActiveLayer = () => {
    const layer = current().layers.find((item) => item.id === current().active);
    if (layer) editLayer({ visible: !layer.visible });
  };
  const fillActiveLayer = async () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (
      !layer ||
      layer.kind !== 'raster' ||
      layerIsLocked(f, layer) ||
      !layer.visible
    ) {
      setNotice('Select a visible, unlocked raster layer before filling');
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]),
        output = surface(image.naturalWidth, image.naturalHeight),
        context = output.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const fill = surface(output.width, output.height),
        fillContext = fill.getContext('2d')!;
      fillContext.fillStyle = color;
      fillContext.fillRect(0, 0, fill.width, fill.height);
      if (f.selection) {
        const mask = await localSelectionMask(
          f.selection,
          f.w,
          f.h,
          layer,
          output.width,
          output.height,
        );
        fillContext.globalCompositeOperation = 'destination-in';
        fillContext.drawImage(mask, 0, 0);
      }
      context.drawImage(fill, 0, 0);
      const asset = addAsset(assets.current, output);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === layer.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          f.selection
            ? 'Selection filled; undo restores the original pixels'
            : 'Layer filled; undo restores the original pixels',
        );
    } catch {
      setNotice('Could not fill this layer');
    }
  };
  const clearActiveLayer = async () => {
    const f = current(),
      layer = f.layers.find((item) => item.id === f.active);
    if (
      !layer ||
      layer.kind !== 'raster' ||
      layerIsLocked(f, layer) ||
      !layer.visible
    ) {
      setNotice('Select a visible, unlocked raster layer before clearing');
      return;
    }
    try {
      const image = await decodeAsset(assets.current[layer.asset]),
        output = surface(image.naturalWidth, image.naturalHeight),
        context = output.getContext('2d')!;
      if (f.selection) {
        context.drawImage(image, 0, 0);
        const mask = await localSelectionMask(
          f.selection,
          f.w,
          f.h,
          layer,
          output.width,
          output.height,
        );
        context.globalCompositeOperation = 'destination-out';
        context.drawImage(mask, 0, 0);
      }
      const asset = addAsset(assets.current, output);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === layer.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          f.selection
            ? 'Selection cleared; undo restores the original pixels'
            : 'Layer cleared; undo restores the original pixels',
        );
    } catch {
      setNotice('Could not clear this layer');
    }
  };
  const mergeVisible = async () => {
    try {
      const f = current(),
        groups = new Map((f.groups || []).map((group) => [group.id, group]));
      const visibleIds = new Set(
        f.layers
          .filter(
            (layer) =>
              layer.visible &&
              (!layer.groupId || groups.get(layer.groupId)?.visible !== false),
          )
          .map((layer) => layer.id),
      );
      if (!visibleIds.size) {
        setNotice('There are no visible layers to merge');
        return;
      }
      const image = await renderFrame(
          {
            ...f,
            layers: f.layers.map((layer) => ({
              ...layer,
              visible: visibleIds.has(layer.id),
            })),
          },
          assets.current,
        ),
        merged = rasterFrame(image, assets.current, 'Merged visible'),
        topVisibleIndex = Math.max(
          ...f.layers.map((layer, index) =>
            visibleIds.has(layer.id) ? index : -1,
          ),
        ),
        layers: Layer[] = [];
      f.layers.forEach((layer, index) => {
        if (index === topVisibleIndex) layers.push(merged.layers[0]);
        if (!visibleIds.has(layer.id)) layers.push(layer);
      });
      const usedGroups = new Set(
        layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
      );
      if (
        commit({
          ...f,
          layers,
          groups: (f.groups || []).filter((group) => usedGroups.has(group.id)),
          active: merged.layers[0].id,
        })
      )
        setNotice('Visible layers merged; undo restores the individual layers');
    } catch {
      setNotice('Could not merge visible layers');
    }
  };
  const flattenImage = async () => {
    try {
      const f = current(),
        image = await renderFrame(f, assets.current),
        flattened = rasterFrame(image, assets.current, 'Flattened image');
      if (commit(flattened))
        setNotice('Image flattened; undo restores editable layers');
    } catch {
      setNotice('Could not flatten the image');
    }
  };
  const remove = () => {
    const f = current(),
      layer = f.layers.find((l) => l.id === f.active);
    if (!layer || layerIsLocked(f, layer) || f.layers.length === 1)
      return false;
    const layers = f.layers.filter((l) => l.id !== f.active);
    if (!commit({ ...f, layers, active: layers.at(-1)!.id })) return false;
    setNotice('Layer deleted. Undo restores it.');
    return true;
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
  const point = (
    e: Pick<React.PointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY'>,
  ) => {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };
  const pressure = (e: React.PointerEvent<HTMLCanvasElement>) =>
    (e.pointerType === 'pen' || e.pointerType === 'touch') &&
    e.pressure > 0 &&
    e.pressure <= 1
      ? e.pressure
      : 1;
  const pointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Polygonal lasso is a click-to-place workflow. Keep its gesture alive
    // between pointer events so touch, pen and mouse can place vertices one
    // at a time; clicking near the first point closes the path.
    if (gesture.current?.tool === 'polygonal-lasso') {
      const g = gesture.current,
        p = point(e),
        points = g.points || (g.points = []),
        first = points[0];
      if (
        first &&
        points.length >= 3 &&
        Math.hypot(p.x - first.x, p.y - first.y) <= 14
      ) {
        gesture.current = null;
        finishPolygonalLasso(g);
      } else {
        points.push({
          x: Math.max(0, Math.min(g.frame.w, p.x)),
          y: Math.max(0, Math.min(g.frame.h, p.y)),
        });
        g.last = p;
        g.moved = points.length > 1;
        void paint(g.frame).then(() => {
          if (gesture.current !== g) return;
          const context = canvas.current?.getContext('2d');
          if (!context || !g.points?.length) return;
          context.save();
          context.strokeStyle = '#fff';
          context.lineWidth = 2;
          context.setLineDash([8, 5]);
          context.beginPath();
          context.moveTo(g.points[0].x, g.points[0].y);
          for (const point of g.points.slice(1))
            context.lineTo(point.x, point.y);
          context.stroke();
          context.restore();
        });
      }
      return;
    }
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
      const pixel = canvas
        .current!.getContext('2d')!
        .getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor(
        '#' +
          [pixel[0], pixel[1], pixel[2]]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
      );
      setNotice('Color sampled from image');
      return;
    }
    if (tool === 'hand') {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (tool === 'fill') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
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
        if (
          commit({
            ...f,
            layers: f.layers.map((item) =>
              item.id === layer.id ? { ...item, asset } : item,
            ),
          })
        )
          setNotice('Area filled; undo restores the original pixels');
      } catch {
        setNotice('Could not fill this layer');
      }
      return;
    }
    if (tool === 'clone' || tool === 'heal') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
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
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before replacing colors',
        );
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
            source = surface(
              sourceImage.naturalWidth,
              sourceImage.naturalHeight,
            );
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
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before applying a gradient',
        );
        return;
      }
      gesture.current = {
        tool,
        start: local,
        last: local,
        frame: f,
        layer,
        moved: false,
      };
      return;
    }
    if (tool === 'magic-wand') {
      if (
        layerIsLocked(f, layer) ||
        !layer.visible ||
        layer.kind !== 'raster'
      ) {
        setNotice(
          'Select a visible, unlocked raster layer before color-selecting',
        );
        return;
      }
      try {
        const source = await renderFrame(
            { ...f, layers: [layer] },
            assets.current,
          ),
          mask = colorSelectMask(source, p.x, p.y),
          maskId = addAsset(assets.current, mask);
        if (selectionOperation !== 'replace')
          setNotice(
            'Color selection currently replaces the active selection; geometric selections support composition',
          );
        setSelection({
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: f.w,
          h: f.h,
          feather: 0,
          inverted: false,
          mask: maskId,
        });
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
      setNotice(
        row
          ? 'Single row selection created'
          : 'Single column selection created',
      );
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
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        points: [p],
      };
      return;
    }
    if (tool === 'polygonal-lasso') {
      gesture.current = {
        tool,
        start: p,
        last: p,
        frame: f,
        moved: false,
        points: [p],
      };
      setNotice(
        'Polygonal lasso: click to place points, click the first point to close',
      );
      return;
    }
    if (
      tool === 'rectangle' ||
      tool === 'ellipse' ||
      tool === 'line' ||
      tool === 'polygon' ||
      tool === 'crop'
    ) {
      gesture.current = { tool, start: p, last: p, frame: f, moved: false };
      return;
    }
    if (layerIsLocked(current(), layer) || !layer.visible) {
      setNotice('Select a visible, unlocked layer');
      return;
    }
    if (
      (tool === 'brush' || tool === 'pencil' || tool === 'eraser') &&
      layer.kind !== 'raster'
    ) {
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
            radius = Math.max(
              0.5,
              (localSize(layer.matrix, size) * pointPressure) / 2,
            ),
            softness =
              tool === 'pencil'
                ? 0
                : Math.max(0, Math.min(1, (100 - hardness) / 100));
          x.globalAlpha = (brushOpacity / 100) * pointPressure;
          x.filter = softness
            ? `blur(${Math.max(0.1, radius * softness)}px)`
            : 'none';
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
    if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      !g.buffer
    )
      g.queued?.push(local);
    if (
      (g.tool === 'clone' || g.tool === 'heal') &&
      g.buffer &&
      g.source &&
      cloneSource
    ) {
      const x = g.buffer.getContext('2d')!,
        radius = Math.max(
          0.5,
          (localSize(g.layer!.matrix, size) * pressure(e)) / 2,
        );
      const dx = local.x - g.start.x,
        dy = local.y - g.start.y;
      x.save();
      x.globalAlpha =
        (g.tool === 'heal' ? 0.65 : 1) * (brushOpacity / 100) * pressure(e);
      x.filter =
        g.tool === 'heal' || hardness < 100
          ? `blur(${g.tool === 'heal' ? 1 : Math.max(0.1, (radius * (100 - hardness)) / 100)}px)`
          : 'none';
      x.beginPath();
      x.arc(local.x, local.y, radius, 0, Math.PI * 2);
      x.clip();
      x.drawImage(
        g.source,
        cloneSource.x + dx - radius,
        cloneSource.y + dy - radius,
        radius * 2,
        radius * 2,
        local.x - radius,
        local.y - radius,
        radius * 2,
        radius * 2,
      );
      x.restore();
      void paint(g.frame, { [g.layer!.id]: g.buffer });
      g.last = local;
      return;
    }
    if (
      g.tool === 'color-replace' &&
      g.buffer &&
      g.source &&
      g.replaceTarget &&
      g.layer
    ) {
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
    } else if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      g.buffer &&
      g.layer
    ) {
      const x = g.buffer.getContext('2d')!;
      x.strokeStyle = color;
      x.globalAlpha = (brushOpacity / 100) * pressure(e);
      const diameter = localSize(g.layer.matrix, size) * pressure(e);
      x.filter =
        g.tool === 'pencil' || hardness >= 100
          ? 'none'
          : `blur(${Math.max(0.1, ((diameter / 2) * (100 - hardness)) / 100)}px)`;
      x.lineWidth =
        g.tool === 'pencil' ? Math.max(1, Math.round(diameter)) : diameter;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(local.x, local.y);
      x.stroke();
      void paint(g.frame, { [g.layer.id]: g.buffer });
    } else if (
      g.tool === 'rectangle' ||
      g.tool === 'ellipse' ||
      g.tool === 'line' ||
      g.tool === 'polygon'
    ) {
      const width = Math.abs(p.x - g.start.x),
        height = Math.abs(p.y - g.start.y);
      const layer: Layer =
        g.tool === 'line'
          ? {
              ...commonLayer('Line'),
              kind: 'line',
              width: Math.max(1, width),
              height: Math.max(1, height),
              stroke: Math.max(1, size / 3),
              color,
              matrix: [
                1,
                0,
                0,
                1,
                Math.min(p.x, g.start.x),
                Math.min(p.y, g.start.y),
              ],
            }
          : ({
              ...commonLayer(g.tool === 'polygon' ? 'Polygon' : 'Shape'),
              kind:
                g.tool === 'ellipse'
                  ? 'ellipse'
                  : g.tool === 'polygon'
                    ? 'polygon'
                    : 'rectangle',
              width: Math.max(1, width),
              height: Math.max(1, height),
              stroke: Math.max(1, size / 3),
              color,
              ...(g.tool === 'polygon' ? { sides: 5 } : { fill: false }),
              matrix: [
                1,
                0,
                0,
                1,
                Math.min(p.x, g.start.x),
                Math.min(p.y, g.start.y),
              ],
            } as Layer);
      const context = canvas.current!.getContext('2d')!;
      context.save();
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, size / 3);
      context.setLineDash([8, 5]);
      context.beginPath();
      if (g.tool === 'line') {
        context.moveTo(g.start.x, g.start.y);
        context.lineTo(p.x, p.y);
      } else if (g.tool === 'polygon') {
        const left = Math.min(g.start.x, p.x),
          top = Math.min(g.start.y, p.y),
          cx = left + width / 2,
          cy = top + height / 2,
          rx = Math.max(1, width / 2),
          ry = Math.max(1, height / 2);
        for (let i = 0; i < 5; i += 1) {
          const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5,
            x = cx + Math.cos(angle) * rx,
            y = cy + Math.sin(angle) * ry;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
      } else if (g.tool === 'ellipse') {
        context.ellipse(
          Math.min(p.x, g.start.x) + width / 2,
          Math.min(p.y, g.start.y) + height / 2,
          width / 2,
          height / 2,
          0,
          0,
          Math.PI * 2,
        );
      } else
        context.rect(
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
          width,
          height,
        );
      context.stroke();
      context.restore();
      void paint({ ...g.frame, layers: [...g.frame.layers, layer] });
    } else if (g.tool === 'select' || g.tool === 'ellipse-select') {
      void paint(g.frame).then(() => {
        if (gesture.current !== g) return;
        const c = canvas.current!,
          x = c.getContext('2d')!;
        x.save();
        x.strokeStyle = '#fff';
        x.lineWidth = 2;
        x.setLineDash([8, 5]);
        const left = Math.min(g.start.x, p.x),
          top = Math.min(g.start.y, p.y),
          width = Math.abs(p.x - g.start.x),
          height = Math.abs(p.y - g.start.y);
        if (g.tool === 'ellipse-select') {
          x.beginPath();
          x.ellipse(
            left + width / 2,
            top + height / 2,
            width / 2,
            height / 2,
            0,
            0,
            Math.PI * 2,
          );
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
    } else if (g.tool === 'polygonal-lasso') {
      const points = g.points || (g.points = [g.start]);
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
        x.lineTo(p.x, p.y);
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
    if (g.tool === 'polygonal-lasso') {
      if (e.type === 'pointercancel') {
        gesture.current = null;
        void paint(current());
        setNotice('Polygonal lasso cancelled');
      }
      // A polygonal lasso remains active after each click. It is finalized by
      // clicking its first vertex or by the double-click handler below.
      return;
    }
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
    } else if (
      (g.tool === 'brush' || g.tool === 'pencil' || g.tool === 'eraser') &&
      g.buffer &&
      g.layer
    ) {
      const x = g.buffer.getContext('2d')!;
      x.globalAlpha = (brushOpacity / 100) * pressure(e);
      const diameter = localSize(g.layer.matrix, size) * pressure(e);
      x.filter =
        g.tool === 'pencil' || hardness >= 100
          ? 'none'
          : `blur(${Math.max(0.1, ((diameter / 2) * (100 - hardness)) / 100)}px)`;
      x.beginPath();
      x.moveTo(g.last.x, g.last.y);
      x.lineTo(local.x, local.y);
      x.stroke();
      const asset = addAsset(assets.current, g.buffer);
      const changed = commit({
        ...f,
        layers: f.layers.map((l) =>
          l.id === g.layer!.id ? ({ ...l, kind: 'raster', asset } as Layer) : l,
        ),
      });
      if (changed) setNotice('Paint layer updated');
    } else if (
      (g.tool === 'rectangle' ||
        g.tool === 'ellipse' ||
        g.tool === 'line' ||
        g.tool === 'polygon') &&
      g.moved
    ) {
      const width = Math.max(1, Math.round(Math.abs(p.x - g.start.x))),
        height = Math.max(1, Math.round(Math.abs(p.y - g.start.y))),
        matrix = [
          1,
          0,
          0,
          1,
          Math.min(p.x, g.start.x),
          Math.min(p.y, g.start.y),
        ] as Matrix;
      addLayer(
        g.tool === 'line'
          ? {
              ...commonLayer('Line ' + f.layers.length),
              kind: 'line',
              width,
              height,
              stroke: Math.max(1, size / 3),
              color,
              matrix,
            }
          : ({
              ...commonLayer(
                (g.tool === 'polygon' ? 'Polygon ' : 'Shape ') +
                  f.layers.length,
              ),
              kind:
                g.tool === 'ellipse'
                  ? 'ellipse'
                  : g.tool === 'polygon'
                    ? 'polygon'
                    : 'rectangle',
              width,
              height,
              stroke: Math.max(1, size / 3),
              color,
              fill: false,
              ...(g.tool === 'polygon' ? { sides: 5 } : {}),
              matrix,
            } as Layer),
      );
    } else if (
      (g.tool === 'select' || g.tool === 'ellipse-select') &&
      g.moved
    ) {
      const x = Math.max(0, Math.min(g.start.x, p.x)),
        y = Math.max(0, Math.min(g.start.y, p.y)),
        w = Math.min(f.w - x, Math.abs(p.x - g.start.x)),
        h = Math.min(f.h - y, Math.abs(p.y - g.start.y));
      if (w > 0 && h > 0)
        mergeSelection({
          shape: g.tool === 'ellipse-select' ? 'ellipse' : 'rectangle',
          x,
          y,
          w,
          h,
          feather: 0,
          inverted: false,
        });
      else void paint(f);
    } else if (g.tool === 'lasso' && g.moved) {
      const points = g.points || [];
      if (points.length >= 3) {
        const x = Math.max(0, Math.min(...points.map((point) => point.x))),
          y = Math.max(0, Math.min(...points.map((point) => point.y))),
          right = Math.min(f.w, Math.max(...points.map((point) => point.x))),
          bottom = Math.min(f.h, Math.max(...points.map((point) => point.y)));
        mergeSelection({
          shape: 'polygon',
          x,
          y,
          w: right - x,
          h: bottom - y,
          points,
          feather: 0,
          inverted: false,
        });
      } else void paint(f);
    } else if (g.tool === 'crop' && g.moved) {
      const left = Math.max(0, Math.floor(Math.min(p.x, g.start.x))),
        top = Math.max(0, Math.floor(Math.min(p.y, g.start.y))),
        w = Math.floor(Math.min(f.w - left, Math.abs(p.x - g.start.x))),
        h = Math.floor(Math.min(f.h - top, Math.abs(p.y - g.start.y)));
      if (w > 0 && h > 0) {
        if (
          commit(
            await transformFrameWithMasks(
              f,
              [1, 0, 0, 1, -left, -top],
              assets.current,
              w,
              h,
            ),
          )
        )
          setNotice('Canvas cropped; layer pixels retained');
      } else void paint(f);
    } else if (g.tool === 'gradient' && g.moved && g.layer) {
      try {
        if (g.layer.kind !== 'raster') return;
        const image = await decodeAsset(assets.current[g.layer.asset]),
          buffer = surface(image.naturalWidth, image.naturalHeight);
        buffer.getContext('2d')!.drawImage(image, 0, 0);
        const context = buffer.getContext('2d')!,
          gradient = context.createLinearGradient(
            g.start.x,
            g.start.y,
            local.x,
            local.y,
          );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#ffffff00');
        context.fillStyle = gradient;
        context.fillRect(0, 0, buffer.width, buffer.height);
        const asset = addAsset(assets.current, buffer);
        if (
          commit({
            ...f,
            layers: f.layers.map((item) =>
              item.id === g.layer!.id ? { ...item, asset } : item,
            ),
          })
        )
          setNotice('Gradient applied; undo restores the original pixels');
      } catch {
        setNotice('Could not apply gradient');
      }
    } else if (
      (g.tool === 'clone' || g.tool === 'heal') &&
      g.buffer &&
      g.layer
    ) {
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          g.tool === 'heal' ? 'Healing stroke applied' : 'Clone stroke applied',
        );
    } else if (g.tool === 'color-replace' && g.buffer && g.layer) {
      const asset = addAsset(assets.current, g.buffer);
      if (
        commit({
          ...f,
          layers: f.layers.map((item) =>
            item.id === g.layer!.id ? { ...item, asset } : item,
          ),
        })
      )
        setNotice(
          'Color replacement applied; undo restores the original pixels',
        );
    } else void paint(f);
  };
  const doubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (g?.tool !== 'polygonal-lasso') return;
    // Double-clicking the final vertex is the desktop equivalent of clicking
    // the first vertex. The second pointer-down may already have added that
    // vertex, so remove it when it duplicates the preceding point.
    const p = point(e),
      points = g.points || [];
    if (points.length >= 2) {
      const last = points[points.length - 1],
        previous = points[points.length - 2];
      if (
        Math.hypot(last.x - p.x, last.y - p.y) <= 14 &&
        Math.hypot(last.x - previous.x, last.y - previous.y) <= 1
      )
        points.pop();
    }
    gesture.current = null;
    finishPolygonalLasso(g);
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
      if (!ready || cloudBusy || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape' && gesture.current?.tool === 'polygonal-lasso') {
        gesture.current = null;
        void paint(current());
        setNotice('Polygonal lasso cancelled');
        return;
      }
      if (gesture.current) return;
      if (e.key === 'Escape') {
        setActiveMenu(null);
        return;
      }
      if (typing) return;
      if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        void fillActiveLayer();
        return;
      }
      if (command) {
        const k = e.key.toLowerCase();
        if (
          [
            'z',
            'y',
            's',
            'o',
            'n',
            'a',
            'd',
            'g',
            'j',
            'i',
            'c',
            'v',
            'x',
          ].includes(k) ||
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
          if (e.altKey)
            setResizing({ width: current().w, height: current().h });
          else invertSelection();
        }
        if (k === 'g' && !e.altKey) {
          if (e.shiftKey) ungroupActiveLayer();
          else groupActiveLayer();
        }
        if (k === 'j' && !e.shiftKey) duplicate();
        if (k === 'c' && !e.shiftKey) copyLayer();
        if (k === 'x' && !e.shiftKey) cutLayer();
        if (k === 'v' && !e.shiftKey) pasteLayer();
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
        setSize((value) =>
          Math.max(2, Math.min(100, value + (e.key === ']' ? 2 : -2))),
        );
        return;
      }
      if (e.altKey) return;
      const lower = e.key.toLowerCase();
      const group = TOOL_GROUPS[lower];
      if (group) {
        e.preventDefault();
        const index = group.indexOf(tool);
        const direction = e.shiftKey ? -1 : 1;
        const next =
          group[
            (index < 0 ? 0 : index + direction + group.length) % group.length
          ];
        setTool(next);
        setNotice(
          `${TOOLS.find((item) => item.id === next)?.label || next} tool selected`,
        );
        return;
      }
      const alias = TOOL_ALIASES[lower];
      if (alias) {
        e.preventDefault();
        setTool(alias);
        setNotice(
          `${TOOLS.find((item) => item.id === alias)?.label || alias} tool selected`,
        );
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
    if (command === 'noop') return;
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
    else if (command === 'copy-layer') copyLayer();
    else if (command === 'cut-layer') cutLayer();
    else if (command === 'paste-layer') pasteLayer();
    else if (command === 'clear-layer') void clearActiveLayer();
    else if (command === 'fill-layer') void fillActiveLayer();
    else if (command === 'new-layer') addPaint();
    else if (command === 'duplicate-layer') duplicate();
    else if (command === 'delete-layer') remove();
    else if (command === 'group-layer') groupActiveLayer();
    else if (command === 'ungroup-layer') ungroupActiveLayer();
    else if (command === 'hide-layer') hideActiveLayer();
    else if (command === 'merge-visible') void mergeVisible();
    else if (command === 'flatten') void flattenImage();
    else if (command === 'text-tool') {
      setTool('text');
      setNotice('Text tool selected');
    } else if (command === 'select-all') selectAll();
    else if (command === 'deselect') setSelection(undefined);
    else if (command === 'invert-selection') invertSelection();
    else if (command === 'mask-selection') void createMaskFromSelection();
    else if (command === 'reset') resetAdjustments();
    else if (command === 'levels')
      setNotice('Levels controls are available in Adjust selected layer');
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
  const menuItemDisabled = (item: MenuItem) => {
    if (item.disabled || !frame) return true;
    const layer = frame.layers.find((item) => item.id === frame.active);
    const locked = layer ? layerIsLocked(frame, layer) : true;
    switch (item.command) {
      case 'undo':
        return !canUndo;
      case 'redo':
        return !canRedo;
      case 'copy-layer':
        return !layer;
      case 'cut-layer':
        return !layer || locked || frame.layers.length <= 1;
      case 'paste-layer':
        return !hasClipboard || frame.layers.length >= 32;
      case 'new-layer':
        return frame.layers.length >= 32;
      case 'clear-layer':
      case 'fill-layer':
        return !layer || layer.kind !== 'raster' || locked || !layer.visible;
      case 'duplicate-layer':
        return !layer || locked || frame.layers.length >= 32;
      case 'delete-layer':
        return !layer || locked || frame.layers.length <= 1;
      case 'group-layer':
        return (
          !layer || Boolean(layer.groupId) || (frame.groups || []).length >= 32
        );
      case 'ungroup-layer':
        return (
          !layer?.groupId ||
          Boolean(
            frame.groups?.find((group) => group.id === layer.groupId)?.locked,
          )
        );
      case 'mask-selection':
        return !layer || layer.kind !== 'raster' || locked || !frame.selection;
      case 'hide-layer':
        return !layer || Boolean(groupForLayer(frame, layer)?.locked);
      case 'merge-visible':
        return !frame.layers.some(
          (item) =>
            item.visible &&
            (!item.groupId ||
              frame.groups?.find((group) => group.id === item.groupId)
                ?.visible !== false),
        );
      default:
        return false;
    }
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
      {exporting && (
        <ExportDialog
          {...exporting}
          format={exportFormat}
          quality={exportQuality}
          targetBytes={exportTargetBytes}
          setFormat={setExportFormat}
          setQuality={setExportQuality}
          setTargetBytes={setExportTargetBytes}
          close={() => setExporting(null)}
          downloaded={setNotice}
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
                  {MENU_DEFS[menuName].map((item, index) =>
                    item.separator ? (
                      <hr key={`separator-${menuName}-${index}`} />
                    ) : (
                      <button
                        key={`${item.label}-${index}`}
                        role="menuitem"
                        disabled={menuItemDisabled(item)}
                        title={
                          item.disabled
                            ? 'Planned for a later roadmap stage'
                            : undefined
                        }
                        onClick={() => {
                          setActiveMenu(null);
                          runCommand(item.command);
                        }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <kbd>{item.shortcut}</kbd>}
                      </button>
                    ),
                  )}
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
              onDoubleClick={doubleClick}
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
            <div className="adjustment-subtitle">Levels (nondestructive)</div>
            <Slider
              label="Levels black point"
              value={levelsBlack}
              min={0}
              max={254}
              set={(value) => setLevelsBlack(Math.min(value, levelsWhite - 1))}
              suffix=""
            />
            <Slider
              label="Levels white point"
              value={levelsWhite}
              min={1}
              max={255}
              set={(value) => setLevelsWhite(Math.max(value, levelsBlack + 1))}
              suffix=""
            />
            <Slider
              label="Levels gamma"
              value={levelsGamma}
              min={0.1}
              max={3}
              step={0.1}
              set={setLevelsGamma}
              suffix=""
            />
            <p className="adjust-note">
              Adjustments stay editable on the selected layer. Levels remaps
              input black, white and midtone gamma without changing source
              pixels.
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
          {(tool === 'brush' ||
            tool === 'pencil' ||
            tool === 'color-replace' ||
            tool === 'eraser' ||
            tool === 'clone' ||
            tool === 'heal' ||
            tool === 'rectangle' ||
            tool === 'ellipse' ||
            tool === 'line' ||
            tool === 'polygon') && (
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
              {(tool === 'brush' ||
                tool === 'pencil' ||
                tool === 'color-replace' ||
                tool === 'eraser' ||
                tool === 'clone' ||
                tool === 'heal') && (
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
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (n: number) => void;
  suffix?: string;
  step?: number;
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
        step={step}
        value={value}
        onChange={(e) => set(+e.target.value)}
      />
    </label>
  );
}
