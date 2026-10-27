import { useEffect, useRef } from 'react';
import { useSettings } from '../lib/settings.js';

/** 3D-Sternenfeld/Partikel mit Mausparallaxe (Canvas). */
function Particles({ intensity, parallax, accent, accent2 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const count = Math.round(120 + intensity * 260);
    const pts = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onMove = (e) => {
      if (!parallax) return;
      mouse.tx = (e.clientX / w - 0.5) * 0.3;
      mouse.ty = (e.clientY / h - 0.5) * 0.3;
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    const colors = [accent, accent2, '#ffffff'];
    const frame = () => {
      if (document.hidden) { raf = requestAnimationFrame(frame); return; }
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      ctx.clearRect(0, 0, w, h);
      const cxp = w / 2;
      const cyp = h / 2;
      const fov = Math.max(w, h) * 0.6;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.z -= 0.0012;
        if (p.z <= 0.02) { p.z = 1; p.x = (Math.random() - 0.5) * 2; p.y = (Math.random() - 0.5) * 2; }
        const sx = cxp + ((p.x - mouse.x * (1 - p.z)) / p.z) * fov * 0.5;
        const sy = cyp + ((p.y - mouse.y * (1 - p.z)) / p.z) * fov * 0.5;
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        const r = Math.max(0.3, (1 - p.z) * 2.6);
        ctx.globalAlpha = Math.min(1, (1 - p.z) * 1.4) * 0.9;
        ctx.fillStyle = colors[i % 3];
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, [intensity, parallax, accent, accent2]);
  return <canvas ref={ref} className="bg-canvas" />;
}

/** Sanfte Wellen (Canvas). */
function Waves({ intensity, accent, accent2 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let t = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const frame = () => {
      if (!document.hidden) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
        t += 0.006;
        const layers = 5;
        for (let l = 0; l < layers; l++) {
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, accent);
          grad.addColorStop(1, accent2);
          ctx.globalAlpha = (0.05 + intensity * 0.12) * (1 - l / layers);
          ctx.fillStyle = grad;
          ctx.beginPath();
          const base = h * (0.55 + l * 0.08);
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 12) {
            const y = base + Math.sin(x * 0.004 + t * (1 + l * 0.3) + l) * (30 + l * 12) + Math.sin(x * 0.011 - t * 1.7) * 14;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [intensity, accent, accent2]);
  return <canvas ref={ref} className="bg-canvas" />;
}

export function Background() {
  const { background, bgIntensity, parallax, accent, accent2, animations, gradientAccent } = useSettings();
  const ref = useRef(null);
  useEffect(() => {
    if (!parallax || background === 'none' || background === 'particles') return undefined;
    const el = ref.current;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el?.style.setProperty('--px', x.toFixed(3));
        el?.style.setProperty('--py', y.toFixed(3));
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, [parallax, background]);
  if (background === 'none') return <div className="app-bg plain" />;
  const intensity = bgIntensity / 100;
  const a2 = gradientAccent ? accent2 : accent;
  const still = animations === 'off';
  return (
    <div ref={ref} className={`app-bg bg-${background} ${still ? 'still' : ''}`} aria-hidden>
      {background === 'aurora' && <div className="aurora"><i /><i /><i /><i /></div>}
      {background === 'orbs' && <div className="orbs">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>}
      {background === 'grid' && <div className="retro"><div className="retro-sun" /><div className="retro-grid" /></div>}
      {background === 'particles' && !still && <Particles intensity={intensity} parallax={parallax} accent={accent} accent2={a2} />}
      {background === 'waves' && !still && <Waves intensity={intensity} accent={accent} accent2={a2} />}
      <div className="bg-vignette" />
    </div>
  );
}
