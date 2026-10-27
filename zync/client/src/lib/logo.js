// Zync-Logo als SVG-String – wird für Favicon, App-Icon-Varianten und die UI genutzt.
export const LOGO_VARIANTS = {
  aurora: { name: 'Aurora', stops: ['#8b5cf6', '#06b6d4'] },
  sunset: { name: 'Sunset', stops: ['#ff5f6d', '#ffc371'] },
  sakura: { name: 'Sakura', stops: ['#f472b6', '#fb7185', '#fda4af'] },
  neon: { name: 'Neon', stops: ['#00f5a0', '#00d9f5'] },
  holo: { name: 'Holo', stops: ['#ff6ec4', '#7873f5', '#4ade80'] },
  retro: { name: 'Retro', stops: ['#ff00cc', '#333399'] },
  gold: { name: 'Gold', stops: ['#fbbf24', '#b45309'] },
  ocean: { name: 'Ozean', stops: ['#0ea5e9', '#1e3a8a'] },
  midnight: { name: 'Midnight', stops: ['#1e1b4b', '#0f172a'], stroke: ['#a78bfa', '#22d3ee'] },
  mono: { name: 'Mono', stops: ['#27272a', '#09090b'] },
  light: { name: 'Hell', stops: ['#ffffff', '#e2e8f0'], stroke: ['#7c3aed', '#0891b2'] },
};

export function logoSvg(variant = 'aurora', { size = 512 } = {}) {
  const v = LOGO_VARIANTS[variant] || LOGO_VARIANTS.aurora;
  const id = `z${variant}`;
  const stops = v.stops.map((c, i) => `<stop offset="${i / (v.stops.length - 1)}" stop-color="${c}"/>`).join('');
  const stroke = v.stroke
    ? `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1">${v.stroke.map((c, i) => `<stop offset="${i}" stop-color="${c}"/>`).join('')}</linearGradient>`
    : '';
  const zStroke = v.stroke ? `url(#${id}s)` : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
<radialGradient id="${id}h" cx="0.25" cy="0.15" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
${stroke}
</defs>
<rect width="512" height="512" rx="128" fill="url(#${id}g)"/>
<rect width="512" height="512" rx="128" fill="url(#${id}h)"/>
<ellipse cx="256" cy="262" rx="196" ry="74" fill="none" stroke="${zStroke}" stroke-opacity=".28" stroke-width="14" transform="rotate(-24 256 262)"/>
<polyline points="160,166 352,166 166,350 356,350" fill="none" stroke="${zStroke}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="404" cy="116" r="28" fill="${zStroke}"/>
</svg>`;
}

export function logoDataUrl(variant) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(variant))}`;
}

/** Logo als PNG (z. B. für das Fenster-Icon der Desktop-App). */
export function logoPng(variant, size = 256) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = logoDataUrl(variant);
  });
}
