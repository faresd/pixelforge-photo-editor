'use client';

import { Brush, Crop, Download, Eraser, FileImage, FlipHorizontal2, FlipVertical2, ImagePlus, Layers3, MousePointer2, Palette, Plus, Redo2, RotateCcw, RotateCw, Save, Shapes, Sparkles, Type, Undo2, Upload, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tool = 'move' | 'crop' | 'brush' | 'eraser' | 'text' | 'rectangle';
type Shot = { url: string; w: number; h: number };
const TOOLS: { id: Tool; label: string; icon: typeof Brush; key: string }[] = [
  { id:'move',label:'Move',icon:MousePointer2,key:'V' }, { id:'crop',label:'Crop',icon:Crop,key:'C' },
  { id:'brush',label:'Brush',icon:Brush,key:'B' }, { id:'eraser',label:'Eraser',icon:Eraser,key:'E' },
  { id:'text',label:'Text',icon:Type,key:'T' }, { id:'rectangle',label:'Shape',icon:Shapes,key:'R' },
];
const FILTERS = [
  ['Original','none','#315277','#d59b6c'], ['Vivid','saturate(1.45) contrast(1.08)','#244d96','#ef854a'],
  ['Mono','grayscale(1) contrast(1.12)','#3d4249','#c6cbd0'], ['Warm','sepia(.35) saturate(1.2)','#654737','#e8a467'],
  ['Cool','hue-rotate(18deg) saturate(.9)','#335d91','#83bbc4'],
];

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null);
  const down = useRef(false), start = useRef({x:0,y:0}), base = useRef<ImageData|null>(null), history = useRef<Shot[]>([]), index = useRef(-1);
  const [tool,setTool]=useState<Tool>('move'), [zoom,setZoom]=useState(72), [color,setColor]=useState('#ff5c35'), [size,setSize]=useState(18);
  const [text,setText]=useState('Your text'), [fontSize,setFontSize]=useState(56), [brightness,setBrightness]=useState(100), [contrast,setContrast]=useState(100);
  const [saturation,setSaturation]=useState(100), [blur,setBlur]=useState(0), [filter,setFilter]=useState('none'), [name,setName]=useState('coastline-edit');
  const [dimensions,setDimensions]=useState('1440 × 960 px'), [notice,setNotice]=useState('Ready'), [drag,setDrag]=useState(false), [,render]=useState(0);
  const cssFilter=`${filter==='none'?'':filter} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;

  const snap=useCallback(()=>{const c=canvas.current;if(!c)return;history.current=history.current.slice(0,index.current+1);history.current.push({url:c.toDataURL(),w:c.width,h:c.height});if(history.current.length>24)history.current.shift();index.current=history.current.length-1;setDimensions(`${c.width} × ${c.height} px`);render(v=>v+1)},[]);
  const restore=(s:Shot)=>{const c=canvas.current;if(!c)return;const im=new Image();im.onload=()=>{c.width=s.w;c.height=s.h;c.getContext('2d')?.drawImage(im,0,0);setDimensions(`${s.w} × ${s.h} px`);render(v=>v+1)};im.src=s.url};
  useEffect(()=>{const c=canvas.current;if(!c||history.current.length)return;c.width=1440;c.height=960;const x=c.getContext('2d')!;
    const g=x.createLinearGradient(0,0,0,960);g.addColorStop(0,'#163154');g.addColorStop(.48,'#719ab4');g.addColorStop(.49,'#dec6a4');g.addColorStop(1,'#986b49');x.fillStyle=g;x.fillRect(0,0,1440,960);
    x.fillStyle='#c9814f';x.beginPath();x.arc(1120,260,110,0,Math.PI*2);x.fill();x.fillStyle='#223b42';x.beginPath();x.moveTo(0,580);x.lineTo(300,370);x.lineTo(515,575);x.lineTo(730,430);x.lineTo(970,610);x.lineTo(1440,390);x.lineTo(1440,720);x.lineTo(0,720);x.fill();x.fillStyle='#244e62';x.fillRect(0,650,1440,310);x.strokeStyle='#ffffff60';x.lineWidth=8;for(let y=690;y<920;y+=55){x.beginPath();x.moveTo(40,y);x.bezierCurveTo(350,y-38,610,y+34,980,y-6);x.stroke()}snap();
  },[snap]);
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{const c=canvas.current!,r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};
  const load=(f?:File)=>{if(!f?.type.startsWith('image/')){setNotice('Choose an image file');return}const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const c=canvas.current!,s=Math.min(1,2200/Math.max(im.width,im.height));c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d')?.drawImage(im,0,0,c.width,c.height);history.current=[];index.current=-1;setName(f.name.replace(/\.[^/.]+$/,''));setZoom(72);snap();setNotice('Photo opened')};im.src=String(rd.result)};rd.readAsDataURL(f)};
  const pointerDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(tool==='move')return;const c=canvas.current!,x=c.getContext('2d')!,p=point(e);start.current=p;down.current=true;c.setPointerCapture(e.pointerId);base.current=x.getImageData(0,0,c.width,c.height);if(tool==='text'){x.fillStyle=color;x.font=`700 ${fontSize}px Arial`;x.textBaseline='top';x.fillText(text||'Your text',p.x,p.y);down.current=false;snap();setNotice('Text added')}else if(tool==='brush'||tool==='eraser'){x.beginPath();x.moveTo(p.x,p.y);x.lineCap='round';x.lineJoin='round'}};
  const pointerMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!down.current)return;const c=canvas.current!,x=c.getContext('2d')!,p=point(e);if(tool==='brush'||tool==='eraser'){x.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';x.strokeStyle=color;x.lineWidth=size;x.lineTo(p.x,p.y);x.stroke();x.globalCompositeOperation='source-over'}else if(base.current){x.putImageData(base.current,0,0);x.setLineDash(tool==='crop'?[18,12]:[]);x.lineWidth=Math.max(4,size/3);x.strokeStyle=tool==='crop'?'white':color;x.strokeRect(start.current.x,start.current.y,p.x-start.current.x,p.y-start.current.y);x.setLineDash([])}};
  const pointerUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!down.current)return;down.current=false;const c=canvas.current!,p=point(e);if(tool==='crop'&&base.current){const x=c.getContext('2d')!;x.putImageData(base.current,0,0);const l=Math.max(0,Math.min(start.current.x,p.x)),t=Math.max(0,Math.min(start.current.y,p.y)),w=Math.min(c.width-l,Math.abs(p.x-start.current.x)),h=Math.min(c.height-t,Math.abs(p.y-start.current.y));if(w>20&&h>20){const cut=x.getImageData(l,t,w,h);c.width=Math.round(w);c.height=Math.round(h);c.getContext('2d')?.putImageData(cut,0,0);setNotice('Image cropped')}}snap()};
  const transform=(a:'left'|'right'|'h'|'v')=>{const c=canvas.current!,tmp=document.createElement('canvas');tmp.width=c.width;tmp.height=c.height;tmp.getContext('2d')?.drawImage(c,0,0);if(a==='left'||a==='right'){c.width=tmp.height;c.height=tmp.width}const x=c.getContext('2d')!;x.save();if(a==='right'){x.translate(c.width,0);x.rotate(Math.PI/2)}if(a==='left'){x.translate(0,c.height);x.rotate(-Math.PI/2)}if(a==='h'){x.translate(c.width,0);x.scale(-1,1)}if(a==='v'){x.translate(0,c.height);x.scale(1,-1)}x.drawImage(tmp,0,0);x.restore();snap();setNotice('Transform applied')};
  const apply=()=>{const c=canvas.current!,tmp=document.createElement('canvas');tmp.width=c.width;tmp.height=c.height;const x=tmp.getContext('2d')!;x.filter=cssFilter;x.drawImage(c,0,0);c.getContext('2d')!.drawImage(tmp,0,0);setBrightness(100);setContrast(100);setSaturation(100);setBlur(0);setFilter('none');snap();setNotice('Adjustments applied')};
  const undo=()=>{if(index.current<=0)return;restore(history.current[--index.current]);setNotice('Undone')},redo=()=>{if(index.current>=history.current.length-1)return;restore(history.current[++index.current]);setNotice('Redone')};
  const download=(type:'png'|'jpeg'='png')=>{const c=canvas.current!,out=document.createElement('canvas');out.width=c.width;out.height=c.height;const x=out.getContext('2d')!;x.filter=cssFilter;x.drawImage(c,0,0);const a=document.createElement('a');a.download=`${name}.${type==='jpeg'?'jpg':type}`;a.href=out.toDataURL(`image/${type}`,.92);a.click();setNotice('Export downloaded')};
  const reset=()=>{setBrightness(100);setContrast(100);setSaturation(100);setBlur(0);setFilter('none')};

  return <main className="editor-shell" onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);load(e.dataTransfer.files[0])}}>
    <input ref={file} className="hidden" type="file" accept="image/*" onChange={e=>load(e.target.files?.[0])}/>
    <header className="topbar"><div className="brand"><span className="brand-mark"><Palette/></span><span>Pixel<b>Forge</b></span><em>FREE</em></div><nav><button>File</button><button>Edit</button><button>Image</button><button>Filter</button><button>View</button></nav><div className="top-actions"><button className="icon" onClick={undo} disabled={index.current<=0}><Undo2/></button><button className="icon" onClick={redo} disabled={index.current>=history.current.length-1}><Redo2/></button><button className="open" onClick={()=>file.current?.click()}><Upload/> Open image</button><button className="export" onClick={()=>download()}><Download/> Export</button></div></header>
    <section className="docbar"><div><FileImage/><input value={name} onChange={e=>setName(e.target.value)}/><small>• &nbsp;{dimensions}</small></div><span><i/>Editing locally — your image stays private</span></section>
    <div className="workspace">
      <aside className="toolbar">{TOOLS.map(({id,label,icon:Icon,key})=><button key={id} className={tool===id?'active':''} onClick={()=>setTool(id)} title={`${label} (${key})`}><Icon/><span>{label}</span><kbd>{key}</kbd></button>)}<hr/><label className="color"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/><i style={{background:color}}/><small>Color</small></label></aside>
      <section className={`stage ${drag?'dragging':''}`}>{drag&&<div className="drop"><ImagePlus/><b>Drop your photo here</b><span>JPG, PNG, WEBP and more</span></div>}<div className="canvas-wrap" style={{width:`${zoom}%`}}><canvas ref={canvas} style={{filter:cssFilter}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} className={`tool-${tool}`}/></div><div className="zoom"><button onClick={()=>setZoom(Math.max(20,zoom-10))}><ZoomOut/></button><input type="range" min="20" max="140" value={zoom} onChange={e=>setZoom(+e.target.value)}/><span>{zoom}%</span><button onClick={()=>setZoom(Math.min(140,zoom+10))}><ZoomIn/></button></div></section>
      <aside className="inspector">
        <section className="panel"><Title icon={WandSparkles} text="Adjust" action="Reset" onClick={reset}/><Slider label="Brightness" value={brightness} min={20} max={180} set={setBrightness}/><Slider label="Contrast" value={contrast} min={20} max={180} set={setContrast}/><Slider label="Saturation" value={saturation} min={0} max={200} set={setSaturation}/><Slider label="Blur" value={blur} min={0} max={12} set={setBlur} suffix="px"/><button className="apply" onClick={apply}><Sparkles/>Apply adjustments</button></section>
        <section className="panel"><Title icon={Crop} text="Transform"/><div className="transform"><button onClick={()=>transform('left')}><RotateCcw/></button><button onClick={()=>transform('right')}><RotateCw/></button><button onClick={()=>transform('h')}><FlipHorizontal2/></button><button onClick={()=>transform('v')}><FlipVertical2/></button></div></section>
        {(tool==='brush'||tool==='eraser'||tool==='rectangle')&&<section className="panel"><Title icon={Brush} text="Tool options"/><Slider label="Size" value={size} min={2} max={100} set={setSize} suffix="px"/></section>}
        {tool==='text'&&<section className="panel"><Title icon={Type} text="Text"/><input className="text-input" value={text} onChange={e=>setText(e.target.value)}/><Slider label="Size" value={fontSize} min={16} max={160} set={setFontSize} suffix="px"/></section>}
        <section className="panel"><Title icon={Sparkles} text="Quick filters"/><div className="filters">{FILTERS.map(f=><button key={f[0]} className={filter===f[1]?'selected':''} onClick={()=>setFilter(f[1])}><i style={{background:`linear-gradient(135deg,${f[2]},${f[3]})`}}/><small>{f[0]}</small></button>)}</div></section>
        <section className="panel"><Title icon={Layers3} text="Layers" action={<Plus/>}/><div className="layer"><i/><div><b>Artwork</b><small>Pixel layer</small></div><span>●</span></div></section>
      </aside>
    </div>
    <footer><span><i/>{notice}</span><span>{tool[0].toUpperCase()+tool.slice(1)} tool</span><span>Autosaved in this tab</span><button onClick={()=>download('jpeg')}><Save/> Save JPG</button></footer>
  </main>;
}
function Title({icon:Icon,text,action,onClick}:{icon:typeof Brush;text:string;action?:React.ReactNode;onClick?:()=>void}){return <div className="panel-title"><span><Icon/>{text}</span>{action&&<button onClick={onClick}>{action}</button>}</div>}
function Slider({label,value,min,max,set,suffix='%'}:{label:string;value:number;min:number;max:number;set:(n:number)=>void;suffix?:string}){return <label className="slider"><span><b>{label}</b><output>{value}{suffix}</output></span><input type="range" min={min} max={max} value={value} onChange={e=>set(+e.target.value)}/></label>}
