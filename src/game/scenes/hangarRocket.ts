/**
 * C1: the hangar's Rocket tab. Stage 1 and stage 2 (engine + count, fuel locked to the engine, tank
 * material with its risk and fix checkbox, fuel amount slider), boosters (type + count), presets as
 * "start from" buttons, and a live readout that turns green or red. Pure helpers: rocketEditor.ts.
 */
import Phaser from 'phaser';
import { store } from '../../state/store';
import { audio } from '../audio/audio';
import { Button, C, pagedText, toast, Tooltip, txt } from '../ui/ui';
import type { Design } from '../../data/mission';
import { BOOSTER_BY_ID, ENGINE_BY_ID, FIXES, MATERIALS, ROCKET_PRESETS } from '../../data/specParts';
import {
  boosterIds, buildOf, enginesFor, fixesOf, FUEL_RANGE, fuelChoices, materialIds, MAX_ENGINES, PresetId, presetBuild, rocketReadout, RUNDOWN,
  setBoosters, setCount, setEngine, setFuel, setMaterial, stageOf, StageNo, stageRisks,
} from '../../simulation/rocketEditor';
import { specOf } from '../../simulation/specModel';
import { fmt, fmtUsd } from '../../simulation/units';

/** What the tab needs from the hangar scene. */
export interface RocketHost extends Phaser.Scene {
  right: Phaser.GameObjects.Container;
  detail: Phaser.GameObjects.Container;
  design: Design;
  rocketSection: 'stage1' | 'stage2' | 'boosters';
  change(mut: (d: Design) => void, partId?: string): void;
  renderRight(): void;
}

const X0 = 326, W0 = 148;
const ok = (b: boolean) => (b ? C.green : C.red);
/** D2: pass/fail with an icon as well as colour (colour-blind players). */
const mark = (b: boolean) => (store.settings.statusIcons ? (b ? '✓ ' : '× ') : '');

