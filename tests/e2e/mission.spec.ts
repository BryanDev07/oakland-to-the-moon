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
  await expect.poll(async () => (await hooks(p)).includes(key), { timeout, intervals: [200], message: `waiting for scene ${key} (current: ${(await hooks(p)).join(', ')})` }).toBe(true);
  await p.waitForTimeout(500); // fade-in
}
/** Surface: how many times an EVA activity has been done, and the surface science so far. */
const surface = (p: Page) => p.evaluate(() => { const m = (window as unknown as { __ottm: { store: { mission: { surface: { day: number; done: Record<string, number>; points: Record<string, number> } } | null } } }).__ottm.store.mission; return m ? { day: m.surface.day, done: m.surface.done, points: Object.values(m.surface.points).reduce((a, b) => a + b, 0) } : null; });
/** Click an EVA activity row and wait until the game has done it (the walk can take a few seconds). */
async function eva(p: Page, row: number, id: string) {
  const before = (await surface(p))!.done[id] ?? 0;
  const end = Date.now() + 20000;
  // Clicks are ignored while the scene is busy (dialogue, walking), so click again until it registers.
  while (((await surface(p))!.done[id] ?? 0) === before) {
    if (Date.now() > end) throw new Error(`EVA activity ${id} (row ${row}) never started`);
    await clearEmergencies(p);
    await click(p, 404, 17 + row * 23 + 11);
    await p.waitForTimeout(1500);
  }
  expect((await surface(p))!.done[id]).toBe(before + 1);
  await p.waitForTimeout(1600); // the scene stays busy 1.3 s after each activity
}
/** The Calculation Desk sits between the hangar and the review. */
async function throughDesk(p: Page) {
  // D3: the player's first role decision opens as the design heads to the desk; Enter takes option 1
  for (let i = 0; i < 30 && !(await hooks(p)).includes('Desk'); i++) { if (await emergencyOpen(p)) await p.keyboard.press('Enter'); await p.waitForTimeout(200); }
  await waitScene(p, 'Desk');
  // S skips a sheet (the desk reveals steps one at a time); on the results board Enter launches
  for (let i = 0; i < 16; i++) { await p.keyboard.press('s'); await p.waitForTimeout(150); }
  for (let i = 0; i < 10 && !(await hooks(p)).includes('Review'); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
}
/** True while an emergency window (or its mission-control result) is open. */
const emergencyOpen = (p: Page) => p.evaluate(() => (window as unknown as { __ottm: { emergencyOpen: () => boolean } }).__ottm.emergencyOpen());
/** Enter picks the highlighted option on a card and pages Mission Control's answer (A1 dialogue box). */
const answerKey = async (p: Page) => p.keyboard.press((await emergencyOpen(p)) ? 'Enter' : '1');
/** Answer any open emergency with option 1 (A), then dismiss the mission-control result. */
async function clearEmergencies(p: Page, timeout = 15000) {
  const end = Date.now() + timeout;
  while (await emergencyOpen(p)) { if (Date.now() > end) throw new Error('emergency window never closed'); await answerKey(p); await p.waitForTimeout(400); }
}
/** Wait for a scene, answering emergencies that open on the way. */
async function waitSceneClearing(p: Page, key: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!(await hooks(p)).includes(key)) { if (Date.now() > end) throw new Error(`timeout waiting for scene ${key}`); if (await emergencyOpen(p)) await answerKey(p); await p.waitForTimeout(250); }
  await p.waitForTimeout(500);
}
/**
 * Click a mission button until the phase changes. A seeded emergency can open right as the button
 * is clicked (the click then lands on the emergency); resolve it with '1' and click again.
 */
