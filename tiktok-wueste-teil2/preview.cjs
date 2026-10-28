// node preview.cjs t1 t2 ... -> preview/f_<t>.png
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('console', m => console.log('[page]', m.type(), m.text()));
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:8124/index.html');
  await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  console.log('ready in', Date.now() - t0, 'ms');
  require('fs').mkdirSync('preview', { recursive: true });
  for (const t of process.argv.slice(2).map(Number)) {
    const s = Date.now();
    await p.evaluate(t => window.renderAt(t), t);
    const r = Date.now();
    await p.screenshot({ path: `preview/f_${t.toFixed(2)}.png` });
    console.log('t', t, 'render', r - s, 'ms, shot', Date.now() - r, 'ms');
  }
  if (process.env.DUMP) require('fs').writeFileSync('events.json', JSON.stringify(await p.evaluate(() => ({ events: window.EVENTS, cues: window.CUES })), null, 1));
  await b.close();
})();