export function renderRocketTab(h: RocketHost) {
  const R = h.right;
  const b = buildOf(h.design);
  const fixes = fixesOf(h.design);
  const apply = (nb: typeof b, note?: string | null, extraFix?: (d: Design) => void) => {
    h.change((d) => { d.spec = { ...specOf(d), rocket: nb }; extraFix?.(d); });
    if (note) toast(h, 'Propulsion', note, 'portrait_capcom', 3500);
  };
  const info = (text: string) => {
    h.detail.removeAll(true);
    h.detail.add(h.add.rectangle(X0, 155, W0, 1, C.gold, 0.6).setOrigin(0, 0));
    h.detail.add(pagedText(h, X0 + 2, 158, W0 - 4, 30, text, { color: C.white }));
    readout();
  };
  /** Long rundowns (two sentences) show as a tooltip beside the panel. */
  const rundownTip = (o: Phaser.GameObjects.GameObject, text: string) => {
    o.on('pointerover', () => Tooltip.show(h, text, { x: 30, y: 40, abs: true }));
    o.on('pointerout', () => Tooltip.hide());
  };
  const btn = (x: number, y: number, w: number, label: string, cb: () => void, sel = false, tip?: string) => {
    const bt = new Button(h, x, y, label, () => { audio.sfx('select'); cb(); }, { w, h: 12 });
    bt.setSelected(sel);
    if (tip) rundownTip(bt.bg, tip);
    R.add(bt);
    return bt;
  };
  const label = (x: number, y: number, s: string, color: number = C.dim) => { const t = txt(h, x, y, s, { color }); R.add(t); return t; };
  const cycle = (y: number, name: string, prev: () => void, next: () => void, tip: string) => {
    btn(X0, y, 14, '<', prev, false, tip);
    const t = label(X0 + W0 / 2, y + 2, name, C.gold2); t.setOrigin(0.5, 0);
    btn(X0 + W0 - 14, y, 14, '>', next, false, tip);
  };
  const stepper = (y: number, text: string, minus: () => void, plus: () => void) => {
    label(X0, y + 2, text, C.text);
    btn(X0 + W0 - 32, y, 15, '-', minus);
    btn(X0 + W0 - 15, y, 15, '+', plus);
  };
  function readout() {
    const r = rocketReadout(h.design);
    const line = (y: number, a: string, ca: number, bText: string, cb: number) => {
      h.detail.add(txt(h, X0 + 2, y, a, { color: ca }));
      h.detail.add(txt(h, X0 + W0 - 2, y, bText, { color: cb, align: 'right' }));
    };
    line(190, `${fmt(r.liftoffLb)} lb`, C.text, `${mark(r.twrOk)}TWR ${r.twr.toFixed(2)}`, ok(r.twrOk));
    line(201, `${mark(r.upperOk)}S2 ${r.upper.toFixed(2)}`, ok(r.upperOk), `${mark(r.dvOk)}${fmt(r.dv)} m/s`, ok(r.dvOk));
  }

  R.add(txt(h, 400, 7, 'ROCKET', { align: 'center', color: C.gold }));
  // presets fill the tab; the player can then change any part
  (Object.keys(ROCKET_PRESETS) as PresetId[]).forEach((id, i) => {
    const name = ROCKET_PRESETS[id].name.split(' ')[0].toUpperCase().slice(0, 7);
    btn(X0 + i * 50, 17, 48, name, () => apply(presetBuild(id), null, (d) => { d.plan.lv = id; }), b.name === ROCKET_PRESETS[id].name, `Start from the ${ROCKET_PRESETS[id].name} preset, then change any part.`);
  });
  const secs: [RocketHost['rocketSection'], string][] = [['stage1', 'STAGE 1'], ['stage2', 'STAGE 2'], ['boosters', 'BOOSTERS']];
  secs.forEach(([id, l], i) => btn(X0 + i * 50, 31, 48, l, () => { h.rocketSection = id; h.renderRight(); }, h.rocketSection === id));

  if (h.rocketSection === 'boosters') {
    const id = b.booster;
    const bs = id ? BOOSTER_BY_ID[id] : null;
    const i = boosterIds.indexOf(id);
    label(X0, 47, 'BOOSTERS');
    cycle(56, bs ? bs.name.replace(' booster', '') : 'None',
      () => apply(setBoosters(b, boosterIds[(i + boosterIds.length - 1) % boosterIds.length], b.boosterCount || 2)),
      () => apply(setBoosters(b, boosterIds[(i + 1) % boosterIds.length], b.boosterCount || 2)), RUNDOWN.booster);
    if (bs) {
      label(X0, 70, `${fmt(bs.weightLb.v)} lb each`, C.blue);
      label(X0, 80, `${fmt(bs.fuelLb.v)} lb fuel inside`, C.blue);
      label(X0, 90, `${fmt(bs.thrustN.v)} N, ${fmt(bs.veMs.v)} m/s`, C.blue);
      label(X0, 100, `${fmtUsd(bs.priceUsd.v)} each`, C.blue);
      stepper(113, `COUNT ${b.boosterCount} (max ${bs.max})`, () => apply(setBoosters(b, id, b.boosterCount - 1)), () => apply(setBoosters(b, id, b.boosterCount + 1)));
    } else label(X0, 72, 'No boosters: stage 1 lifts alone.', C.text);
    info('Hover the arrows for what boosters do.');
    return;
  }

  const n: StageNo = h.rocketSection === 'stage1' ? 1 : 2;
  const st = stageOf(b, n);
  const e = ENGINE_BY_ID[st.engine];
  const list = enginesFor(n);
  const ei = list.findIndex((x) => x.id === st.engine);
  const pick = (k: number) => { const r = setEngine(b, n, list[(k + list.length) % list.length].id); apply(r.build, r.note); };
  label(X0, 46, 'ENGINE');
  cycle(55, e.name.split(' (')[0], () => pick(ei - 1), () => pick(ei + 1), `${RUNDOWN.engine}${e.note ? ` ${e.note}` : ''}`);
  label(X0, 69, `${fmt(e.weightLb.v)} lb, ${fmt(e.thrustN.v)} N`, C.blue);
  label(X0, 79, `${fmt(e.veMs.v)} m/s, ${fmtUsd(e.priceUsd.v)}`, C.blue);
  stepper(91, `ENGINES ${st.count} (max ${MAX_ENGINES[n]})`, () => apply(setCount(b, n, st.count - 1)), () => apply(setCount(b, n, st.count + 1)));
  // fuel: locked to the engine (the others greyed, with the reason)
  fuelChoices(st.engine).forEach((f, k) => {
    const lbl = f.fuel === 'kerolox' ? 'KERO' : f.fuel === 'methalox' ? 'METH' : f.fuel === 'hydrolox' ? 'H2' : 'SOLID';
    const fb = new Button(h, X0 + k * 37, 105, lbl, () => { if (!f.allowed) { audio.sfx('error'); info(f.reason); } }, { w: 36, h: 12 });
    fb.setSelected(f.allowed);
    if (!f.allowed) fb.setDisabled(true);
    fb.bg.on('pointerover', () => { info(f.reason); Tooltip.show(h, `${f.reason} ${RUNDOWN.fuel}`, { x: 30, y: 40, abs: true }); });
    fb.bg.on('pointerout', () => Tooltip.hide());
    R.add(fb);
  });
  // tank material
  const mi = materialIds.indexOf(st.material);
  const m = MATERIALS[st.material];
  cycle(119, `${m.name.replace('Aluminum-lithium 2195', 'Al-lithium').replace('Stainless steel', 'Steel')} k ${m.k.v}`,
    () => apply(setMaterial(b, n, materialIds[(mi + materialIds.length - 1) % materialIds.length])),
    () => apply(setMaterial(b, n, materialIds[(mi + 1) % materialIds.length])), RUNDOWN.material);
  // fuel amount slider (click or drag the bar)
  const r = FUEL_RANGE[n];
  label(X0, 133, `FUEL ${fmt(st.fuelLb)} lb`, C.text);
  const bar = h.add.rectangle(X0, 144, W0, 6, 0x0a1022).setOrigin(0, 0).setStrokeStyle(1, C.blue).setInteractive({ useHandCursor: true });
  const frac = (st.fuelLb - r.min) / (r.max - r.min);
  const fill = h.add.rectangle(X0 + 1, 145, Math.max(1, (W0 - 2) * frac), 4, C.orange).setOrigin(0, 0);
  R.add([bar, fill]);
  const setAt = (px: number) => { const f = Math.max(0, Math.min(1, (px - X0) / W0)); return r.min + f * (r.max - r.min); };
  bar.on('pointerdown', (p: Phaser.Input.Pointer) => { fill.width = Math.max(1, (W0 - 2) * Math.max(0, Math.min(1, (p.x - X0) / W0))); });
  bar.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) fill.width = Math.max(1, (W0 - 2) * Math.max(0, Math.min(1, (p.x - X0) / W0))); });
  bar.on('pointerup', (p: Phaser.Input.Pointer) => apply(setFuel(b, n, setAt(p.x))));
  // material + fuel risk on the material card, with the fix as a checkbox
  const risks = stageRisks(b, n, fixes).filter((x) => x.level !== 'Low' || x.fixId === 'foamInspection');
  const top = risks.sort((a, c) => (a.now === c.now ? 0 : a.now === 'High' ? -1 : c.now === 'High' ? 1 : a.now === 'Medium' ? -1 : 1))[0];
  if (top) {
    const has = !!top.fixId && fixes.includes(top.fixId);
    const fx = top.fixId ? FIXES[top.fixId] : null;
    info(`${top.now} risk: ${top.combo}.`);
    const why = txt(h, X0 + W0 - 2, 166, 'WHY', { color: C.teal, align: 'right' });
    rundownTip(why.setInteractive({ useHandCursor: true }), `${top.why} ${top.fix}`);
    h.detail.add(why);
    if (fx) {
      const costs = [fx.costUsd.v ? `+${fmtUsd(fx.costUsd.v)}` : '', fx.padDays ? `+${fx.padDays.v} days` : '', fx.tankWeightMult ? `+${Math.round((fx.tankWeightMult.v - 1) * 100)}% tank` : ''].filter(Boolean).join(', ');
      const cb = txt(h, X0 + 2, 178, `[${has ? 'x' : ' '}] ${fx.name.replace(' in carbon-fiber tanks', '')} ${costs}`, { color: has ? C.green : C.orange, maxWidth: W0 - 4 });
      cb.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        audio.sfx('select');
        h.change((d) => { const sp = specOf(d); d.spec = { ...sp, fixes: has ? sp.fixes.filter((x) => x !== top.fixId) : [...sp.fixes, top.fixId!] }; });
      });
      h.detail.add(cb);
    }
  } else info('Hover the arrows for what each part does.');
}