async function clickUntilPhase(p: Page, gx: number, gy: number, want: string, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await phase(p)) === want) return;
    const pending = await p.evaluate(() => !!(window as unknown as { __ottm: Hooks }).__ottm.store.mission?.pending);
    if (pending || (await emergencyOpen(p))) await answerKey(p); else await click(p, gx, gy);
    await p.waitForTimeout(1200);
  }
  throw new Error(`timeout waiting for phase ${want}`);
}
/** Press '1' to resolve any emergency modals while waiting for a condition. */
async function until(p: Page, cond: () => Promise<boolean>, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await cond()) return;
    const pending = await p.evaluate(() => !!(window as unknown as { __ottm: Hooks }).__ottm.store.mission?.pending);
    if (pending || (await emergencyOpen(p))) { await answerKey(p); }
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
    // A5: resizing the window re-fits the canvas without a reload (16:9, inside the window)
    for (const [w, h] of [[1024, 768], [1920, 1080], [1366, 600]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      const r = (await page.locator('canvas').boundingBox())!;
      expect(r.width).toBeLessThanOrEqual(w + 1); expect(r.height).toBeLessThanOrEqual(h + 1);
      expect(Math.min(w - r.width, h - r.height)).toBeLessThanOrEqual(2); // fills one dimension
      expect(Math.abs(r.width / r.height - 16 / 9)).toBeLessThan(0.02);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
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
    // Oakland: pick difficulty and specialty (defaults: Mission Commander, Easy)
    await waitScene(page, 'RoleSelect');
    await page.keyboard.press('Enter');
    // E1: then the mission (Moon Landing is the default)
    await waitScene(page, 'MissionSelect');
    await page.keyboard.press('Enter');
    // Chapter 2: the build
    await waitScene(page, 'Hangar');
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${SHOTS}/04-hangar-baseline.png` });
    // baseline design is NO-GO; check the review blocks launch
    await page.keyboard.press('Enter');
    await throughDesk(page);
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
    // Reproducible emergencies: seed 221 draws card 2 (launch), 5 (coast) and 11 (lunar orbit) on Easy
    await page.evaluate(() => (window as unknown as { __ottm: { debug: { forceSeed(n: number): void } } }).__ottm.debug.forceSeed(221));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/06-hangar-science.png` });
    await page.keyboard.press('Enter');
    await throughDesk(page);
    await waitScene(page, 'Review');
    await page.screenshot({ path: `${SHOTS}/07-design-review-go.png` });
    await page.keyboard.press('Enter'); // launch poll
    // Chapter 3: launch
    await waitScene(page, 'Launch', 15000);
    await page.waitForTimeout(12500);
    await page.screenshot({ path: `${SHOTS}/08-launch.png` });
    await clearEmergencies(page);
    await click(page, 432, 13); // skip to TLI vignette
    await clearEmergencies(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/09-tli.png` });
    // Chapter 4: journey
    await waitSceneClearing(page, 'Ops', 30000);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${SHOTS}/10-ops-transit.png` });
    await click(page, 272 + 3 * 26 + 12, 179); // 16x speed
    await until(page, async () => (await phase(page)) === 'LOI_PENDING');
    await page.waitForTimeout(800);
    await clickUntilPhase(page, 246 + 75, 229, 'LUNAR_ORBIT'); // EXECUTE LOI
    await click(page, 246 + 28, 206); // instrument on (map cam)
    await click(page, 272 + 2 * 26 + 12, 179); // 4x
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/11-ops-lunar-orbit.png` });
    // BEGIN DESCENT, then confirm with '1'. An emergency (or its result window) may be open: answer it first.
    for (let tries = 0; (await phase(page)) !== 'DESCENT'; tries++) {
      if (tries > 15) throw new Error('could not begin the descent');
      await until(page, async () => !(await page.evaluate(() => !!(window as unknown as { __ottm: Hooks }).__ottm.store.mission?.pending)), 10000);
      await clearEmergencies(page);
      await click(page, 246 + 75, 229); // BEGIN DESCENT
      await page.waitForTimeout(400);
      if (await emergencyOpen(page)) continue; // a card opened instead of the descent dialog
      await page.keyboard.press('1');
      await page.waitForTimeout(800);
    }
    // Chapter 5: landing
    await waitSceneClearing(page, 'Landing', 15000);
    await clearEmergencies(page);
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
    // Enough EVA work for a full success (50+ science). Activity rows: 0 plaque, 1 broadcast,
    // 2 seismometer, 3 samples, 4 HD cameras. Day 1 has 6 EVA hours (balanced tempo).
    await eva(page, 0, 'plaque'); await eva(page, 1, 'broadcast'); await eva(page, 2, 'seismo');
    await eva(page, 3, 'samples'); await eva(page, 3, 'samples');
    await click(page, 405, 230); // REST ▶ NEXT DAY
    await expect.poll(async () => (await surface(page))!.day, { timeout: 10000, intervals: [200] }).toBe(2);
    await page.waitForTimeout(1200);
    await eva(page, 3, 'samples'); await eva(page, 3, 'samples'); await eva(page, 4, 'pancam');
    expect((await surface(page))!.points).toBeGreaterThanOrEqual(50);
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
    await clickUntilPhase(page, 246 + 114, 229, 'TRANSIT_BACK'); // TEI
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
    expect(hist[0].outcome).toBe('FULL MISSION SUCCESS');
    expect(hist[0].seed).toBe(221);
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

  test('no text runs past the screen or is cut off (hangar, desk, coast, landing)', async ({ page }) => {
    type O = { __ottm: { textOverflow(): string[]; goto(k: string, d?: object): void; debug: { useReferenceDesign(): void; newMission(n: number): void; advanceTo(p: string): void }; store: { markSeen(k: string): void }; game: { scene: { getScene(k: string): { catRows?: { cat: string }[]; selectCat?(c: string): void } } } } };
    const over = () => page.evaluate(() => (window as unknown as O).__ottm.textOverflow());
    const found: string[] = [];
    const check = async () => { for (const b of await over()) if (!found.includes(b)) found.push(b); };
    await page.goto('/');
    await waitScene(page, 'Title');
    await page.evaluate(() => { const o = (window as unknown as O).__ottm; o.debug.useReferenceDesign(); for (let i = 1; i < 9; i++) o.store.markSeen('chap' + i); o.goto('Hangar'); });
    await waitScene(page, 'Hangar');
    const cats = await page.evaluate(() => (window as unknown as O).__ottm.game.scene.getScene('Hangar').catRows!.map((r) => r.cat));
    for (const c of cats) { await page.evaluate((c) => (window as unknown as O).__ottm.game.scene.getScene('Hangar').selectCat!(c), c); await page.waitForTimeout(120); await check(); }
    await page.evaluate(() => (window as unknown as O).__ottm.goto('Desk'));
    await waitScene(page, 'Desk');
    for (let sheet = 0; sheet < 15; sheet++) {
      for (let k = 0; k < 6; k++) { await page.keyboard.press('Enter'); await page.waitForTimeout(40); await check(); }
      await page.keyboard.press('s'); await page.waitForTimeout(80);
    }
    for (let k = 0; k < 6; k++) { await check(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80); }
    await page.evaluate(() => { const o = (window as unknown as O).__ottm; o.debug.newMission(221); o.goto('Ops'); });
    await waitScene(page, 'Ops');
    for (let i = 0; i < 6; i++) { await check(); await page.waitForTimeout(400); }
    await page.evaluate(() => { const o = (window as unknown as O).__ottm; o.debug.newMission(221); o.debug.advanceTo('DESCENT'); o.goto('Landing'); });
    await waitScene(page, 'Landing');
    for (let i = 0; i < 4; i++) { await check(); await page.waitForTimeout(500); }
    expect(found).toEqual([]);
  });

  test('ISS mission: launch, catch up, dock, spacewalk, home; never the Moon scenes', async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    type O = { __ottm: { sceneLog: string[]; debug: { useReferenceDesign(): void; forceSeed(n: number): void }; store: { markSeen(k: string): void; mission: { iss?: { docked: boolean; panelFixed: boolean } } | null; history: { outcome: string }[] }; goto(k: string): void; game: { scene: { getScene(k: string): { speed?: number; setSpeed?(n: number): void; sys: { isActive(): boolean } } } } } };
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await waitScene(page, 'Title');
    await page.evaluate(() => { const o = (window as unknown as O).__ottm; o.debug.useReferenceDesign(); for (let i = 1; i < 9; i++) o.store.markSeen('chap' + i); o.store.markSeen('reviewCard'); o.goto('RoleSelect'); });
    await waitScene(page, 'RoleSelect');
    await page.keyboard.press('Enter'); // Mission Commander, Easy
    await waitScene(page, 'MissionSelect');
    await page.keyboard.press('2'); // ISS Rescue: Dock & Spacewalk
    await page.keyboard.press('Enter');
    await waitScene(page, 'Hangar');
    await page.waitForTimeout(800);
    await click(page, 455, 227); // HINT: load the reference design (keeps the ISS mission)
    await page.waitForTimeout(300);
    await page.keyboard.press('2');
    await page.waitForTimeout(400);
    // keyboard: Down twice to the Capsule tab, Right to switch Apollo -> Budget LEO capsule
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as unknown as O).__ottm.debug.forceSeed(221));
    await page.keyboard.press('Enter');
    // role cards on the way: '2' keeps the money on parts
    for (let i = 0; i < 30 && !(await hooks(page)).includes('Desk'); i++) { if (await emergencyOpen(page)) await page.keyboard.press('2'); await page.waitForTimeout(200); }
    await waitScene(page, 'Desk');
    for (let i = 0; i < 8; i++) { await page.keyboard.press('s'); await page.waitForTimeout(120); }
    for (let i = 0; i < 12 && !(await hooks(page)).includes('Review'); i++) { if (await emergencyOpen(page)) await page.keyboard.press('1'); else await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    await waitScene(page, 'Review');
    await page.keyboard.press('Enter'); // launch poll
    await waitSceneClearing(page, 'Launch', 20000);
    // through launch and the 1-day phasing coast, answering cards, fast-forwarding
    const end = Date.now() + 4 * 60 * 1000;
    while (!(await hooks(page)).includes('Docking')) {
      if (Date.now() > end) throw new Error(`never reached Docking (at ${(await hooks(page)).join(',')})`);
      if (await emergencyOpen(page)) await answerKey(page);
      else await page.evaluate(() => { const sc = (window as unknown as O).__ottm.game.scene.getScene('Ops'); if (sc?.sys.isActive() && sc.speed !== 3) sc.setSpeed!(3); });
      if ((await hooks(page)).includes('Report')) throw new Error('mission ended before docking');
      await page.waitForTimeout(400);
    }
    await waitScene(page, 'Docking');
    await page.keyboard.press('a'); await page.keyboard.press('4'); // autopilot at 4x
    await waitSceneClearing(page, 'Spacewalk', 120000);
    await page.waitForTimeout(800);
    // prep: Enter goes outside; outside: Enter = careful moves and the tasks
    const end2 = Date.now() + 2 * 60 * 1000;
    while ((await hooks(page)).includes('Spacewalk')) {
      if (Date.now() > end2) throw new Error('spacewalk never finished');
      if (await emergencyOpen(page)) await answerKey(page); else await page.keyboard.press('Enter');
      await page.waitForTimeout(250);
    }
    for (let i = 0; i < 80 && !(await hooks(page)).includes('Report'); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    await waitScene(page, 'Report');
    const info = await page.evaluate(() => { const o = (window as unknown as O).__ottm; return { log: o.sceneLog, iss: o.store.mission?.iss, outcome: o.store.history[0]?.outcome }; });
    console.log('iss run', JSON.stringify(info));
    expect(info.log).not.toContain('Landing');
    expect(info.log).not.toContain('Surface');
    expect(info.log).toEqual(expect.arrayContaining(['Docking', 'Spacewalk']));
    expect(info.iss?.docked).toBe(true);
    expect(info.outcome).toMatch(/^ISS: /);
    expect(errors).toEqual([]);
  });
});
