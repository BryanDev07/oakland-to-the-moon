// Capture screenshots of scenes for visual QA: node scripts/validation/screens.mjs <url> <outdir> scene[:waitMs] ...
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url = 'http://localhost:5173', out = 'screenshots', ...shots] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__ottm && window.__ottm.scene().includes('Title'), null, { timeout: 30000 });
for (const spec of shots) {
  const [scene, wait = '1500', ...rest] = spec.split('@');
  const setup = rest.join('@');
  if (setup) await page.evaluate(setup);
  if (scene !== '-') await page.evaluate((k) => window.__ottm.goto(k), scene);
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: `${out}/${scene === '-' ? 'shot' : scene}-${Date.now() % 100000}.png` });
  console.log('shot', scene, await page.evaluate(() => window.__ottm.scene()));
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
