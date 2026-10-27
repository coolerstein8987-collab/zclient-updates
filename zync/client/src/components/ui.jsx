import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../lib/format.js';

export function Modal({ onClose, children, className, title, subtitle, width = 480, footer, bare = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('modal', bare && 'modal-bare', className)} style={{ maxWidth: width }} role="dialog" aria-modal="true">
        {!bare && (title || onClose) && (
          <div className="modal-head">
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen"><X size={20} /></button>}
          </div>
        )}
        <div className={bare ? '' : 'modal-body'}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Switch({ checked, onChange, label, desc, disabled }) {
  return (
    <label className={cx('row-setting', disabled && 'disabled')}>
      <div className="row-text">
        <div className="row-label">{label}</div>
        {desc && <div className="row-desc">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        className={cx('switch', checked && 'on')}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}

export function Slider({ label, desc, value, min = 0, max = 100, step = 1, onChange, format = (v) => v, marks }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-setting">
      {label && (
        <div className="slider-head">
          <div>
            <div className="row-label">{label}</div>
            {desc && <div className="row-desc">{desc}</div>}
          </div>
          <span className="slider-value">{format(value)}</span>
        </div>
      )}
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks && <div className="slider-marks">{marks.map((m) => <span key={m}>{format(m)}</span>)}</div>}
    </div>
  );
}

export function Segmented({ value, options, onChange, size }) {
  return (
    <div className={cx('segmented', size === 'sm' && 'sm')} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cx(value === o.value && 'active')} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, options, onChange, label }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Field({ label, hint, children, error }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Section({ title, desc, children }) {
  return (
    <section className="settings-section">
      {title && <h3>{title}</h3>}
      {desc && <p className="section-desc">{desc}</p>}
      {children}
    </section>
  );
}

export function Spinner({ size = 20 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(e); };
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn); };
  }, [ref, onOutside, active]);
}

/** Positioniert ein schwebendes Element am Anker und hält es im Viewport. */
export function useFloating(anchor, { width = 300, height = 400, side = 'right', gap = 10 } = {}) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const w = el?.offsetWidth || width;
    const h = el?.offsetHeight || height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!anchor) { setPos({ left: (vw - w) / 2, top: Math.max(12, (vh - h) / 2) }); return; }
    let left = side === 'right' ? anchor.x + anchor.w + gap : side === 'left' ? anchor.x - w - gap : anchor.x;
    let top = side === 'top' ? anchor.y - h - gap : side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y;
    if (left + w > vw - 12) left = anchor.x - w - gap;
    if (left < 12) left = Math.min(vw - w - 12, Math.max(12, anchor.x));
    if (top + h > vh - 12) top = vh - h - 12;
    if (top < 12) top = 12;
    setPos({ left, top });
  }, [anchor, width, height, side, gap]);
  return [ref, pos];
}

/** Leichter 3D-Tilt-Effekt (Maus folgt). */
export function useTilt(strength = 10, enabled = true) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || window.matchMedia('(hover: none)').matches) return undefined;
    let raf = 0;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength).toFixed(2)}deg) translateZ(0)`;
        el.style.setProperty('--glare-x', `${(x + 0.5) * 100}%`);
        el.style.setProperty('--glare-y', `${(y + 0.5) * 100}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
      cancelAnimationFrame(raf);
    };
  }, [strength, enabled]);
  return ref;
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}
