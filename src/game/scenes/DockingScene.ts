import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, panel, toast, txt, W, H } from '../ui/ui';
import { SpacecraftView } from '../components/SpacecraftView';
import { emergencyUI, showEmergency } from '../ui/emergency';
import * as Sim from '../../simulation/mission';
import { abortMission } from '../../simulation/mission';
import { advanceDock, DockState, nudge, newDock, DOCK_START_M } from '../../simulation/docking';
import { issOf } from '../../simulation/issDeck';
import { ISS } from '../../data/missionConfig';
import { specOf } from '../../simulation/specModel';
import { fmt, kgToLb, lbToKg } from '../../simulation/units';
import { learned } from '../ui/learned';

const TIME_SCALE = 8; // sim seconds per real second at 1x
const PORT_X = 400, PORT_Y = 110, PX_PER_M = 2.4;

/**
 * E3: dock with the ISS. Up / Right = speed up the approach, Down / Left = slow it, A = autopilot
 * (uses more fuel), 1 / 2 / 4 = speed-up while on autopilot. Contact must be 0.1 m/s or less.
 */
export class DockingScene extends Phaser.Scene {
  st!: DockState;
  acc = 0; speed = 1; auto = false; cardsDone = false; finished = false;
  craft!: SpacecraftView;
  hud!: Phaser.GameObjects.BitmapText;
  msg!: Phaser.GameObjects.BitmapText;
  autoBtn!: Button; speedBtns: Button[] = [];
  thrusters = 12;
  constructor() { super('Docking'); }
  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s) { fadeTo(this, 'Title'); return; }
    this.acc = 0; this.speed = 1; this.auto = false; this.cardsDone = false; this.finished = false; this.speedBtns = [];
    this.thrusters = specOf(s.design).thrusterCount ?? 12;
    this.st = newDock(kgToLb(s.rcsFuelKg));
    audio.music('tension');
    this.add.image(0, 0, 'space_bg').setOrigin(0, 0);
    this.add.image(0, 0, 'stars_near').setOrigin(0, 0);
    this.add.image(60, 250, 'earth_big').setOrigin(0.5, 0.5).setScale(1.3).setAlpha(0.9);
    this.drawStation();
    this.craft = new SpacecraftView(this, 0, PORT_Y, s.design, 'csm');
    this.craft.setScale(0.55);
    panel(this, 4, 4, 168, 82, 'panel_dark');
    txt(this, 88, 8, 'DOCKING WITH THE ISS', { align: 'center', color: C.gold });
    this.hud = txt(this, 10, 20, '', { color: C.green });
    this.msg = txt(this, W / 2, 200, '', { align: 'center', color: C.gold2, maxWidth: 300 });
    txt(this, 8, H - 34, 'Up/Right faster  Down/Left slower  A autopilot', { color: C.dim });
    const nudgeBtn = (x: number, label: string, dir: 1 | -1) => new Button(this, x, H - 22, label, () => this.manual(dir), { w: 60, h: 18 });
    nudgeBtn(8, 'SLOWER', -1); nudgeBtn(72, 'FASTER', 1);
    this.autoBtn = new Button(this, W - 120, H - 22, 'AUTOPILOT', () => this.setAuto(!this.auto), { w: 66, h: 18, tooltip: 'Let the computer fly the approach (uses more fuel). Key A.' });
    [1, 2, 4].forEach((v, i) => { const b = new Button(this, W - 120 + i * 22, H - 44, `${v}x`, () => this.setSpeed(v), { w: 20, h: 18 }); b.setVisible(false); this.speedBtns.push(b); });
    new Button(this, W - 52, H - 22, 'ABORT', () => this.fail('Docking aborted by the crew.'), { w: 48, h: 18 });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.finished || emergencyUI.open) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') this.manual(1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') this.manual(-1);
      else if (e.key === 'a' || e.key === 'A') this.setAuto(!this.auto);
      else if (this.auto && (e.key === '1' || e.key === '2' || e.key === '4')) this.setSpeed(Number(e.key));
    });
    gearButton(this);
    crt(this);
    learned(this, 'orbits', 600); // rendezvous and docking: orbits shape everything
    toast(this, 'CAPCOM Sam', `Contact must be ${ISS.contactMaxMs.v} m/s or less. Every nudge uses thruster fuel.`, 'portrait_capcom', 4500);
    this.place();
  }
  drawStation() {
    const g = this.add.graphics();
    g.fillStyle(0x1a1626).fillRect(PORT_X + 4, PORT_Y - 60, 10, 120); // truss
    g.fillStyle(0xb9b3a2).fillRect(PORT_X + 5, PORT_Y - 59, 8, 118);
    for (const y of [-58, -30, 8, 36]) { g.fillStyle(0x1a1626).fillRect(PORT_X + 18, PORT_Y + y, 56, 22); g.fillStyle(0x2a4c98).fillRect(PORT_X + 19, PORT_Y + y + 1, 54, 20); g.fillStyle(0x6f9be0).fillRect(PORT_X + 19, PORT_Y + y + 1, 54, 2); }
    g.fillStyle(0x1a1626).fillRect(PORT_X - 2, PORT_Y - 12, 14, 24); g.fillStyle(0xe9e4d4).fillRect(PORT_X - 1, PORT_Y - 11, 12, 22); // module
    g.fillStyle(0x8a8478).fillRect(PORT_X - 8, PORT_Y - 7, 7, 14); // docking port
    g.fillStyle(0xffe27a).fillRect(PORT_X - 9, PORT_Y - 1, 2, 2); // lidar target
  }
  manual(dir: 1 | -1) {
    if (this.finished || emergencyUI.open) return;
    if (this.auto) this.setAuto(false); // taking the controls drops back to manual at 1x
    if (nudge(this.st, dir, this.thrusters, false, Math.random())) audio.sfx('move'); else audio.sfx('error');
  }
  setAuto(v: boolean) { this.auto = v; if (!v) this.setSpeed(1); this.speedBtns.forEach((b) => b.setVisible(v)); this.autoBtn.setSelected(v).setText(v ? 'AUTO: ON' : 'AUTOPILOT'); }
  setSpeed(v: number) { this.speed = this.auto ? v : 1; this.speedBtns.forEach((b, i) => b.setSelected([1, 2, 4][i] === this.speed)); }
  place() {
    const x = PORT_X - 9 - 62 - this.st.dist * PX_PER_M; // the capsule's nose is about 62 px ahead of its centre at this scale
    this.craft.setPosition(Math.max(-80, x), PORT_Y);
  }
  update(_t: number, dtMs: number) {
    const s = store.mission;
    if (!s || this.finished) return;
    if (!emergencyUI.open) {
      if (!this.cardsDone && this.st.dist < DOCK_START_M / 2) {
        this.cardsDone = true;
        if (Sim.triggerStage(s, 'docking')) { showEmergency(this, s, () => { this.st.fuelLb = Math.min(this.st.fuelLb, kgToLb(s.rcsFuelKg)); store.saveMission(); if (s.phase === 'COMPLETE' || s.crewLost) this.end(); }); return; }
      }
      this.acc = advanceDock(this.st, this.acc, Math.min(0.1, dtMs / 1000), TIME_SCALE * (this.auto ? this.speed : 1), this.auto, this.thrusters);
    }
    this.place();
    const st = this.st, ok = st.v <= ISS.contactMaxMs.v;
    this.hud.setText(`DISTANCE ${st.dist.toFixed(1).padStart(6)} m\nCLOSING  ${st.v.toFixed(2).padStart(6)} m/s ${ok ? '✓' : '×'}\nFUEL     ${fmt(st.fuelLb).padStart(6)} lb\nTHRUSTERS ${this.thrusters}${this.thrusters < 8 ? ' (TOO FEW!)' : ''}\n${this.auto ? `AUTOPILOT ${this.speed}x` : 'MANUAL'}  CONTACTS ${st.contacts}`).setTint(ok ? C.green : C.orange);
    if (st.message) this.msg.setText(st.message);
    if (st.docked) this.dock();
    else if (st.failed) this.fail(st.message);
  }
  dock() {
    const s = store.mission!;
    this.finished = true;
    const p = issOf(s);
    p.docked = true; p.contacts = this.st.contacts; p.dockFuelLb = this.st.usedLb;
    s.rcsFuelKg = lbToKg(Math.max(0, this.st.fuelLb));
    Sim.log(s, `Docked with the ISS at ${this.st.v.toFixed(2)} m/s using ${fmt(this.st.usedLb)} lb of thruster fuel.`, 'good');
    store.saveMission();
    audio.sfx('success');
    toast(this, 'ISS Crew', 'Hard dock! Welcome aboard. The spacewalk team is suiting up.', 'portrait_capcom', 2600);
    this.time.delayedCall(2200, () => fadeTo(this, 'Spacewalk'));
  }
  fail(why: string) {
    if (this.finished) return;
    const s = store.mission!;
    this.finished = true;
    abortMission(s, `${why} The crew came home without docking.`);
    store.saveMission();
    audio.sfx('fail');
    this.msg.setText(why);
    this.time.delayedCall(1800, () => this.end());
  }
  end() { const s = store.mission!; fadeTo(this, s.phase === 'ENTRY' ? 'Return' : 'Report'); }
}
