// node render_range.cjs <from> <to> <outdir> <query> -> renders frames [from, to) with extra URL query
const { chromium } = require('playwright');
const fs = require('fs');
const [from, to] = process.argv.slice(2, 4).map(Number), out = process.argv[4], q = process.argv[5] || '';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto('http://127.0.0.1:8123/index.html?msaa=4&' + q);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  for (let f = from; f < to; f++) {
    await p.evaluate(t => window.renderAt(t), f / 30);
    await p.screenshot({ path: `${out}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 });
  }
  console.log('done', from, to);
  await b.close();
})();
