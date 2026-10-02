'use client';

import { Brush, Crop, Download, Eraser, FileImage, FlipHorizontal2, FlipVertical2, ImagePlus, Layers3, MousePointer2, Palette, Redo2, RotateCcw, RotateCw, Save, Shapes, Sparkles, Type, Undo2, Upload, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createDraftId, discardDraft, initialDraftId, readDraft, saveDraft, type Tool, type Shot } from '../src/drafts';
type MenuName = 'File' | 'Edit' | 'Image' | 'Filter' | 'View';
type Command = 'new-white' | 'new-transparent' | 'open' | 'png' | 'jpg' | 'undo' | 'redo' | 'reset' | 'crop' | 'rotate-left' | 'rotate-right' | 'flip-h' | 'flip-v' | 'filter-original' | 'filter-vivid' | 'filter-mono' | 'filter-warm' | 'filter-cool' | 'apply' | 'zoom-in' | 'zoom-out' | 'fit' | 'actual';
type MenuItem = { label: string; shortcut?: string; command: Command };

const TOOLS: { id: Tool; label: string; icon: typeof Brush; key: string }[] = [
  { id: 'move', label: 'Move', icon: MousePointer2, key: 'V' }, { id: 'crop', label: 'Crop', icon: Crop, key: 'C' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' }, { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'text', label: 'Text', icon: Type, key: 'T' }, { id: 'rectangle', label: 'Shape', icon: Shapes, key: 'R' },
];
const FILTERS = [
  ['Original', 'none', '#315277', '#d59b6c'], ['Vivid', 'saturate(1.45) contrast(1.08)', '#244d96', '#ef854a'],
  ['Mono', 'grayscale(1) contrast(1.12)', '#3d4249', '#c6cbd0'], ['Warm', 'sepia(.35) saturate(1.2)', '#654737', '#e8a467'],
  ['Cool', 'hue-rotate(18deg) saturate(.9)', '#335d91', '#83bbc4'],
] as const;
const MENU_DEFS: Record<MenuName, MenuItem[]> = {
  File: [{ label: 'New white document', shortcut: 'Ctrl+N', command: 'new-white' }, { label: 'New transparent document', command: 'new-transparent' }, { label: 'Open image…', shortcut: 'Ctrl+O', command: 'open' }, { label: 'Export as PNG', shortcut: 'Ctrl+S', command: 'png' }, { label: 'Export as JPG', command: 'jpg' }],
  Edit: [{ label: 'Undo', shortcut: 'Ctrl+Z', command: 'undo' }, { label: 'Redo', shortcut: 'Ctrl+Y', command: 'redo' }, { label: 'Reset adjustments', command: 'reset' }, { label: 'Clear to transparent', command: 'new-transparent' }],
  Image: [{ label: 'Crop', shortcut: 'C', command: 'crop' }, { label: 'Rotate left', command: 'rotate-left' }, { label: 'Rotate right', command: 'rotate-right' }, { label: 'Flip horizontal', command: 'flip-h' }, { label: 'Flip vertical', command: 'flip-v' }],
  Filter: [{ label: 'Original', command: 'filter-original' }, { label: 'Vivid', command: 'filter-vivid' }, { label: 'Mono', command: 'filter-mono' }, { label: 'Warm', command: 'filter-warm' }, { label: 'Cool', command: 'filter-cool' }, { label: 'Apply current filter', command: 'apply' }],
  View: [{ label: 'Zoom in', shortcut: '+', command: 'zoom-in' }, { label: 'Zoom out', shortcut: '−', command: 'zoom-out' }, { label: 'Fit to screen', shortcut: '0', command: 'fit' }, { label: 'Actual size', shortcut: '1', command: 'actual' }],
};

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null), stage = useRef<HTMLElement>(null), menuArea = useRef<HTMLElement>(null);
  const down = useRef(false), start = useRef({ x: 0, y: 0 }), panStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const base = useRef<ImageData | null>(null), history = useRef<Shot[]>([]), index = useRef(-1);
  const [tool, setTool] = useState<Tool>('move'), [zoom, setZoom] = useState(72), [color, setColor] = useState('#ff5c35'), [size, setSize] = useState(18);
  const [text, setText] = useState('Your text'), [fontSize, setFontSize] = useState(56), [brightness, setBrightness] = useState(100), [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100), [blur, setBlur] = useState(0), [filter, setFilter] = useState('none'), [name, setName] = useState('coastline-edit');
  const [dimensions, setDimensions] = useState('1440 × 960 px'), [notice, setNotice] = useState('Ready'), [drag, setDrag] = useState(false), [activeMenu, setActiveMenu] = useState<MenuName | null>(null);
  const [canUndo, setCanUndo] = useState(false), [canRedo, setCanRedo] = useState(false);
  const [draftId, setDraftId] = useState(initialDraftId), [ready, setReady] = useState(false), [revision, setRevision] = useState(0);
  const openingDraftId = useRef(draftId);
  const [saveStatus, setSaveStatus] = useState('Opening saved document…');
  const saveSequence = useRef(0), saving = useRef(false), discarding = useRef(false);
  const cssFilter = `${filter === 'none' ? '' : filter} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;

  const snap = useCallback(() => { const c = canvas.current; if (!c) return; history.current = history.current.slice(0, index.current + 1); history.current.push({ url: c.toDataURL(), w: c.width, h: c.height }); if (history.current.length > 24) history.current.shift(); index.current = history.current.length - 1; setDimensions(`${c.width} × ${c.height} px`); setCanUndo(index.current > 0); setCanRedo(false); setRevision(value => value + 1); }, []);
  const resetAdjustments = useCallback(() => { setBrightness(100); setContrast(100); setSaturation(100); setBlur(0); setFilter('none'); }, []);
  const restore = useCallback((shot: Shot) => { const c = canvas.current; if (!c) return; const image = new Image(); image.onload = () => { c.width = shot.w; c.height = shot.h; c.getContext('2d')?.drawImage(image, 0, 0); setDimensions(`${shot.w} × ${shot.h} px`); setRevision(value => value + 1); }; image.src = shot.url; }, []);
  const newDocument = useCallback((transparent = false) => { const c = canvas.current; if (!c) return; setDraftId(createDraftId()); c.width = 1200; c.height = 800; const x = c.getContext('2d')!; x.clearRect(0, 0, c.width, c.height); if (!transparent) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } history.current = []; index.current = -1; setName(transparent ? 'untitled-transparent' : 'untitled'); setZoom(72); resetAdjustments(); snap(); setNotice(transparent ? 'New transparent document' : 'New document'); }, [resetAdjustments, snap]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const c = canvas.current;
      if (!c) return;
      try {
        const saved = await readDraft(openingDraftId.current);
        if (cancelled) return;
        if (saved) {
          const shot = saved.history[saved.index];
          const image = new Image();
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Saved image cannot be opened')); image.src = shot.url; });
          if (cancelled) return;
          c.width = shot.w; c.height = shot.h; c.getContext('2d')?.drawImage(image, 0, 0);
          history.current = saved.history; index.current = saved.index;
          setName(saved.name); setDimensions(`${shot.w} × ${shot.h} px`);
          setCanUndo(saved.index > 0); setCanRedo(saved.index < saved.history.length - 1);
          const settings = saved.settings;
          setTool(settings.tool); setZoom(settings.zoom); setColor(settings.color); setSize(settings.size); setText(settings.text); setFontSize(settings.fontSize);
          setBrightness(settings.brightness); setContrast(settings.contrast); setSaturation(settings.saturation); setBlur(settings.blur); setFilter(settings.filter);
          setNotice('Saved document restored'); setReady(true); return;
        }
      } catch {
        if (cancelled) return;
        // Preserve an unreadable stored draft instead of overwriting it.
        setDraftId(createDraftId());
        setNotice('Recovery unavailable. Keep exported copies of your work.');
      }
      if (cancelled) return;
      c.width = 1440; c.height = 960; const x = c.getContext('2d')!, g = x.createLinearGradient(0, 0, 0, 960); g.addColorStop(0, '#163154'); g.addColorStop(.48, '#719ab4'); g.addColorStop(.49, '#dec6a4'); g.addColorStop(1, '#986b49'); x.fillStyle = g; x.fillRect(0, 0, 1440, 960); x.fillStyle = '#c9814f'; x.beginPath(); x.arc(1120, 260, 110, 0, Math.PI * 2); x.fill(); x.fillStyle = '#223b42'; x.beginPath(); x.moveTo(0, 580); x.lineTo(300, 370); x.lineTo(515, 575); x.lineTo(730, 430); x.lineTo(970, 610); x.lineTo(1440, 390); x.lineTo(1440, 720); x.lineTo(0, 720); x.fill(); x.fillStyle = '#244e62'; x.fillRect(0, 650, 1440, 310); x.strokeStyle = '#ffffff60'; x.lineWidth = 8; for (let y = 690; y < 920; y += 55) { x.beginPath(); x.moveTo(40, y); x.bezierCurveTo(350, y - 38, 610, y + 34, 980, y - 6); x.stroke(); }
      snap(); setReady(true);
    };
    void initialize();
    return () => { cancelled = true; };
    // Initialization runs once; subsequent document IDs are created by editor actions.
  }, [snap]);

  useEffect(() => {
    if (!ready || discarding.current || !history.current.length) return;
    const sequence = ++saveSequence.current;
    saving.current = true;
    setSaveStatus('Saving on this device…');
    void saveDraft(draftId, {
      version: 1, history: history.current.slice(), index: index.current, name,
      settings: { tool, zoom, color, size, text, fontSize, brightness, contrast, saturation, blur, filter },
    }).then(() => {
      if (sequence === saveSequence.current) { saving.current = false; setSaveStatus('Saved on this device'); }
    }).catch(() => {
      if (sequence === saveSequence.current) { saving.current = true; setSaveStatus('Local save failed — export a copy'); }
    });
  }, [ready, revision, draftId, name, tool, zoom, color, size, text, fontSize, brightness, contrast, saturation, blur, filter]);

  useEffect(() => {
    const protectPendingSave = (event: BeforeUnloadEvent) => { if (saving.current) { event.preventDefault(); } };
    window.addEventListener('beforeunload', protectPendingSave);
    return () => window.removeEventListener('beforeunload', protectPendingSave);
  }, []);

  const discard = async () => {
    if (!window.confirm('Discard this saved draft? This cannot be undone. Download an image first if you want to keep a copy.')) return;
    discarding.current = true; saving.current = false; ++saveSequence.current;
    try { await discardDraft(draftId); window.location.assign('/'); }
    catch { discarding.current = false; setSaveStatus('Could not discard the draft. Please try again.'); }
  };
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = canvas.current!, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; };
  const load = useCallback((selected?: File) => { if (!selected?.type.startsWith('image/')) { setNotice('Choose an image file'); return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result !== 'string') { setNotice('This file could not be read'); return; } const image = new Image(); image.onload = () => { setDraftId(createDraftId()); const c = canvas.current!, scale = Math.min(1, 2200 / Math.max(image.width, image.height)); c.width = Math.round(image.width * scale); c.height = Math.round(image.height * scale); c.getContext('2d')?.drawImage(image, 0, 0, c.width, c.height); history.current = []; index.current = -1; setName(selected.name.replace(/\.[^/.]+$/, '')); setZoom(72); resetAdjustments(); snap(); setNotice('Photo opened'); if (file.current) file.current.value = ''; }; image.onerror = () => setNotice('This image could not be opened'); image.src = reader.result; }; reader.onerror = () => setNotice('This file could not be read'); reader.readAsDataURL(selected); }, [resetAdjustments, snap]);

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = canvas.current!; if (tool === 'move') { const s = stage.current!; down.current = true; panStart.current = { x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop }; c.setPointerCapture(e.pointerId); return; } const x = c.getContext('2d')!, p = point(e); start.current = p; down.current = true; c.setPointerCapture(e.pointerId); base.current = x.getImageData(0, 0, c.width, c.height); if (tool === 'text') { x.fillStyle = color; x.font = `700 ${fontSize}px Arial`; x.textBaseline = 'top'; x.fillText(text || 'Your text', p.x, p.y); down.current = false; snap(); setNotice('Text added'); } else if (tool === 'brush' || tool === 'eraser') { x.beginPath(); x.moveTo(p.x, p.y); x.lineCap = 'round'; x.lineJoin = 'round'; } };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!down.current) return; if (tool === 'move') { const s = stage.current!; s.scrollLeft = panStart.current.left - (e.clientX - panStart.current.x); s.scrollTop = panStart.current.top - (e.clientY - panStart.current.y); return; } const c = canvas.current!, x = c.getContext('2d')!, p = point(e); if (tool === 'brush' || tool === 'eraser') { x.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; x.strokeStyle = color; x.lineWidth = size; x.lineTo(p.x, p.y); x.stroke(); x.globalCompositeOperation = 'source-over'; } else if (base.current) { x.putImageData(base.current, 0, 0); x.setLineDash(tool === 'crop' ? [18, 12] : []); x.lineWidth = Math.max(4, size / 3); x.strokeStyle = tool === 'crop' ? 'white' : color; x.strokeRect(start.current.x, start.current.y, p.x - start.current.x, p.y - start.current.y); x.setLineDash([]); } };
  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!down.current) return; down.current = false; if (tool === 'move') { setNotice('Canvas moved'); return; } const c = canvas.current!, p = point(e); if (tool === 'crop' && base.current) { const x = c.getContext('2d')!; x.putImageData(base.current, 0, 0); const l = Math.max(0, Math.min(start.current.x, p.x)), t = Math.max(0, Math.min(start.current.y, p.y)), w = Math.min(c.width - l, Math.abs(p.x - start.current.x)), h = Math.min(c.height - t, Math.abs(p.y - start.current.y)); if (w > 20 && h > 20) { const cut = x.getImageData(l, t, w, h); c.width = Math.round(w); c.height = Math.round(h); c.getContext('2d')?.putImageData(cut, 0, 0); setNotice('Image cropped'); } } else setNotice(tool === 'rectangle' ? 'Shape added' : `${tool[0].toUpperCase() + tool.slice(1)} applied`); snap(); };

  const transform = useCallback((a: 'left' | 'right' | 'h' | 'v') => { const c = canvas.current!, tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height; tmp.getContext('2d')?.drawImage(c, 0, 0); if (a === 'left' || a === 'right') { c.width = tmp.height; c.height = tmp.width; } const x = c.getContext('2d')!; x.save(); if (a === 'right') { x.translate(c.width, 0); x.rotate(Math.PI / 2); } if (a === 'left') { x.translate(0, c.height); x.rotate(-Math.PI / 2); } if (a === 'h') { x.translate(c.width, 0); x.scale(-1, 1); } if (a === 'v') { x.translate(0, c.height); x.scale(1, -1); } x.drawImage(tmp, 0, 0); x.restore(); snap(); setNotice('Transform applied'); }, [snap]);
  const apply = useCallback(() => { const c = canvas.current!, tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height; const x = tmp.getContext('2d')!; x.filter = cssFilter; x.drawImage(c, 0, 0); const dest = c.getContext('2d')!; dest.clearRect(0, 0, c.width, c.height); dest.drawImage(tmp, 0, 0); resetAdjustments(); snap(); setNotice('Adjustments applied'); }, [cssFilter, resetAdjustments, snap]);
  const undo = useCallback(() => { if (index.current <= 0) return; restore(history.current[--index.current]); setCanUndo(index.current > 0); setCanRedo(true); setNotice('Undone'); }, [restore]);
  const redo = useCallback(() => { if (index.current >= history.current.length - 1) return; restore(history.current[++index.current]); setCanUndo(true); setCanRedo(index.current < history.current.length - 1); setNotice('Redone'); }, [restore]);
  const download = useCallback((type: 'png' | 'jpeg' = 'png') => { const c = canvas.current!, out = document.createElement('canvas'); out.width = c.width; out.height = c.height; const x = out.getContext('2d')!; x.filter = cssFilter; if (type === 'jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height); } x.drawImage(c, 0, 0); const a = document.createElement('a'); a.download = `${name || 'pixelforge-edit'}.${type === 'jpeg' ? 'jpg' : type}`; a.href = out.toDataURL(`image/${type}`, .92); a.click(); setNotice(`${type === 'jpeg' ? 'JPG' : 'PNG'} export downloaded`); }, [cssFilter, name]);
  const fitToScreen = useCallback(() => { setZoom(72); stage.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' }); setNotice('Fit to screen'); }, []);
  const chooseFilter = useCallback((value: string, label: string) => { setFilter(value); setNotice(`${label} filter preview`); }, []);
  const openFile = useCallback(() => file.current?.click(), []);

  useEffect(() => { const close = (e: PointerEvent) => { if (!menuArea.current?.contains(e.target as Node)) setActiveMenu(null); }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { const target = e.target as HTMLElement, typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable, commandKey = e.ctrlKey || e.metaKey; if (e.key === 'Escape') { setActiveMenu(null); return; } if (commandKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; } if (commandKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; } if (commandKey && e.key.toLowerCase() === 's') { e.preventDefault(); download('png'); return; } if (commandKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; } if (commandKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newDocument(false); return; } if (!typing && !commandKey && !e.altKey) { if (e.key === '0') { fitToScreen(); return; } if (e.key === '1') { setZoom(100); setNotice('Actual size'); return; } if (e.key === '+' || e.key === '=') { setZoom(v => Math.min(140, v + 10)); return; } if (e.key === '-') { setZoom(v => Math.max(20, v - 10)); return; } const match = TOOLS.find(item => item.key.toLowerCase() === e.key.toLowerCase()); if (match) { setTool(match.id); setNotice(`${match.label} tool selected`); } } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [download, fitToScreen, newDocument, openFile, redo, undo]);

  const runCommand = (command: Command) => {
    if (command === 'new-white') newDocument(false);
    else if (command === 'new-transparent') newDocument(true);
    else if (command === 'open') openFile();
    else if (command === 'png') download('png');
    else if (command === 'jpg') download('jpeg');
    else if (command === 'undo') undo();
    else if (command === 'redo') redo();
    else if (command === 'reset') { resetAdjustments(); setNotice('Adjustments reset'); }
    else if (command === 'crop') { setTool('crop'); setNotice('Drag on the image to crop'); }
    else if (command === 'rotate-left') transform('left');
    else if (command === 'rotate-right') transform('right');
    else if (command === 'flip-h') transform('h');
    else if (command === 'flip-v') transform('v');
    else if (command.startsWith('filter-')) { const label = command.slice(7); const match = FILTERS.find(item => item[0].toLowerCase() === label); if (match) chooseFilter(match[1], match[0]); }
    else if (command === 'apply') apply();
    else if (command === 'zoom-in') setZoom(v => Math.min(140, v + 10));
    else if (command === 'zoom-out') setZoom(v => Math.max(20, v - 10));
    else if (command === 'fit') fitToScreen();
    else if (command === 'actual') { setZoom(100); setNotice('Actual size'); }
  };

  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <main className="editor-shell" role="application" aria-label="PixelForge photo editor" aria-busy={!ready} inert={!ready} tabIndex={-1} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }}>
    <input ref={file} data-testid="file-input" className="hidden" type="file" accept="image/*" onChange={e => load(e.target.files?.[0])} />
    <header className="topbar"><div className="brand"><span className="brand-mark"><Palette /></span><span>Pixel<b>Forge</b></span><em>FREE</em></div>
      <nav ref={menuArea} aria-label="Editor menus">{(Object.keys(MENU_DEFS) as MenuName[]).map(menuName => <div className="menu" key={menuName}><button className={activeMenu === menuName ? 'menu-active' : ''} aria-haspopup="menu" aria-expanded={activeMenu === menuName} onClick={() => setActiveMenu(current => current === menuName ? null : menuName)}>{menuName}</button>{activeMenu === menuName && <div className="menu-popup" role="menu" aria-label={`${menuName} menu`}>{MENU_DEFS[menuName].map(item => <button key={item.label} role="menuitem" disabled={(item.command === 'undo' && !canUndo) || (item.command === 'redo' && !canRedo)} onClick={() => { setActiveMenu(null); runCommand(item.command); }}><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}</div>)}</nav>
      <div className="top-actions"><button aria-label="Undo" className="icon" onClick={undo} disabled={!canUndo}><Undo2 /></button><button aria-label="Redo" className="icon" onClick={redo} disabled={!canRedo}><Redo2 /></button><button className="open" onClick={openFile}><Upload /> Open image</button><button className="export" onClick={() => download()}><Download /> Export</button></div></header>
    <section className="docbar"><div><FileImage /><input aria-label="Document name" value={name} onChange={e => setName(e.target.value)} /><small>• &nbsp;{dimensions}</small></div><div className="draft-actions"><a href="/">Home</a><button onClick={() => void discard()}>Discard draft</button></div></section>
    <div className="workspace"><aside className="toolbar" aria-label="Tools">{TOOLS.map(({ id, label, icon: Icon, key }) => <button key={id} className={tool === id ? 'active' : ''} onClick={() => { setTool(id); setNotice(`${label} tool selected`); }} aria-label={`${label} tool`} title={`${label} (${key})`}><Icon /><span>{label}</span><kbd>{key}</kbd></button>)}<hr /><label className="color"><input aria-label="Drawing color" type="color" value={color} onChange={e => setColor(e.target.value)} /><i style={{ background: color }} /><small>Color</small></label></aside>
      <section ref={stage} className={`stage ${drag ? 'dragging' : ''}`}>{drag && <div className="drop"><ImagePlus /><b>Drop your photo here</b><span>JPG, PNG, WEBP and more</span></div>}<div className="canvas-wrap" style={{ width: `${zoom}%` }}><canvas ref={canvas} data-testid="editor-canvas" style={{ filter: cssFilter }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} className={`tool-${tool}`} /></div><div className="zoom"><button aria-label="Zoom out" onClick={() => setZoom(Math.max(20, zoom - 10))}><ZoomOut /></button><input aria-label="Zoom" type="range" min="20" max="140" value={zoom} onChange={e => setZoom(+e.target.value)} /><span>{zoom}%</span><button aria-label="Zoom in" onClick={() => setZoom(Math.min(140, zoom + 10))}><ZoomIn /></button></div></section>
      <aside className="inspector"><section className="panel"><Title icon={WandSparkles} text="Adjust" action="Reset" onClick={() => { resetAdjustments(); setNotice('Adjustments reset'); }} /><Slider label="Brightness" value={brightness} min={20} max={180} set={setBrightness} /><Slider label="Contrast" value={contrast} min={20} max={180} set={setContrast} /><Slider label="Saturation" value={saturation} min={0} max={200} set={setSaturation} /><Slider label="Blur" value={blur} min={0} max={12} set={setBlur} suffix="px" /><button className="apply" onClick={apply}><Sparkles />Apply adjustments</button></section>
        <section className="panel"><Title icon={Crop} text="Transform" /><div className="transform"><button aria-label="Rotate left" onClick={() => transform('left')}><RotateCcw /></button><button aria-label="Rotate right" onClick={() => transform('right')}><RotateCw /></button><button aria-label="Flip horizontal" onClick={() => transform('h')}><FlipHorizontal2 /></button><button aria-label="Flip vertical" onClick={() => transform('v')}><FlipVertical2 /></button></div></section>
        {(tool === 'brush' || tool === 'eraser' || tool === 'rectangle') && <section className="panel"><Title icon={Brush} text="Tool options" /><Slider label="Size" value={size} min={2} max={100} set={setSize} suffix="px" /></section>}{tool === 'text' && <section className="panel"><Title icon={Type} text="Text" /><input aria-label="Text content" className="text-input" value={text} onChange={e => setText(e.target.value)} /><Slider label="Size" value={fontSize} min={16} max={160} set={setFontSize} suffix="px" /></section>}
        <section className="panel"><Title icon={Sparkles} text="Quick filters" /><div className="filters">{FILTERS.map(([label, value, first, second]) => <button key={label} className={filter === value ? 'selected' : ''} onClick={() => chooseFilter(value, label)} aria-label={`${label} filter`}><i style={{ background: `linear-gradient(135deg,${first},${second})` }} /><small>{label}</small></button>)}</div></section><section className="panel"><Title icon={Layers3} text="Canvas" /><div className="layer"><i /><div><b>Artwork</b><small>Single editable canvas</small></div><span>●</span></div></section></aside>
    </div><footer><span><i />{notice}</span><span>{tool[0].toUpperCase() + tool.slice(1)} tool</span><output title="This bookmark restores the document in this browser. Clearing browser data removes local documents; export a backup.">{saveStatus}</output><button onClick={() => download('jpeg')}><Save /> Save JPG</button></footer>
  </main>;
}

function Title({ icon: Icon, text, action, onClick }: { icon: typeof Brush; text: string; action?: React.ReactNode; onClick?: () => void }) { return <div className="panel-title"><span><Icon />{text}</span>{action && <button onClick={onClick}>{action}</button>}</div>; }
function Slider({ label, value, min, max, set, suffix = '%' }: { label: string; value: number; min: number; max: number; set: (n: number) => void; suffix?: string }) { return <label className="slider"><span><b>{label}</b><output>{value}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e => set(+e.target.value)} /></label>; }
