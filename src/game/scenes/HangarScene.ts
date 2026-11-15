import Phaser from 'phaser';
import { learned } from '../ui/learned';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, fadeIn, fadeTo, gearButton, icon, iconFrame, kg, Meter, modal, modalState, onceKey, pagedText, panel, toast, Tooltip, txt, W } from '../ui/ui';
import { SpacecraftView } from '../components/SpacecraftView';
import { COMPONENT_BY_ID, Component, componentsInSlot, SLOTS, SlotId } from '../../data/components';
import { cloneDesign, Design, LAUNCH_VEHICLES, REFERENCE_DESIGN, SITES, TEMPOS, LV_BY_ID, SITE_BY_ID } from '../../data/mission';
import { reviewDesign, ReviewResult } from '../../simulation/review';
import { analyzeDesign, DesignStats } from '../../simulation/spacecraft';
import { BUDGET_M, G0, SPEC_MODEL } from '../../simulation/constants';
import { CAPSULE_OWNED_SLOTS, missionDv, specOf } from '../../simulation/specModel';
import { CAPSULES, ORBITS, OrbitId, SpecDesign } from '../../data/specParts';
import { ARCH_RUNDOWN, CAPSULE_RUNDOWN, ORBIT_RUNDOWN, STYLE_RUNDOWN } from '../../data/missionStyle';
import { fmt, fmtUsd, fmtUsdM, kgToLb } from '../../simulation/units';
import { renderRocketTab } from './hangarRocket';
import { applyDesignPick, dueDesignCard } from '../../simulation/roleDecisions';
import { showRoleCard } from '../ui/roleCard';

type Cat = SlotId | 'plan' | 'style' | 'rocket';
const FLOOR_Y = 209;

export class HangarScene extends Phaser.Scene {
  design!: Design;
  review!: ReviewResult;
  cat: Cat = 'plan';
  undo: string[] = [];
  view!: SpacecraftView;
  catRows: { cat: Cat; bg: Phaser.GameObjects.Rectangle; status: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText }[] = [];
  right!: Phaser.GameObjects.Container;
  detail!: Phaser.GameObjects.Container;
  meters: Record<string, Meter> = {};
  goBtn!: Button;
  undoBtn!: Button;
  summary!: Phaser.GameObjects.BitmapText;
  constructor() { super('Hangar'); }

