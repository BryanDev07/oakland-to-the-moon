import { expect, test, Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

type Hooks = { scene: () => string[]; store: { mission: { phase: string; pending: unknown } | null; history: { score: number; outcome: string }[] }; game: { loop: { actualFps: number } } };
const hooks = (p: Page) => p.evaluate(() => (window as unknown as { __ottm: Hooks }).__ottm.scene());
const phase = (p: Page) => p.evaluate(() => (window as unknown as { __ottm: Hooks }).__ottm.store.mission?.phase ?? null);

/** Convert game coordinates (480x270) to page coordinates. */
async function click(p: Page, gx: number, gy: number) {
  const box = (await p.locator('canvas').boundingBox())!;
  const s = box.width / 480;
  await p.mouse.click(box.x + gx * s, box.y + gy * s);
}
async function waitScene(p: Page, key: string, timeout = 30000) {
  await expect.poll(async () => (await hooks(p)).includes(key), { timeout, intervals: [200] }).toBe(true);
  await p.waitForTimeout(500); // fade-in
}
/** Press '1' to resolve any emergency modals while waiting for a condition. */
async function until(p: Page, cond: () => Promise<boolean>, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await cond()) return;
    const pending = await p.evaluate(() => !!(window as unknown as { __ottm: Hooks }).__ottm.store.mission?.pending);
    if (pending) { await p.keyboard.press('1'); }
    await p.waitForTimeout(250);
  }
  throw new Error('timeout waiting for condition');
}

