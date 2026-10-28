// Renders the channel profile picture: globe + glowing map pin -> out/profilbild.png
const { chromium } = require('playwright');
(async () => {
  const rig = { lat: 33, lon: 19, dist: 5.1, near: 0.05 };
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto('http://127.0.0.1:8123/index.html?msaa=4&rig=' + encodeURIComponent(JSON.stringify(rig)));
  await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  const tip = await p.evaluate(() => { window.renderAt(28.3); window.renderAt(28.3); const s = window.projectLL(50.5, 10); return { x: s.x, y: s.y }; });
  await p.evaluate(tip => {
    document.getElementById('ui').style.display = 'none';
    const pin = document.createElement('div');
    pin.innerHTML = `<svg width="250" height="330" viewBox="0 0 100 132">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7d9a"/><stop offset=".55" stop-color="#ff2e63"/><stop offset="1" stop-color="#b30d3c"/></linearGradient>
      <radialGradient id="h" cx=".35" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <path d="M50 130 C42 112 6 80 6 46 A44 44 0 1 1 94 46 C94 80 58 112 50 130 Z" fill="url(#g)" stroke="#fff" stroke-width="3.5"/>
      <path d="M50 130 C42 112 6 80 6 46 A44 44 0 1 1 94 46 C94 80 58 112 50 130 Z" fill="url(#h)"/>
      <circle cx="50" cy="46" r="17" fill="#fff"/><circle cx="50" cy="46" r="8" fill="#ff2e63"/></svg>`;
    Object.assign(pin.style, { position: 'absolute', left: (tip.x - 125) + 'px', top: (tip.y - 327) + 'px',
      filter: 'drop-shadow(0 0 28px rgba(255,46,99,.85)) drop-shadow(0 18px 18px rgba(0,0,0,.55))' });
    const glow = document.createElement('div');
    Object.assign(glow.style, { position: 'absolute', left: (tip.x - 70) + 'px', top: (tip.y - 22) + 'px', width: '140px', height: '44px', borderRadius: '50%',
      background: 'radial-gradient(closest-side, rgba(255,90,130,.9), rgba(255,46,99,0))' });
    document.body.append(glow, pin);
  }, tip);
  await p.screenshot({ path: 'out/profilbild_raw.png', clip: { x: 0, y: 420, width: 1080, height: 1080 } });
  console.log('tip', tip);
  await b.close();
})();