  create(data: { tutorial?: boolean }) {
    fadeIn(this);
    audio.music('build');
    this.design = cloneDesign(store.design);
    this.undo = [];
    this.catRows = [];
    this.add.image(0, 0, 'hangar').setOrigin(0, 0);
    // dust motes in the lamp light
    for (let i = 0; i < 18; i++) {
      const m = this.add.rectangle(Phaser.Math.Between(40, 440), Phaser.Math.Between(40, 200), 1, 1, 0xffe8b0, 0.5);
      this.tweens.add({ targets: m, y: m.y + 30, alpha: 0, duration: Phaser.Math.Between(3000, 6000), repeat: -1, delay: Phaser.Math.Between(0, 3000) });
    }
    // crane hook gently swaying
    const hook = this.add.rectangle(240, 44, 7, 4, 0x6c6c84).setOrigin(0.5, 0);
    this.tweens.add({ targets: hook, x: 243, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.view = new SpacecraftView(this, 200, 30, this.design, 'stack');
    this.placeLander();

    // header
    panel(this, 108, 2, 212, 16, 'panel_dark');
    txt(this, 214, 6, 'CHAPTER 2: THE BUILD', { align: 'center', color: C.gold });
    // left: categories
    panel(this, 2, 2, 104, 210, 'panel');
    txt(this, 54, 7, 'SYSTEMS', { align: 'center', color: C.gold });
    const cats: { id: Cat; label: string; icon: string }[] = [{ id: 'plan', label: 'Mission Plan', icon: 'rocket' }, ...(SPEC_MODEL ? [{ id: 'rocket' as Cat, label: 'Rocket', icon: 'engine' }, { id: 'style' as Cat, label: 'Mission Style', icon: 'earth' }] : []), ...SLOTS.filter((s) => !(SPEC_MODEL && CAPSULE_OWNED_SLOTS.includes(s.id))).map((s) => ({ id: s.id as Cat, label: s.label, icon: s.icon }))];
    cats.forEach((c, i) => {
      const y = 19 + i * 13.6;
      const bg = this.add.rectangle(6, y, 96, 13, 0x2a4c98, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      icon(this, 8, y + 0.5, c.icon);
      const label = txt(this, 22, y + 2, c.label, { color: C.text });
      const status = this.add.image(90, y + 0.5, 'icons', iconFrame('ok')).setOrigin(0, 0);
      bg.on('pointerover', () => { bg.setFillStyle(0x2a4c98, 0.5); audio.sfx('move'); const s = SLOTS.find((x) => x.id === c.id); Tooltip.show(this, c.id === 'rocket' ? 'Engines, fuel, tank material and boosters for each stage.' : c.id === 'style' ? 'Capsule, lunar orbit and architecture: Apollo-style or Artemis-style.' : s ? s.help : 'Rocket, landing site, crew size, surface stay and operations tempo.', { x: 112, y, abs: true }); }); // right of the list
      bg.on('pointerout', () => { Tooltip.hide(); this.refresh(); });
      bg.on('pointerup', () => { audio.sfx('select'); this.selectCat(c.id); });
      this.catRows.push({ cat: c.id, bg, status, label });
    });
    // right panel
    panel(this, 322, 2, 156, 210, 'panel');
    this.right = this.add.container(0, 0);
    this.detail = this.add.container(0, 0);
    // bottom panel: meters + actions
    panel(this, 2, 214, 476, 54, 'panel');
    this.meters.mass = new Meter(this, 10, 219, 98, 'MASS', 'rocket');
    this.meters.budget = new Meter(this, 114, 219, 98, 'COST', 'cost');
    this.meters.dv = new Meter(this, 218, 219, 98, 'FUEL', 'fuel');
    this.meters.power = new Meter(this, 10, 243, 98, 'POWER', 'power');
    this.meters.heat = new Meter(this, 114, 243, 98, 'HEAT', 'thermal');
    this.meters.lander = new Meter(this, 218, 243, 98, 'LANDER', 'moon');
    for (const [k, m] of Object.entries(this.meters)) {
      const tips: Record<string, string> = {
        mass: 'Total mass sent to the Moon vs. what your rocket can lift (white line = limit).',
        budget: `Total cost vs. the $${BUDGET_M}M program budget.`,
        dv: 'Service-module propellant: how much the planned burns need vs. what the tanks hold.',
        power: 'Orbit-average solar/fuel-cell power vs. electrical load with all instruments on.',
        heat: 'Waste heat (all electrical power + crew) vs. radiator capacity.',
        lander: 'Lander Δv margin for descent and ascent with maximum samples.',
      };
      const hit = this.add.rectangle(m.x, m.y, 96, 20, 0, 0).setOrigin(0, 0).setInteractive();
      hit.on('pointerover', () => Tooltip.show(this, tips[k], { x: m.x, y: m.y, width: 96, height: 20 }));
      hit.on('pointerout', () => Tooltip.hide());
    }
    this.summary = txt(this, 322, 220, '', { color: C.dim, maxWidth: 70 });
    this.undoBtn = new Button(this, 396, 218, 'UNDO', () => this.doUndo(), { w: 38, tooltip: 'Undo last change (Ctrl+Z)' });
    new Button(this, 436, 218, 'HINT', () => this.hint(), { w: 38, tooltip: 'What should I fix?' });
    this.goBtn = new Button(this, 396, 240, SPEC_MODEL ? 'DESK ▶' : 'REVIEW ▶', () => this.goReview(), { w: 78, h: 22, style: 'go', tooltip: SPEC_MODEL ? 'Calculation Desk, then the GO / NO-GO review' : 'Pre-launch design review (Chapter 3)' });
    this.input.keyboard?.on('keydown-Z', (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey) this.doUndo(); });
    this.input.keyboard?.on('keydown-ENTER', () => { if (!modalState.open) this.goReview(); });
    // keyboard: Up / Down walk the systems list; on Mission Style they walk its three rows first,
    // and Left / Right change the highlighted row's choice
    this.input.keyboard?.on('keydown', onceKey((e: KeyboardEvent) => {
      if (modalState.open) return;
      const cats = this.catRows.map((r) => r.cat);
      const i = cats.indexOf(this.cat);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const d = e.key === 'ArrowDown' ? 1 : -1;
        if (this.cat === 'style' && this.styleRow + d >= 0 && this.styleRow + d <= 2) { this.styleRow += d; audio.sfx('move'); this.renderRight(); return; }
        const next = cats[(i + d + cats.length) % cats.length];
        if (next === 'style') this.styleRow = d > 0 ? 0 : 2;
        audio.sfx('move'); this.selectCat(next);
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.cat === 'style') {
        this.styleStep(e.key === 'ArrowRight' ? 1 : -1);
      }
    }));
    gearButton(this);
    crt(this);
    this.selectCat('plan');
    this.refresh();
    if (data?.tutorial && !store.seen.hangarTut) {
      chapterCard(this, 2, 'THE BUILD', () => {
        toast(this, 'Director Cole', 'This baseline design will NOT reach the Moon and back. Red icons show the problems. Fix them, then press REVIEW.', 'portrait_director', 7000);
        store.markSeen('hangarTut');
      });
    }
    this.input.once('pointerdown', () => audio.unlock());
  }

  placeLander() {
    const lander = this.design.slots.lander;
    const lh = lander === 'lander_path' ? 62 : 50;
    this.view.landerC.setPosition(62, FLOOR_Y - this.view.y - lh + 1);
  }

  // ------------------------------------------------------------ state changes
  change(mut: (d: Design) => void, partId?: string) {
    this.undo.push(JSON.stringify(this.design));
    if (this.undo.length > 50) this.undo.shift();
    mut(this.design);
    learned(this, 'tradeoff', 400); // D1: every change moves cost, weight, risk and science together
    store.design = cloneDesign(this.design);
    store.saveDesign();
    this.view.build(this.design);
    this.placeLander();
    if (partId) {
      audio.sfx('install');
      this.sparkle(partId);
    }
    this.refresh();
    this.renderRight();
  }
  doUndo() {
    const prev = this.undo.pop();
    if (!prev) { audio.sfx('error'); return; }
    audio.sfx('back');
    this.design = JSON.parse(prev);
    store.design = cloneDesign(this.design); store.saveDesign();
    this.view.build(this.design); this.placeLander();
    this.refresh(); this.renderRight();
  }
  sparkle(partId: string) {
    const imgs = this.view.byPart[partId];
    if (!imgs?.length) return;
    const im = imgs[0];
    const m = im.getWorldTransformMatrix();
    for (let i = 0; i < 10; i++) {
      const s = this.add.image(m.tx + Phaser.Math.Between(0, Math.max(4, im.width)), m.ty + Phaser.Math.Between(0, Math.max(4, im.height)), 'spark').setTint(0xffe27a);
      this.tweens.add({ targets: s, y: s.y - Phaser.Math.Between(6, 16), alpha: 0, duration: 500, onComplete: () => s.destroy() });
    }
    this.view.highlight(partId);
    this.time.delayedCall(800, () => this.view.highlight(null));
  }

  // ------------------------------------------------------------ refresh
  refresh() {
    this.review = reviewDesign(this.design);
    const s = this.review.stats;
    const lv = LV_BY_ID[this.design.plan.lv];
    const capKg = SPEC_MODEL ? s.lv.capacityKg : lv.tliCapacityKg; // spec: what this rocket can push to 12,600 m/s
    const massF = s.mass.tliKg / Math.max(1, capKg);
    this.meters.mass.set(Math.min(1, massF / 1.15), `${fmt(kgToLb(s.mass.tliKg))} lb`, massF > 1 ? C.red : massF > 0.97 ? C.orange : C.green, 1 / 1.15);
    const budF = s.costM / BUDGET_M;
    this.meters.budget.set(Math.min(1, budF / 1.15), `$${fmt(s.costM)}M`, budF > 1 ? C.red : budF > 0.97 ? C.orange : C.green, 1 / 1.15);
    const pm = s.propulsion;
    const pf = pm.requiredKg / Math.max(1, pm.capacityKg);
    this.meters.dv.set(Math.min(1, pf / 1.15), pm.marginKg >= 0 ? `+${(pm.marginPct * 100).toFixed(0)}% spare` : `${(-pm.marginKg / 1000).toFixed(1)}t SHORT`, pm.marginKg < 0 ? C.red : pm.marginPct < 0.06 ? C.orange : C.green, 1 / 1.15);
    const P = s.power;
    const powF = P.peakLoadW / Math.max(1, P.orbitAvgGenW);
    this.meters.power.set(Math.min(1, powF / 1.15), `${(P.peakLoadW / 1000).toFixed(1)}/${(P.orbitAvgGenW / 1000).toFixed(1)} kW`, P.orbitAvgGenW < P.nominalLoadW || (P.genKind === 'fuelcell' && P.missionEnergyWh > P.reactantWh) ? C.red : powF > 1 ? C.orange : C.green, 1 / 1.15);
    const T = s.thermal;
    const hf = T.heatPeakW / Math.max(1, T.rejectW);
    this.meters.heat.set(Math.min(1, hf / 1.15), `${(T.heatPeakW / 1000).toFixed(1)}/${(T.rejectW / 1000).toFixed(1)} kW`, T.heatNominalW > T.rejectW ? C.red : hf > 1 ? C.orange : C.green, 1 / 1.15);
    const L = s.lander;
    if (L.present) {
      const worst = Math.min(L.descentDvAvail / L.descentDvReq, L.ascentDvAvail / L.ascentDvReq);
      this.meters.lander.set(Math.min(1, worst / 1.4), `${worst >= 1 ? '+' : ''}${((worst - 1) * 100).toFixed(0)}% Δv`, worst < 1 ? C.red : worst < 1.08 ? C.orange : C.green, 1 / 1.4);
    }
    this.summary.setText(`${this.review.blocking} BLOCKING\n${this.review.warnings} WARNINGS`).setTint(this.review.blocking ? C.red : this.review.warnings ? C.orange : C.green);
    this.goBtn.setText(SPEC_MODEL ? 'DESK ▶' : 'REVIEW ▶');
    this.undoBtn.setDisabled(this.undo.length === 0);
    // category status icons
    const culpritSlots: Record<string, 'fail' | 'warn'> = {};
    for (const c of this.review.checks) for (const id of c.culprits) {
      const slot = COMPONENT_BY_ID[id]?.slot;
      if (!slot || c.status === 'pass') continue;
      if (culpritSlots[slot] !== 'fail') culpritSlots[slot] = c.status as 'fail' | 'warn';
    }
    const planBad = this.review.checks.some((c) => (c.id === 'launch_mass' || c.id === 'budget' || c.id === 'stay') && c.status === 'fail');
    for (const r of this.catRows) {
      let st: string = 'ok';
      if (r.cat === 'plan') st = planBad ? 'fail' : 'ok';
      else if (r.cat === 'rocket') st = this.review.checks.some((c) => c.id === 'launch_mass' && c.status === 'fail') ? 'fail' : this.review.checks.some((c) => c.id === 'upper_push' && c.status !== 'pass') ? 'warn' : 'ok';
      else if (r.cat === 'style') st = this.review.checks.some((c) => ['propulsion', 'capsule', 'shield', 'lander_dv'].includes(c.id) && c.status === 'fail') ? 'fail' : 'ok';
      else {
        const slot = SLOTS.find((x) => x.id === r.cat)!;
        const empty = !slot.multi && !this.design.slots[r.cat];
        st = empty ? 'warn' : culpritSlots[r.cat] ?? 'ok';
        if (slot.multi) st = culpritSlots[r.cat] ?? ((r.cat === 'science' && this.design.science.length === 0) ? 'warn' : 'ok');
      }
      r.status.setFrame(iconFrame(st));
      this.tweens.killTweensOf(r.status);
      r.status.setAlpha(1);
      if (st === 'fail') this.tweens.add({ targets: r.status, alpha: 0.25, duration: 420, yoyo: true, repeat: -1 });
      r.bg.setFillStyle(this.cat === r.cat ? 0x2a4c98 : st === 'fail' ? 0x7a1626 : 0x2a4c98, this.cat === r.cat ? 0.85 : st === 'fail' ? 0.45 : 0);
      r.label.setTint(this.cat === r.cat ? C.gold2 : C.text);
    }
  }

  styleRow = 0; // Mission Style row under keyboard focus: 0 capsule, 1 orbit, 2 architecture
  styleStep(d: number) {
    const sp = specOf(this.design);
    const lists: string[][] = [CAPSULES.map((c) => c.id), ['LLO', 'NRHO'], ['apollo', 'artemis']];
    const keys = ['capsule', 'orbit', 'architecture'] as const;
    const list = lists[this.styleRow], cur = sp[keys[this.styleRow]] as string;
    const v = list[(list.indexOf(cur) + d + list.length) % list.length];
    this.change(() => { this.design.spec = { ...specOf(this.design), [keys[this.styleRow]]: v } as SpecDesign; });
  }
  rocketSection: 'stage1' | 'stage2' | 'boosters' = 'stage1';
  listPage = 0; // option list page (A3: rows that do not fit go onto pages, never under the detail box)
  selectCat(c: Cat) {
    if (c !== this.cat) this.listPage = 0;
    if (c === 'style') learned(this, 'orbits'); // D1
    this.cat = c;
    Tooltip.hide();
    this.view.highlight(null);
    this.refresh();
    this.renderRight();
  }

  // ------------------------------------------------------------ right panel
  renderRight() {
    this.right.removeAll(true);
    this.detail.removeAll(true);
    const R = this.right;
    const x0 = 326;
    if (this.cat === 'plan') { this.renderPlan(); return; }
    if (this.cat === 'style') { this.renderStyle(); return; }
    if (this.cat === 'rocket') { renderRocketTab(this); return; }
    const slot = SLOTS.find((s) => s.id === this.cat)!;
    R.add(txt(this, 400, 7, slot.label.toUpperCase(), { align: 'center', color: C.gold }));
    R.add(txt(this, x0 + 2, 18, slot.multi ? 'Choose any' : 'Choose one', { color: C.dim }));
    const all = componentsInSlot(this.cat as SlotId);
    const ch = all.length > 4 ? 22 : 30;
    const per = Math.floor((152 - 28) / (ch + 2)); // rows that fit above the detail box
    const pages = Math.max(1, Math.ceil(all.length / per));
    this.listPage = Math.min(this.listPage, pages - 1);
    const opts = all.slice(this.listPage * per, this.listPage * per + per);
    if (pages > 1) {
      const pg = txt(this, x0 + 146, 18, `< ${this.listPage + 1}/${pages} >`, { align: 'right', color: C.teal });
      pg.setInteractive({ useHandCursor: true }).on('pointerup', () => { this.listPage = (this.listPage + 1) % pages; audio.sfx('move'); this.renderRight(); });
      R.add(pg);
    }
    opts.forEach((comp, i) => {
      const y = 28 + i * (ch + 2);
      const selected = slot.multi ? (this.cat === 'science' ? this.design.science : this.design.safety).includes(comp.id) : this.design.slots[this.cat] === comp.id;
      const bad = this.review.checks.some((c) => c.status === 'fail' && c.culprits.includes(comp.id)) && selected;
      const card = this.add.nineslice(x0, y, bad ? 'card_bad' : selected ? 'card_sel' : 'card', undefined, 148, ch, 6, 6, 6, 6).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      R.add(card);
      R.add(this.add.image(x0 + 4, y + 4, 'icons', iconFrame(selected ? 'ok' : SLOTS.find((s) => s.id === comp.slot)!.icon)).setOrigin(0, 0));
      R.add(txt(this, x0 + 18, y + 4, comp.short, { color: selected ? C.gold2 : C.white }));
      R.add(txt(this, x0 + 144, y + 4, `$${comp.costM}M`, { align: 'right', color: C.dim }));
      const metric = this.metricLine(comp);
      R.add(txt(this, x0 + 18, y + (ch > 26 ? 16 : 12), metric, { color: C.blue }));
      card.on('pointerover', () => { audio.sfx('move'); this.showDetail(comp); this.view.highlight(selected ? comp.id : null); });
      card.on('pointerout', () => this.view.highlight(null));
      card.on('pointerup', () => this.pick(comp, slot.multi ?? false, selected));
    });
    const sel = slot.multi ? null : COMPONENT_BY_ID[this.design.slots[this.cat] as string];
    if (sel) this.showDetail(sel); else this.showSlotHelp(slot.help);
  }

  metricLine(c: Component): string {
    const parts: string[] = [`${c.massKg ? kg(c.massKg) : c.slot === 'lander' ? kg(c.descentDryKg! + c.descentPropKg! + c.ascentDryKg! + c.ascentPropKg!) : '0 lb'}`];
    if (c.ispS && c.slot === 'propulsion') parts.push(`Isp ${c.ispS}s`);
    if (c.propCapacityKg) parts.push(`${(c.propCapacityKg / 1000).toFixed(1)} t prop`);
    if (c.genW) parts.push(`${fmt(c.genW)} W`);
    if (c.storageWh) parts.push(`${fmt(c.storageWh)} Wh`);
    if (c.downlinkMbps) parts.push(`${fmt(c.downlinkMbps * 1000)} kbps`);
    if (c.storageMB) parts.push(`${c.storageMB >= 1e6 ? '1 TB' : c.storageMB / 1000 + ' GB'}`);
    if (c.heatRejectW) parts.push(`${fmt(c.heatRejectW)} W`);
    if (c.crewCapacity && c.slot !== 'lander') parts.push(`${c.crewCapacity} crew`); // landers show crew in their name
    if (c.thrustN && c.slot === 'lander') parts.push(`${fmt(c.thrustN)} N`);
    if (c.powerW && !c.genW) parts.push(`${c.powerW} W`);
    return parts.slice(0, 3).join('  ');
  }

  pick(comp: Component, multi: boolean, selected: boolean) {
    if (multi) {
      const listKey = comp.slot === 'science' ? 'science' : 'safety';
      this.change((d) => { const l = d[listKey]; if (selected) d[listKey] = l.filter((x) => x !== comp.id); else l.push(comp.id); }, selected ? undefined : comp.id);
      if (selected) audio.sfx('remove');
    } else {
      if (selected) { audio.sfx('beep'); return; }
      this.change((d) => { d.slots[comp.slot] = comp.id; }, comp.id);
    }
  }

  showSlotHelp(text: string) {
    this.detail.removeAll(true);
    this.detail.add(txt(this, 328, 168, text, { maxWidth: 144, color: C.dim }));
  }

  /** Detail box with educational note and comparison deltas vs the current design. */
  showDetail(comp: Component) {
    this.detail.removeAll(true);
    const D = this.detail;
    const y0 = 158;
    D.add(this.add.rectangle(326, y0 - 3, 148, 1, C.gold, 0.6).setOrigin(0, 0));
    D.add(txt(this, 328, y0, comp.name, { color: C.gold2, maxWidth: 144 }));
    // alternative design for comparison
    const slot = SLOTS.find((s) => s.id === comp.slot)!;
    const alt = cloneDesign(this.design);
    let isCurrent: boolean;
    if (slot.multi) {
      const key = comp.slot === 'science' ? 'science' : 'safety';
      isCurrent = alt[key].includes(comp.id);
      alt[key] = isCurrent ? alt[key].filter((x) => x !== comp.id) : [...alt[key], comp.id];
    } else { isCurrent = alt.slots[comp.slot] === comp.id; alt.slots[comp.slot] = comp.id; }
    const lines: string[] = [];
    if (!isCurrent || slot.multi) {
      const a: DesignStats = this.review.stats, b = analyzeDesign(alt);
      const sign = slot.multi && isCurrent ? 'REMOVE: ' : slot.multi ? 'ADD: ' : 'SWAP: ';
      const dm = b.mass.tliKg - a.mass.tliKg, dc = b.costM - a.costM, dp = b.propulsion.marginKg - a.propulsion.marginKg, dw = (b.power.orbitAvgGenW - b.power.peakLoadW) - (a.power.orbitAvgGenW - a.power.peakLoadW);
      const f = (v: number, unit: string, goodIfUp: boolean) => (Math.abs(v) < 0.5 ? '' : `${v > 0 ? '↑' : '↓'}${Math.abs(Math.round(v)).toLocaleString('en-US')}${unit}${(v > 0) === goodIfUp ? '' : '!'}`);
      const parts = [f(kgToLb(dm), ' lb', false), f(dc * 1e6, ' USD', false), f(kgToLb(dp), ' lb fuel', true), f(dw, ' W', true)].filter(Boolean);
      lines.push(sign + (parts.join(' ') || 'no change'));
    }
    // thrust in N and exhaust speed in m/s (Isp stays in the glossary)
    const engine = comp.thrustN && comp.ispS ? `
Engine ${fmt(comp.thrustN)} N${comp.ascentThrustN ? ` down / ${fmt(comp.ascentThrustN)} N up` : ''}, exhaust ${fmt(comp.ispS * G0)} m/s.` : '';
    // Never clip: the swap line and engine numbers come first; the description is trimmed (at full
    // font size) to the room left, and the WHY tooltip carries the full text.
    const swap = lines.length ? txt(this, 328, y0 + 10, lines.join('\n'), { maxWidth: 144, color: C.orange }) : null;
    if (swap) D.add(swap);
    const top = y0 + 10 + (swap ? swap.height + 1 : 0);
    // never clip (A3): long descriptions page inside the box (click "1/2 >")
    D.add(pagedText(this, 328, top, 144, 212 - top, `${engine.trim() ? engine.trim() + '\n' : ''}${comp.desc}`, { color: C.white, size: 15 }));
    // educational note (hover for full), on the title line
    const learnBtn = txt(this, 472, y0, '▶ WHY', { color: C.teal, align: 'right' });
    learnBtn.setInteractive({ useHandCursor: true });
    learnBtn.on('pointerover', () => Tooltip.show(this, `${comp.desc}${engine}\n\n${comp.learn}`, { x: 30, y: 40, abs: true }));
    learnBtn.on('pointerout', () => Tooltip.hide());
    D.add(learnBtn);
  }

  renderPlan() {
    const R = this.right;
    const x0 = 326;
    R.add(txt(this, 400, 7, 'MISSION PLAN', { align: 'center', color: C.gold }));
    const p = this.design.plan;
    const row = (y: number, label: string, items: { id: string | number; label: string; tip: string }[], cur: string | number, set: (v: string | number) => void) => {
      R.add(txt(this, x0 + 2, y, label, { color: C.dim }));
      const bw = Math.floor(146 / items.length) - 2;
      items.forEach((it, i) => {
        const b = new Button(this, x0 + i * (bw + 2), y + 9, it.label, () => { if (cur !== it.id) this.change(() => set(it.id)); }, { w: bw, h: 15 });
        b.setSelected(cur === it.id);
        b.bg.on('pointerover', () => this.planDetail(it.tip));
        R.add(b);
      });
    };
    row(19, 'LAUNCH VEHICLE', LAUNCH_VEHICLES.map((v) => ({ id: v.id, label: v.short.split(' ')[0].toUpperCase().slice(0, 7), tip: SPEC_MODEL ? `${v.name}: ${fmt(kgToLb(v.tliCapacityKg))} lb to the Moon (12,600 m/s), rocket ${fmtUsdM(v.costM)}.\n${v.desc}\n${v.learn}` : `${v.name}: ${(v.tliCapacityKg / 1000).toFixed(1)} t to TLI, $${v.costM}M, ${(v.reliability * 100).toFixed(1)}% reliable.\n${v.desc}\n${v.learn}` })), p.lv, (v) => { this.design.plan.lv = v as Design['plan']['lv']; if (this.design.spec) this.design.spec.rocket = null; });
    row(46, 'LANDING SITE', SITES.map((s) => ({ id: s.id, label: s.short.split(' ')[0].toUpperCase().slice(0, 7), tip: `${s.name}: ${SPEC_MODEL ? `LOI ${missionDv(this.design).loi} m/s, TEI ${missionDv(this.design).tei} m/s, descent ${missionDv(this.design).descent} m/s (set by the lunar orbit)` : `LOI ${s.dvLoi} m/s, TEI ${s.dvTei} m/s, descent ${s.dvDescent} m/s`}. Science x${s.scienceMult}.\n${s.desc}\n${s.learn}` })), p.site, (v) => { this.design.plan.site = v as Design['plan']['site']; });
    row(73, 'CREW SIZE', [{ id: 3, label: '3 CREW', tip: '3 crew: 2 land, 1 stays in orbit (Apollo style). Fewer consumables.' }, { id: 4, label: '4 CREW', tip: '4 crew: up to 3 land with the Pathfinder lander. More EVA hours, more consumables and mass.' }], p.crew, (v) => { this.design.plan.crew = v as 3 | 4; });
    row(100, 'SURFACE STAY', [1, 2, 3].map((d) => ({ id: d, label: `${d} DAY${d > 1 ? 'S' : ''}`, tip: `${d} day(s) on the surface. Longer stays allow more EVAs but need lander battery & consumables (and crew food/water in orbit).` })), p.stayDays, (v) => { this.design.plan.stayDays = v as 1 | 2 | 3; });
    row(127, 'OPS TEMPO', TEMPOS.map((t) => ({ id: t.id, label: t.name.slice(0, 7).toUpperCase(), tip: `${t.name}: ${t.desc}` })), p.tempo, (v) => { this.design.plan.tempo = v as Design['plan']['tempo']; });
    const lv = LV_BY_ID[p.lv], site = SITE_BY_ID[p.site];
    this.planDetail(`${lv.name}${specOf(this.design).rocket ? ' (fuel set at the Calculation Desk)' : ''} → ${site.name}. ${site.desc}`);
  }

  /** Mission Style (spec tab 2 'the big choice'): capsule, lunar orbit, architecture. */
  renderStyle() {
    const R = this.right, x0 = 326;
    const sp = specOf(this.design);
    R.add(txt(this, 400, 7, 'MISSION STYLE', { align: 'center', color: C.gold }));
    const row = (y: number, label: string, rundown: string, items: { id: string; label: string; tip: string }[], cur: string, set: (v: string) => void) => {
      const focus = ['CAPSULE', 'LUNAR ORBIT', 'ARCHITECTURE'].indexOf(label) === this.styleRow;
      const l = txt(this, x0 + 2, y, `${focus ? '> ' : ''}${label}`, { color: focus ? C.gold2 : C.dim });
      // the detail box may trim; the tooltip always shows the full rundown and numbers
      const show = (t: string) => { this.planDetail(t); Tooltip.show(this, t, { x: 30, y: 40, abs: true }); };
      l.setInteractive({ useHandCursor: true }); l.on('pointerover', () => show(rundown)); l.on('pointerout', () => Tooltip.hide());
      R.add(l);
      const bw = Math.floor(146 / items.length) - 2;
      items.forEach((it, i) => {
        const b = new Button(this, x0 + i * (bw + 2), y + 9, it.label, () => { if (cur !== it.id) this.change(() => set(it.id)); }, { w: bw, h: 13 });
        b.setSelected(cur === it.id);
        b.bg.on('pointerover', () => show(it.tip));
        b.bg.on('pointerout', () => Tooltip.hide());
        R.add(b);
      });
    };
    const setSpec = (patch: Partial<SpecDesign>) => { this.design.spec = { ...specOf(this.design), ...patch }; };
    row(18, 'CAPSULE', STYLE_RUNDOWN.capsule, CAPSULES.map((c) => ({ id: c.id, label: c.id === 'cap_orion' ? 'ORION' : c.id === 'cap_apollo' ? 'APOLLO' : 'BUDGET',
      tip: `${CAPSULE_RUNDOWN[c.id]} ${c.crew.v} crew, ${c.maxDays.v} days, ${fmt(c.smFuelLb.v)} lb fuel, ${fmt(c.veMs.v)} m/s, shield ${fmt(c.shieldMph.v)} mph, ${fmtUsd(c.priceUsd.v)}.` })), sp.capsule, (v) => setSpec({ capsule: v }));
    row(42, 'LUNAR ORBIT', STYLE_RUNDOWN.orbit, (['LLO', 'NRHO'] as OrbitId[]).map((o) => ({ id: o, label: o === 'LLO' ? 'LOW' : 'HALO',
      tip: `${ORBIT_RUNDOWN[o]} In ${ORBITS[o].loi.v} / home ${ORBITS[o].tei.v} / down ${fmt(ORBITS[o].down.v)} / up ${fmt(ORBITS[o].up.v)} m/s.` })), sp.orbit, (v) => setSpec({ orbit: v as OrbitId }));
    row(66, 'ARCHITECTURE', STYLE_RUNDOWN.architecture, [{ id: 'apollo', label: 'APOLLO (1)', tip: ARCH_RUNDOWN.apollo }, { id: 'artemis', label: 'ARTEMIS (2)', tip: ARCH_RUNDOWN.artemis }], sp.architecture, (v) => setSpec({ architecture: v as 'apollo' | 'artemis' }));
    // key numbers for the current choices, straight from the analysis
    const S = this.review.stats.spec!, L = this.review.stats.lander;
    const ok = (b: boolean) => (b ? '✓' : '×');
    const lines = [
      `Fuel ${fmt(kgToLb(S.capsule.propKg))} lb · ${S.capsule.maxDays} d`,
      `${ok(S.capsuleReturn.pass)} Home ${fmt(S.capsuleReturn.dvLeft)}/${fmt(S.capsuleReturn.need)} m/s`,
      ...(L.present ? [`${ok(L.descentDvAvail >= L.descentDvReq)} Down ${fmt(L.descentDvAvail)}/${fmt(L.descentDvReq)} m/s`] : []),
      `${ok(S.shieldHealth >= 0.9)} Shield ${Math.round(S.shieldHealth * 100)}% · ${S.launches.length} launch${S.launches.length > 1 ? 'es' : ''}`,
    ];
    const t = txt(this, x0 + 2, 90, lines.join('\n'), { maxWidth: 146, color: C.text });
    while (90 + t.height > 153 && t.text.length > 10) t.setText(t.text.split('\n').slice(0, -1).join('\n'));
    R.add(t);
    this.planDetail(STYLE_RUNDOWN.capsule);
  }
  planDetail(text: string) {
    this.detail.removeAll(true);
    this.detail.add(this.add.rectangle(326, 155, 148, 1, C.gold, 0.6).setOrigin(0, 0));
    this.detail.add(pagedText(this, 328, 158, 144, 54, text, { color: C.white, size: 15 })); // never clip: pages
  }

  hint() {
    const fails = this.review.checks.filter((c) => c.status === 'fail');
    const warns = this.review.checks.filter((c) => c.status === 'warn');
    const top = fails[0] ?? warns[0];
    const text = top ? `${top.title.toUpperCase()}: ${top.detail}\n\nFIX: ${top.fix ?? 'Review the details in the design review.'}` : 'Everything checks out! Press REVIEW to continue to the countdown.';
    if (top) this.view.flashParts(top.culprits, top.status === 'fail' ? 0xee6448 : 0xff9e3a);
    modal(this, {
      title: fails.length ? `${fails.length} BLOCKING ISSUE${fails.length > 1 ? 'S' : ''}` : 'ENGINEERING HINT', text,
      options: [{ label: 'Keep building' }, { label: 'Load a proven reference design', detail: 'A known-good starting point you can modify.' }],
      onChoose: (i) => { if (i === 1) this.change((d) => { const r = cloneDesign(REFERENCE_DESIGN); d.slots = r.slots; d.safety = r.safety; d.science = r.science; d.plan = r.plan; d.spec = { ...r.spec, role: d.spec?.role ?? null, difficulty: d.spec?.difficulty ?? 'easy' }; }, 'capsule'); },
    });
  }

  goReview() {
    if (modalState.open) return;
    store.design = cloneDesign(this.design);
    store.saveDesign();
    // D3: the player's first role decision comes as the design heads to the desk
    const card = SPEC_MODEL ? dueDesignCard(this.design, 'design1') : null;
    if (card) {
      showRoleCard(this, { title: card.title, text: card.text(this.design), tip: card.tip, options: card.options.map((o) => ({ label: o.label, good: o.good(this.design), bad: o.bad(this.design) })) }, (i) => {
        this.change((d) => { const nd = applyDesignPick(d, card, i); Object.assign(d, nd); });
        this.goReview();
      });
      return;
    }
    fadeTo(this, SPEC_MODEL ? 'Desk' : 'Review'); // spec: the Calculation Desk sits between the hangar and launch
  }
}
void W;
