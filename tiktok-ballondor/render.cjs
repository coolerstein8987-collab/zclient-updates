// node render.cjs <worker> <workers> -> frames/%05d.jpg
const { chromium } = require('playwright');
const fs = require('fs');
const [idx, n] = process.argv.slice(2).map(Number);
(async () => {
  const tl = JSON.parse(fs.readFileSync('timeline.json'));
  const total = Math.ceil(tl.duration * 30);
  fs.mkdirSync('frames', { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto('http://127.0.0.1:8126/index.html?msaa=4');
  await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  const t0 = Date.now();
  for (let f = idx; f < total; f += n) {
    const out = `frames/${String(f).padStart(5, '0')}.jpg`;
    if (fs.existsSync(out)) continue;
    await p.evaluate(t => window.renderAt(t), f / 30);
    await p.screenshot({ path: out + '.tmp.jpg', type: 'jpeg', quality: 95 });
    fs.renameSync(out + '.tmp.jpg', out);
    if (f % 60 === idx) console.log(`w${idx} frame ${f}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  console.log(`w${idx} done`);
  await b.close();
})();
