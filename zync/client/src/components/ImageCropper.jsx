import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Sparkles, Move } from 'lucide-react';
import { Modal, Spinner } from './ui.jsx';
import { CroppedImage } from './Avatar.jsx';
import { uploadFile } from '../lib/api.js';
import { toast } from '../lib/store.js';

const MAX_ZOOM = 6;

/**
 * Bild zuschneiden: ziehen zum Verschieben, Mausrad/Pinch/Slider zum Zoomen.
 * Das Original (auch GIF) wird hochgeladen, der Zuschnitt als Daten gespeichert → Animationen bleiben erhalten.
 */
export function ImageCropper({ file, aspect = 1, shape = 'circle', title = 'Bild anpassen', onDone, onCancel }) {
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const [nat, setNat] = useState(null);
  const [crop, setCrop] = useState({ cx: 0.5, cy: 0.5, zoom: 1 });
  const [frameW, setFrameW] = useState(360);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const stageRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const isGif = /gif|webp/i.test(file.type);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 48;
      const h = el.clientHeight - 48;
      setFrameW(Math.max(120, Math.min(w, h * aspect, aspect >= 2 ? 560 : 340)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const frameH = frameW / aspect;
  const r = nat ? nat.w / nat.h : 1;
  const wp = crop.zoom * Math.max(1, r / aspect);
  const hp = crop.zoom * Math.max(1, aspect / r);

  const clamp = (c) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
    const w = z * Math.max(1, r / aspect);
    const h = z * Math.max(1, aspect / r);
    const mx = 0.5 / w;
    const my = 0.5 / h;
    return { zoom: z, cx: Math.min(1 - mx, Math.max(mx, c.cx)), cy: Math.min(1 - my, Math.max(my, c.cy)) };
  };
  const update = (fn) => setCrop((c) => clamp(fn(c)));

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: crop.zoom };
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      update((c) => ({ ...c, zoom: pinch.current.zoom * (d / pinch.current.dist) }));
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    update((c) => ({ ...c, cx: c.cx - dx / (frameW * wp), cy: c.cy - dy / (frameH * hp) }));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const wheel = (e) => {
      e.preventDefault();
      setCrop((c) => clamp({ ...c, zoom: c.zoom * Math.exp(-e.deltaY * 0.0015) }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const onKey = (e) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowLeft') update((c) => ({ ...c, cx: c.cx - step }));
    else if (e.key === 'ArrowRight') update((c) => ({ ...c, cx: c.cx + step }));
    else if (e.key === 'ArrowUp') update((c) => ({ ...c, cy: c.cy - step }));
    else if (e.key === 'ArrowDown') update((c) => ({ ...c, cy: c.cy + step }));
    else if (e.key === '+' || e.key === '=') update((c) => ({ ...c, zoom: c.zoom * 1.1 }));
    else if (e.key === '-') update((c) => ({ ...c, zoom: c.zoom / 1.1 }));
    else return;
    e.preventDefault();
  };

  const finalCrop = nat ? { ...crop, w: nat.w, h: nat.h } : null;

  const confirm = async () => {
    if (!nat) return;
    setBusy(true);
    try {
      const up = await uploadFile(file, setProgress);
      onDone({ url: up.url, crop: finalCrop });
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  const imgStyle = { width: `${wp * 100}%`, height: `${hp * 100}%`, left: `${50 - crop.cx * wp * 100}%`, top: `${50 - crop.cy * hp * 100}%` };

  return (
    <Modal onClose={busy ? undefined : onCancel} title={title} subtitle="Ziehen zum Verschieben · Mausrad oder zwei Finger zum Zoomen" width={aspect >= 2 ? 680 : 560} className="cropper-modal">
      <div
        className="cropper-stage"
        ref={stageRef}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {nat ? (
          <div className="cropper-frame" style={{ width: frameW, height: frameH }}>
            <img src={src} alt="" className="cropper-img" style={imgStyle} draggable={false} />
            <div className={`cropper-mask ${shape}`} />
            <div className="cropper-grid" />
          </div>
        ) : <Spinner size={32} />}
        <div className="cropper-hint"><Move size={14} /> Ziehen</div>
      </div>

      <div className="cropper-controls">
        <button type="button" className="icon-btn" onClick={() => update((c) => ({ ...c, zoom: c.zoom / 1.2 }))} aria-label="Herauszoomen"><ZoomOut size={18} /></button>
        <input
          type="range"
          className="slider"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          style={{ '--pct': `${((crop.zoom - 1) / (MAX_ZOOM - 1)) * 100}%` }}
          onChange={(e) => update((c) => ({ ...c, zoom: Number(e.target.value) }))}
        />
        <button type="button" className="icon-btn" onClick={() => update((c) => ({ ...c, zoom: c.zoom * 1.2 }))} aria-label="Hineinzoomen"><ZoomIn size={18} /></button>
        <span className="zoom-label">{Math.round(crop.zoom * 100)}%</span>
        <button type="button" className="icon-btn" onClick={() => setCrop({ cx: 0.5, cy: 0.5, zoom: 1 })} aria-label="Zurücksetzen" title="Zurücksetzen"><RotateCcw size={18} /></button>
      </div>

      {finalCrop && (
        <div className="cropper-preview">
          <span className="muted">Vorschau</span>
          {shape === 'circle' ? (
            <>
              <div className="pv-circle" style={{ width: 88, height: 88 }}><CroppedImage src={src} crop={finalCrop} aspect={1} /></div>
              <div className="pv-circle" style={{ width: 48, height: 48 }}><CroppedImage src={src} crop={finalCrop} aspect={1} /></div>
              <div className="pv-circle" style={{ width: 28, height: 28 }}><CroppedImage src={src} crop={finalCrop} aspect={1} /></div>
            </>
          ) : (
            <div className="pv-rect" style={{ width: 220, aspectRatio: String(aspect) }}><CroppedImage src={src} crop={finalCrop} aspect={aspect} /></div>
          )}
          {isGif && <span className="gif-note"><Sparkles size={14} /> Bleibt animiert</span>}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="btn primary" onClick={confirm} disabled={!nat || busy}>
          {busy ? <><Spinner size={16} /> {Math.round(progress * 100)}%</> : 'Übernehmen'}
        </button>
      </div>
    </Modal>
  );
}

/** Kleiner Helfer: Datei-Dialog öffnen und Datei liefern. */
export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
