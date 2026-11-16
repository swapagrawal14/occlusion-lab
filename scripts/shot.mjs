// Screenshot harness: serves dist/ and captures states with Playwright (chromium + SwiftShader WebGL).
// Usage: node scripts/shot.mjs [name]   (after npm run build). Each shot has its own timeout; a failing shot is
// logged and skipped so the rest still run. Long runs: nohup node scripts/shot.mjs > shots/log.txt 2>&1 &
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pwPath = process.env.PLAYWRIGHT_MODULE || '/workspace/work/rpd-studio/node_modules/playwright/index.mjs';
const { chromium } = await import(pwPath);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist'), outDir = path.join(root, 'shots');
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(data); });
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const only = process.argv[2];
const jobs = [
  { name: 'centric', w: 1400, h: 860, steps: [`__ol.go('centric')`] },
  { name: 'right-lateral', w: 1400, h: 860, steps: [`__ol.go('right')`, `__ol.tab('contacts')`] },
  { name: 'right-lateral-marks', w: 1400, h: 860, steps: [`__ol.clearMarks()`, `for (let i=0;i<=14;i++) __ol.pose({lat:-3.5*i/14,p:0})`, `__ol.view('marks')`, `__ol.tab('contacts')`] },
  { name: 'right-lateral-move', w: 1400, h: 860, steps: [`__ol.clearTrace()`, `for (let i=0;i<=12;i++) __ol.pose({lat:-3.5*i/12,p:0})`, `for (let i=12;i>=0;i--) __ol.pose({lat:-3.5*i/12,p:0})`, `for (let i=0;i<=12;i++) __ol.pose({lat:3.5*i/12,p:0})`, `for (let i=12;i>=0;i--) __ol.pose({lat:3.5*i/12,p:0})`, `for (let i=0;i<=12;i++) __ol.pose({lat:0,p:3*i/12})`, `__ol.pose({lat:-3.5,p:0})`, `__ol.view('right')`] },
  { name: 'flat-table', w: 1400, h: 860, steps: [`document.querySelector('[data-preset="flat"]').click()`, `__ol.go('right')`, `__ol.tab('contacts')`] },
  { name: 'phone', w: 390, h: 844, mobile: true, steps: [`__ol.go('right')`] },
  { name: 'phone-contacts', w: 390, h: 844, mobile: true, steps: [`__ol.go('right')`, `__ol.tab('contacts')`, `document.querySelector('.pane.on')?.scrollIntoView({block:'start'})`] },
  { name: 'phone-marks', w: 390, h: 844, mobile: true, steps: [`__ol.clearMarks()`, `for (let i=0;i<=14;i++) __ol.pose({lat:-3.5*i/14,p:0})`, `__ol.view('marks')`] },
];
const SHOT_MS = +(process.env.SHOT_MS || 90000);
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${what}`)), ms))]);
async function runJob(job) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: job.mobile ? 2 : 1, isMobile: !!job.mobile, hasTouch: !!job.mobile });
  page.setDefaultTimeout(SHOT_MS);
  page.on('pageerror', (e) => console.log('PAGEERROR', job.name, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', job.name, m.text()); });
  try {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url);
    await page.waitForFunction(() => !!window.__ol, null, { timeout: SHOT_MS });
    for (const s of job.steps) await page.evaluate(s);
    await page.waitForTimeout(1500);
    const sum = await page.evaluate(() => window.__ol.summary());
    console.log(job.name, JSON.stringify({ title: sum.title, rules: sum.rules, lower: sum.lowerContacts, upper: sum.upperContacts }));
    await page.screenshot({ path: path.join(outDir, `${job.name}.png`), timeout: SHOT_MS });
  } finally { await page.close().catch(() => {}); }
}
for (const job of jobs) {
  if (only && job.name !== only) continue;
  const t0 = Date.now();
  try { await withTimeout(runJob(job), SHOT_MS + 15000, job.name); console.log('OK', job.name, `${Date.now() - t0}ms`); }
  catch (e) { console.log('FAIL', job.name, e.message); }
}
await browser.close();
server.close();
