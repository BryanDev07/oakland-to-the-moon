import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, panel, toast, txt, W, H } from '../ui/ui';
import { emergencyUI, showEmergency } from '../ui/emergency';
import * as Sim from '../../simulation/mission';
import { em } from '../../simulation/deck';
import { issOf } from '../../simulation/issDeck';
import { Rng } from '../../simulation/rng';
import { evaResult, HANDRAILS, MISTAKE_MIN, MOVE_MIN, o2LeftMin, plannedMin, planFits, spend, SWAP_BATTERY, SWAP_MIN, TETHER_MOVE_EXTRA, UNFOLD_MIN } from '../../simulation/spacewalk';
import { ISS } from '../../data/missionConfig';
import { specOf } from '../../simulation/specModel';
import { learned } from '../ui/learned';

type Stage = 'prep' | 'out' | 'swap' | 'unfold' | 'back' | 'done';
const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
const CAREFUL_EXTRA = 5; // Enter: a careful move, always right, 5 minutes slower
const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)} h ${String(Math.round(Math.max(0, min) % 60)).padStart(2, '0')} min`;

/**
 * E3: spacewalk prep (tool and tether) and the spacewalk itself. Prep: Up / Down pick a row, Left / Right
 * pick an option, Enter goes outside. Outside: press the arrow shown to move along the handrail (a wrong
 * arrow is a slip and costs extra), or Enter for a careful move; Enter at the array does the task.
 */
export class SpacewalkScene extends Phaser.Scene {
  stage: Stage = 'prep';
  node = 0; want = 'ArrowRight'; row = 0; cardsDone = false;
  rng!: Rng;
  ui!: Phaser.GameObjects.Container;
  g!: Phaser.GameObjects.Graphics;
  constructor() { super('Spacewalk'); }
  get hard() { return specOf(store.mission!.design).difficulty === 'hard'; }
  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s) { fadeTo(this, 'Title'); return; }
    const p = issOf(s);
    p.tool ??= 'power'; p.tether ??= 'double';
    this.stage = 'prep'; this.node = 0; this.row = 0; this.cardsDone = false;
    this.rng = new Rng((s.seed * 31 + 7) >>> 0);
    audio.music('space');
    this.add.image(0, 0, 'space_bg').setOrigin(0, 0);
    this.add.image(0, 0, 'stars_near').setOrigin(0, 0);
    this.add.image(240, 330, 'earth_big').setScale(2).setAlpha(0.9);
    this.g = this.add.graphics();
    this.ui = this.add.container(0, 0).setDepth(10);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.key(e));
    gearButton(this);
    crt(this);
    learned(this, 'resources', 800); // suit oxygen and battery: manage resources
    this.render();
  }
  key(e: KeyboardEvent) {
    if (emergencyUI.open || this.stage === 'done') return;
    const p = issOf(store.mission!);
    if (this.stage === 'prep') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.row = 1 - this.row;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (this.row === 0) p.tool = p.tool === 'power' ? 'wrench' : 'power'; else p.tether = p.tether === 'single' ? 'double' : 'single';
      } else if (e.key === 'Enter') { this.goOutside(); return; }
      audio.sfx('move'); this.render(); return;
    }
    if (this.stage === 'out' || this.stage === 'back') {
      if (e.key === 'Enter') this.move('careful');
      else if (ARROWS[e.key]) this.move(e.key === this.want ? 'right' : 'wrong');
      return;
    }
    if (e.key === 'Enter') this.task();
  }
  goOutside() {
    const p = issOf(store.mission!);
    this.stage = 'out';
    this.pickArrow();
    audio.sfx('select');
    toast(this, 'CAPCOM Sam', `Outside! ${ISS.suitO2Hours.v} hours of suit oxygen; keep ${ISS.evaReserveMin.v} minutes in reserve.`, 'portrait_capcom', 3500);
    Sim.log(store.mission!, `Spacewalk started with the ${p.tool === 'power' ? 'pistol-grip power tool' : 'wrench'} and a ${p.tether} tether.`, 'info');
    this.render();
  }
  pickArrow() { const keys = Object.keys(ARROWS); this.want = keys[this.rng.int(0, keys.length - 1)]; }
  moveMin() { const p = issOf(store.mission!); return (this.hard ? MOVE_MIN.hard : MOVE_MIN.easy) + TETHER_MOVE_EXTRA[p.tether!]; }
  move(kind: 'right' | 'wrong' | 'careful') {
    const s = store.mission!, p = issOf(s);
    if (kind !== 'wrong') {
      spend(p, this.moveMin() + (kind === 'careful' ? CAREFUL_EXTRA : 0));
      this.node += this.stage === 'out' ? 1 : -1;
      audio.sfx('move');
    } else {
      spend(p, MISTAKE_MIN[p.tether!]); p.mistakes++;
      audio.sfx('error');
      toast(this, 'Spacewalker', `Slipped on the handrail: -${MISTAKE_MIN[p.tether!]} min.`, 'portrait_kai_suit', 1800);
    }
    if (this.stage === 'out' && this.node >= HANDRAILS) this.stage = p.evaAborted ? 'back' : 'swap';
    if (this.stage === 'back' && this.node <= 0) { this.finish(); return; }
    this.pickArrow();
    this.check();
    this.render();
  }
  task() {
    const s = store.mission!, p = issOf(s);
    if (this.stage === 'swap') {
      spend(p, SWAP_MIN[p.tool!]); p.batteryPct -= SWAP_BATTERY[p.tool!];
      Sim.log(s, `Failed power unit swapped (${SWAP_MIN[p.tool!]} min).`, 'good');
      this.stage = 'unfold';
      audio.sfx('install');
      // spacewalk emergencies come after the swap
      if (!this.cardsDone) { this.cardsDone = true; this.cards(); }
    } else if (this.stage === 'unfold') {
      spend(p, UNFOLD_MIN);
      p.panelFixed = !p.evaAborted;
      Sim.log(s, p.panelHalf ? 'Solar panel left half-open.' : 'Solar panel unfolded: full power to the station.', p.panelHalf ? 'warn' : 'good');
      audio.sfx('success');
      this.stage = 'back';
      this.pickArrow();
    }
    this.check();
    this.render();
  }
  /** Fire the spacewalk emergencies one after another. */
  cards() {
    const s = store.mission!;
    if (!Sim.triggerStage(s, 'spacewalk')) return;
    showEmergency(this, s, () => {
      store.saveMission();
      const p = issOf(s);
      if (p.evaAborted) { this.stage = 'back'; this.pickArrow(); }
      this.check(); this.render();
      if (this.stage !== 'done') this.cards();
    });
  }
  check() {
    const s = store.mission!, p = issOf(s);
    if (o2LeftMin(p) <= 0 && this.stage !== 'done') {
      this.stage = 'done';
      Sim.loseCrew(s, 'The spacewalker ran out of suit oxygen.');
      store.saveMission();
      this.time.delayedCall(1500, () => fadeTo(this, 'Report'));
    }
  }
  finish() {
    const s = store.mission!, p = issOf(s);
    this.stage = 'done';
    p.evaDone = true;
    const r = evaResult(p);
    if (r === 'reserve') { em(s).safetyAdj -= 10; Sim.log(s, `Back inside with only ${Math.round(o2LeftMin(p))} min of oxygen: under the ${ISS.evaReserveMin.v}-minute reserve (-10 crew safety).`, 'warn'); }
    else Sim.log(s, `Back inside with ${hm(o2LeftMin(p))} of suit oxygen left.`, 'good');
    Sim.issUndock(s);
    store.saveMission();
    audio.sfx('success');
    toast(this, 'ISS Crew', p.panelFixed ? 'Panel fixed! Thank you. Safe trip home.' : 'Thanks for trying. Safe trip home.', 'portrait_capcom', 2400);
    this.time.delayedCall(2000, () => fadeTo(this, 'Return'));
  }
  render() {
    const s = store.mission!, p = issOf(s);
    this.ui.removeAll(true);
    const U = this.ui, g = this.g;
    g.clear();
    if (this.stage === 'prep') {
      U.add(panel(this, 60, 30, 360, 200, 'panel'));
      U.add(txt(this, 240, 38, 'SPACEWALK PREP', { align: 'center', color: C.gold, size: 15 }));
      const opt = (y: number, rowI: number, label: string, a: string, b: string, aOn: boolean, aTip: string, bTip: string) => {
        U.add(txt(this, 72, y + 3, `${this.row === rowI ? '> ' : ''}${label}`, { color: this.row === rowI ? C.gold2 : C.text }));
        const ba = new Button(this, 160, y, a, () => { this.row = rowI; if (!aOn) { if (rowI === 0) p.tool = 'power'; else p.tether = 'single'; } this.render(); }, { w: 120, h: 16, tooltip: aTip });
        const bb = new Button(this, 284, y, b, () => { this.row = rowI; if (aOn) { if (rowI === 0) p.tool = 'wrench'; else p.tether = 'double'; } this.render(); }, { w: 120, h: 16, tooltip: bTip });
        ba.setSelected(aOn); bb.setSelected(!aOn); U.add([ba, bb]);
      };
      opt(64, 0, 'TOOL', 'POWER TOOL', 'WRENCH', p.tool === 'power', `Fast (${SWAP_MIN.power} min) but uses ${SWAP_BATTERY.power}% of its battery.`, `Slow (${SWAP_MIN.wrench} min), no battery.`);
      opt(88, 1, 'TETHER', 'SINGLE', 'DOUBLE', p.tether === 'single', `Faster moves; a slip costs ${MISTAKE_MIN.single} min.`, `+${TETHER_MOVE_EXTRA.double} min per move; a slip costs ${MISTAKE_MIN.double} min.`);
      const plan = plannedMin(p.tool!, p.tether!, this.hard), fits = planFits(p.tool!, p.tether!, this.hard, p.suitO2Min);
      U.add(txt(this, 72, 116, `Suit oxygen: ${hm(p.suitO2Min)}. Plan: ${hm(plan)} with no slips.`, { color: C.white, maxWidth: 336 }));
      U.add(txt(this, 72, 140, fits ? `${hm(p.suitO2Min - plan)} spare: keep ${ISS.evaReserveMin.v} min in reserve.` : `Too tight: under the ${ISS.evaReserveMin.v}-minute reserve.`, { color: fits ? C.green : C.red, maxWidth: 336 }));
      U.add(txt(this, 72, 164, 'Up / Down pick a row, Left / Right pick, Enter to go outside.', { color: C.dim, maxWidth: 336 }));
      U.add(new Button(this, 300, 200, 'GO OUTSIDE ▶', () => this.goOutside(), { w: 108, h: 20, style: 'go' }));
      return;
    }
    // the truss with its handrails, the array on the right, the airlock on the left
    const x0 = 50, x1 = 400, y = 118, step = (x1 - x0) / HANDRAILS;
    g.fillStyle(0x1a1626).fillRect(x0 - 4, y - 4, x1 - x0 + 8, 9);
    g.fillStyle(0xb9b3a2).fillRect(x0 - 3, y - 3, x1 - x0 + 6, 7);
    for (let i = 0; i <= HANDRAILS; i++) { g.fillStyle(0xffe27a).fillRect(Math.round(x0 + i * step) - 1, y - 8, 3, 4); }
    g.fillStyle(0xe9e4d4).fillRect(x0 - 26, y - 14, 20, 28); g.fillStyle(0x3a3a48).fillRect(x0 - 20, y - 6, 8, 12); // airlock
    const half = p.panelHalf, open = this.stage === 'back' || this.stage === 'done' ? (half ? 0.5 : p.panelFixed ? 1 : 0.2) : 0.2;
    g.fillStyle(0x1a1626).fillRect(x1 + 8, y - 70 * open, 44, 140 * open);
    g.fillStyle(0x2a4c98).fillRect(x1 + 9, y - 70 * open + 1, 42, 140 * open - 2);
    // the spacewalker
    const ax = x0 + this.node * step, ay = y - 22;
    g.fillStyle(0x1a1626).fillRect(ax - 6, ay - 8, 13, 20); g.fillStyle(0xf2f2f2).fillRect(ax - 5, ay - 7, 11, 18);
    g.fillStyle(0xd8a24a).fillRect(ax - 3, ay - 5, 7, 4); // visor
    g.lineStyle(1, p.tether === 'double' ? 0x7cf07c : 0xffe27a, 0.9).lineBetween(ax, ay + 10, x0 - 10, y);
    // readouts
    U.add(panel(this, 4, 4, 196, 66, 'panel_dark'));
    const left = o2LeftMin(p);
    U.add(txt(this, 10, 9, `SUIT O2   ${hm(left)}`, { color: left < ISS.evaReserveMin.v ? C.red : left < 90 ? C.orange : C.green }));
    U.add(txt(this, 10, 21, `TIME OUT  ${hm(p.evaMin)}`, { color: C.white }));
    if (p.tool === 'power') U.add(txt(this, 10, 33, `TOOL BATTERY ${p.batteryPct}%`, { color: p.batteryPct > 30 ? C.white : C.orange }));
    U.add(txt(this, 10, 45, `SLIPS ${p.mistakes}   QUALITY ${Math.round(p.quality * 100)}%`, { color: C.text }));
    const prompt = this.stage === 'swap' ? `At the array: Enter to swap the power unit (${SWAP_MIN[p.tool!]} min).`
      : this.stage === 'unfold' ? `Enter to unfold the panel (${UNFOLD_MIN} min).`
      : this.stage === 'done' ? '' : `Press ${ARROWS[this.want]} to move (${this.moveMin()} min), or Enter for a careful move (+${CAREFUL_EXTRA} min).`;
    U.add(txt(this, W / 2, 200, prompt, { align: 'center', color: C.gold2, maxWidth: 420, size: 15 }));
    U.add(txt(this, W / 2, 182, this.stage === 'back' ? 'Heading back to the airlock' : this.stage === 'out' ? 'Heading out to the broken solar array' : '', { align: 'center', color: C.teal }));
    void H;
  }
}