test.describe('Oakland to the Moon', () => {
  test('boots, fits a 1366x768 laptop screen, and has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const t0 = Date.now();
    await page.goto('/');
    await waitScene(page, 'Title');
    const loadMs = Date.now() - t0;
    const box = (await page.locator('canvas').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(1366);
    expect(box.height).toBeLessThanOrEqual(768);
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
    await page.waitForTimeout(1500);
    const fps = await page.evaluate(() => (window as unknown as { __ottm: Hooks }).__ottm.game.loop.actualFps);
    console.log(`load-to-title ${loadMs} ms, fps ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(20);
    await page.screenshot({ path: `${SHOTS}/01-title.png` });
    expect(errors).toEqual([]);
  });

  test('complete mission: title → Oakland → hangar → launch → Moon → home → report', async ({ page }) => {
    test.setTimeout(420000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await waitScene(page, 'Title');
    await page.keyboard.press('Enter');
    // Chapter 1: Oakland
    await waitScene(page, 'Intro');
    await page.waitForTimeout(2600); // chapter card
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/02-oakland-intro.png` });
    await click(page, 27, 13); // SKIP
    // Briefing
    await waitScene(page, 'Briefing');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/03-mission-control-briefing.png` });
    await click(page, 27, 13);
    // Chapter 2: the build
    await waitScene(page, 'Hangar');
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${SHOTS}/04-hangar-baseline.png` });
    // baseline design is NO-GO; check the review blocks launch
    await page.keyboard.press('Enter');
    await waitScene(page, 'Review');
    await page.screenshot({ path: `${SHOTS}/05-design-review-nogo.png` });
    expect(await phase(page)).toBeNull();
    await click(page, 343, 255); // back to hangar
    await waitScene(page, 'Hangar');
    // Use the hint dialog to load the reference design, then pick a component by clicking
    await click(page, 455, 227); // HINT
    await page.waitForTimeout(300);
    await page.keyboard.press('2');
    await page.waitForTimeout(500);
    await click(page, 54, 19 + 13 * 13.6 + 6); // Science category
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/06-hangar-science.png` });
    await page.keyboard.press('Enter');
    await waitScene(page, 'Review');
    await page.screenshot({ path: `${SHOTS}/07-design-review-go.png` });
    await page.keyboard.press('Enter'); // launch poll
    // Chapter 3: launch
    await waitScene(page, 'Launch', 15000);
    await page.waitForTimeout(12500);
    await page.screenshot({ path: `${SHOTS}/08-launch.png` });
    await click(page, 432, 13); // skip to TLI vignette
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/09-tli.png` });
    // Chapter 4: journey
    await waitScene(page, 'Ops', 15000);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${SHOTS}/10-ops-transit.png` });
    await click(page, 272 + 3 * 26 + 12, 179); // 16x speed
    await until(page, async () => (await phase(page)) === 'LOI_PENDING');
    await page.waitForTimeout(800);
    await click(page, 246 + 75, 229); // EXECUTE LOI
    await until(page, async () => (await phase(page)) === 'LUNAR_ORBIT');
    await click(page, 246 + 28, 206); // instrument on (map cam)
    await click(page, 272 + 2 * 26 + 12, 179); // 4x
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/11-ops-lunar-orbit.png` });
    await until(page, async () => !(await page.evaluate(() => !!(window as unknown as { __ottm: Hooks }).__ottm.store.mission?.pending)), 10000);
    await click(page, 246 + 75, 229); // BEGIN DESCENT
    await page.waitForTimeout(400);
    await page.keyboard.press('1');
    // Chapter 5: landing
    await waitScene(page, 'Landing', 15000);
    await page.keyboard.press('2'); // autopilot
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SHOTS}/12-landing.png` });
    await until(page, async () => (await phase(page)) !== 'DESCENT', 90000);
    expect(await phase(page)).toBe('SURFACE');
    await page.waitForTimeout(2500);
    await page.keyboard.press('1'); // step outside
    await waitScene(page, 'Surface', 15000);
    await page.waitForTimeout(2500);
    await page.keyboard.press('Enter'); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(400); await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    for (let i = 0; i < 3; i++) { await click(page, 404, 17 + 11); await page.waitForTimeout(3500); }
    await click(page, 404, 17 + 2 * 23 + 11); await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOTS}/13-surface-eva.png` });
    await click(page, 405, 253); // LIFT OFF
    await page.waitForTimeout(400);
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    await page.keyboard.press('1'); // in case a jettison prompt appears
    // Chapter 6: return
    await waitScene(page, 'Ops', 20000);
    await until(page, async () => (await phase(page)) === 'LUNAR_ORBIT_POST', 10000);
    await page.waitForTimeout(1000);
    await click(page, 246 + 114, 229); // TEI
    await until(page, async () => (await phase(page)) === 'TRANSIT_BACK', 10000);
    await page.waitForTimeout(2600); // chapter card
    await click(page, 272 + 3 * 26 + 12, 179);
    await until(page, async () => (await hooks(page)).includes('Return'), 60000);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/14-reentry.png` });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${SHOTS}/15-splashdown-or-home.png` });
    await click(page, 432, 13); // skip to report
    // Chapter 7: report
    await waitScene(page, 'Report', 20000);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${SHOTS}/16-mission-report.png` });
    const hist = await page.evaluate(() => (window as unknown as { __ottm: Hooks }).__ottm.store.history);
    expect(hist.length).toBeGreaterThan(0);
    expect(hist[0].score).toBeGreaterThan(0);
    console.log('final', hist[0]);
    expect(errors).toEqual([]);
  });

  test('every scene can load standalone (save/continue robustness)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await waitScene(page, 'Title');
    await page.evaluate(() => { const o = (window as unknown as { __ottm: { debug: { useReferenceDesign(): void; newMission(n: number): void } } }).__ottm; o.debug.useReferenceDesign(); o.debug.newMission(5); });
    for (const k of ['Hangar', 'Review', 'Ops', 'Report', 'Title']) {
      await page.evaluate((key) => (window as unknown as { __ottm: { goto(k: string): void } }).__ottm.goto(key), k);
      await waitScene(page, k);
    }
    // corrupted save must not crash
    await page.evaluate(() => localStorage.setItem('ottm.mission.v1', '{"broken": tr'));
    await page.reload();
    await waitScene(page, 'Title');
    // overlay opens and closes
    await page.keyboard.press('Escape');
    await waitScene(page, 'Overlay');
    await page.screenshot({ path: `${SHOTS}/17-settings-overlay.png` });
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
});
