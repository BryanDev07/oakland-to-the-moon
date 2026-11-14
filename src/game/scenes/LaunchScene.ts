import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, H, panel, toast, txt, W } from '../ui/ui';
import { LV_BY_ID } from '../../data/mission';
import * as Sim from '../../simulation/mission';
import type { Stage } from '../../simulation/deck';
import { showEmergency } from '../ui/emergency';
import { SpacecraftView } from '../components/SpacecraftView';

const SKY_H = 810, GROUND = 792;

export class LaunchScene extends Phaser.Scene {
  rocket!: Phaser.GameObjects.Container;
  s1!: Phaser.GameObjects.Image; s2!: Phaser.GameObjects.Image; las!: Phaser.GameObjects.Image;
  boosters: Phaser.GameObjects.Image[] = [];
  flames: Phaser.GameObjects.Sprite[] = [];
  hud!: Phaser.GameObjects.BitmapText;
  count!: Phaser.GameObjects.BitmapText;
  t = -10; // countdown seconds (scene time); liftoff at 0
  vy = 0; climb = 0;
  stage = 1;
  done = false;
  lvId = 'estuary';
  s1h = 0; s2h = 0;
  paused = false; launchChecked = false;
  constructor() { super('Launch'); }
  create() {
    fadeIn(this);
    audio.music('none');
    this.t = -10; this.vy = 0; this.climb = 0; this.stage = 1; this.done = false; this.boosters = []; this.flames = [];
    const m = store.mission;
    if (!m) { fadeTo(this, 'Hangar'); return; }
    this.lvId = m.design.plan.lv;
    this.cameras.main.setBounds(0, 0, W, SKY_H);
    this.cameras.main.scrollY = SKY_H - H;
    this.add.image(0, 0, 'sky_tall').setOrigin(0, 0);
    const clouds = this.add.image(0, 470, 'clouds').setOrigin(0, 0).setAlpha(0.85);
    this.add.image(0, 330, 'clouds').setOrigin(0, 0).setAlpha(0.5).setFlipX(true);
    this.tweens.add({ targets: clouds, x: -30, duration: 20000, yoyo: true, repeat: -1 });
    this.add.image(150, GROUND - 2, 'mast').setOrigin(0.5, 1);
    this.add.image(340, GROUND - 2, 'mast').setOrigin(0.5, 1);
    this.add.image(240, GROUND + 4, 'pad').setOrigin(0.5, 1);
    const tower = this.add.image(196, GROUND - 14, 'tower').setOrigin(0.5, 1);
    void tower;
    // rocket
    this.rocket = this.add.container(240, GROUND - 16);
    const keyS1 = `lv_${this.lvId}_s1`, keyS2 = `lv_${this.lvId}_s2`;
    this.s1 = this.add.image(0, 0, keyS1).setOrigin(0.5, 1);
    this.s1h = this.s1.height;
    this.s2 = this.add.image(0, -this.s1h + 4, keyS2).setOrigin(0.5, 1);
    this.s2h = this.s2.height;
    const capY = -this.s1h - this.s2h + 8;
    const cap = this.add.image(0, capY + 1, 'capsule_small').setOrigin(0.5, 1);
    this.las = this.add.image(0, capY - 12, 'las_small').setOrigin(0.5, 1);
    for (let i = 0; i < 3; i++) { const f = this.add.sprite((i - 1) * 7, -2, 'flame').setOrigin(0.5, 0).play('flame').setVisible(false); this.flames.push(f); }
    if (this.lvId === 'estuary') {
      for (const sx of [-1, 1]) {
        const b = this.add.image(sx * 18, 0, 'lv_estuary_booster').setOrigin(0.5, 1);
        const f = this.add.sprite(sx * 18, -2, 'flame').setOrigin(0.5, 0).play('flame').setVisible(false).setScale(0.8);
        this.boosters.push(b); this.flames.push(f);
      }
    }
    this.rocket.add([...this.flames, ...this.boosters, this.s1, this.s2, cap, this.las]);
    // HUD (fixed)
    panel(this, 4, 4, 150, 54, 'panel_dark').setScrollFactor(0);
    this.hud = txt(this, 10, 9, '', { color: C.green }).setScrollFactor(0);
    this.count = txt(this, W / 2, 70, '', { align: 'center', color: C.gold2, scale: 3 }).setScrollFactor(0).setDepth(100);
    txt(this, W - 6, H - 12, `${LV_BY_ID[this.lvId as 'estuary'].name} • ${m.design.plan.crew} crew aboard`, { align: 'right', color: C.dim }).setScrollFactor(0);
    new Button(this, W - 92, 4, 'SKIP ▶▶', () => this.finish(), { w: 52, tooltip: 'Skip the launch cinematic' }).setScrollFactor(0).setDepth(1200);
    gearButton(this);
    crt(this);
    const lines: [number, string, string][] = [
      [-9.5, 'Launch Control', 'TOWN-1, all stations report GO. Terminal count is under way.'],
      [-6.2, 'Commander Kai', 'Oakland, this one is for you. See you on the other side of the sky.'],
    ];
    for (const [at, who, text] of lines) this.time.delayedCall((at + 10) * 1000, () => toast(this, who, text, who.startsWith('Commander') ? 'portrait_kai_suit' : 'portrait_capcom', 3000));
    this.paused = false; this.launchChecked = false;
    this.runCards(['pad'], () => undefined); // emergency deck: pad card plays first
  }
  /** Play any scheduled emergency cards for these stages, pausing the cinematic while they are open. */
  runCards(stages: Stage[], then: () => void) {
    const m = store.mission!;
    for (const st of stages) if (Sim.triggerStage(m, st)) {
      this.paused = true;
      audio.loop('rumble', 0);
      showEmergency(this, m, () => {
        this.paused = false;
        store.saveMission();
        if (m.phase === 'COMPLETE' || m.crewLost) { this.done = true; fadeTo(this, 'Report'); } else this.runCards(stages, then);
      });
      return;
    }
    then();
  }
  smoke(x: number, y: number, spread: number) {
    const s = this.add.sprite(x + Phaser.Math.Between(-4, 4), y, 'smoke').setDepth(5).play('smoke');
    this.tweens.add({ targets: s, x: x + Phaser.Math.Between(-spread, spread), y: y + Phaser.Math.Between(-10, 6), scale: Phaser.Math.FloatBetween(1.2, 2.2), alpha: 0, duration: 1600, onComplete: () => s.destroy() });
  }
  update(_t: number, dtMs: number) {
    if (this.done || this.paused) return;
    if (!this.launchChecked && this.t > 6) { this.launchChecked = true; this.runCards(['launch'], () => undefined); if (this.paused) return; }
    const dt = dtMs / 1000;
    this.t += dt;
    const t = this.t;
    if (t < 0) {
      const n = Math.ceil(-t);
      if (this.count.text !== String(n)) { this.count.setText(String(n)); audio.sfx('beep'); }
      if (t > -4) { // ignition sequence
        if (!this.flames[0].visible) { audio.sfx('ignite'); this.flames.forEach((f) => f.setVisible(true).setScale(0.4)); }
        audio.loop('rumble', 0.4);
        if (Math.random() < 0.6) this.smoke(240, GROUND - 6, 90);
      }
    } else {
      if (this.count.text !== 'LIFTOFF!' && t < 2.5) { this.count.setText('LIFTOFF!'); audio.loop('rumble', 1); this.flames.forEach((f) => f.setScale(1, 1.4)); toast(this, 'Launch Control', 'Liftoff! TOWN-1 has cleared the tower. From the Town to the Stars!', 'portrait_capcom', 3500); }
      if (t > 2.5) this.count.setText('');
      // ascent profile in screen pixels
      const acc = 9 + t * 5;
      this.vy += acc * dt;
      this.climb += this.vy * dt;
      this.rocket.y = GROUND - 16 - this.climb;
      if (t < 3 && Math.random() < 0.8) this.smoke(240, GROUND - 6, 120);
      if (store.settings.screenShake && t < 6) this.cameras.main.shake(50, 0.004 * Math.max(0, 1 - t / 6), true);
      const target = this.rocket.y - 170;
      this.cameras.main.scrollY = Phaser.Math.Clamp(Math.min(this.cameras.main.scrollY, target), 0, SKY_H - H);
      // staging events
      if (this.stage === 1 && this.boosters.length && this.climb > 260) this.dropBoosters();
      if (this.stage <= 2 && this.climb > 520) this.dropStage1();
      if (this.stage === 3 && this.climb > 600) this.jettisonLAS();
      if (this.climb > 900) this.toOrbit();
      // the rocket flies off the top of the sky image: keep it in view by parallax trick
      if (this.rocket.y < 140) { this.rocket.y = 140; }
    }
    const tm = Math.max(0, t) * 36;
    const f = Math.min(1, tm / 520);
    const alt = 185 * Math.pow(f, 1.4), vel = 7800 * Math.pow(f, 1.25) + (t > 0 ? 400 * f : 0);
    const stageName = this.stage === 1 ? (this.boosters.length ? 'CORE + BOOSTERS' : 'FIRST STAGE') : this.stage === 2 ? 'FIRST STAGE' : 'UPPER STAGE';
    this.hud.setText(`T${t < 0 ? '-' : '+'}${String(Math.floor(Math.abs(tm) / 60)).padStart(2, '0')}:${String(Math.floor(Math.abs(t < 0 ? t : tm)) % 60).padStart(2, '0')}\nALT ${alt.toFixed(1)} km\nVEL ${Math.round(vel)} m/s\n${stageName}`);
  }
  dropBoosters() {
    this.stage = 2;
    audio.sfx('stage');
    toast(this, 'Flight Dynamics', 'Booster separation confirmed. Strap-ons are empty: dropping dead weight.', 'portrait_capcom', 2800);
    for (const b of this.boosters) {
      const wx = this.rocket.x + b.x, wy = this.rocket.y + b.y;
      this.rocket.remove(b);
      b.setPosition(wx, wy); this.add.existing(b);
      this.tweens.add({ targets: b, x: wx + (b.x < 240 ? -50 : 50), y: wy + 260, angle: b.x < 240 ? -60 : 60, duration: 2600, onComplete: () => b.destroy() });
    }
    this.flames.slice(3).forEach((f) => f.destroy());
    this.flames = this.flames.slice(0, 3);
  }
  dropStage1() {
    this.stage = 3;
    audio.sfx('stage');
    toast(this, 'Flight Dynamics', 'Staging! First stage separation, upper stage ignition. Each stage dropped makes the rest lighter.', 'portrait_capcom', 3000);
    const wx = this.rocket.x, wy = this.rocket.y;
    this.rocket.remove(this.s1);
    this.s1.setPosition(wx, wy); this.add.existing(this.s1);
    this.tweens.add({ targets: this.s1, y: wy + 300, angle: 25, alpha: 0.4, duration: 3000, onComplete: () => this.s1.destroy() });
    // move flames to bottom of stage 2
    this.flames.forEach((f, i) => { f.setPosition((i - 1) * 4, -this.s1h + 6).setScale(0.6, 1); if (i !== 1) f.setVisible(false); });
  }
  jettisonLAS() {
    this.stage = 4;
    const wx = this.rocket.x + this.las.x, wy = this.rocket.y + this.las.y;
    this.rocket.remove(this.las);
    this.las.setPosition(wx, wy); this.add.existing(this.las);
    const f = this.add.sprite(wx, wy, 'flame').setScale(0.3).play('flame');
    this.tweens.add({ targets: [this.las, f], x: wx + 70, y: wy - 120, duration: 1500, onComplete: () => { this.las.destroy(); f.destroy(); } });
    toast(this, 'Flight Dynamics', 'Launch abort tower jettisoned. The crew no longer needs the escape system.', 'portrait_capcom', 2600);
  }
  toOrbit() {
    if (this.done) return;
    this.done = true;
    audio.loop('rumble', 0);
    this.cameras.main.fadeOut(500, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => this.tliCinematic());
  }
  /** Short TLI vignette in space, then on to mission operations. */
  tliCinematic() {
    this.children.removeAll(true);
    this.cameras.main.setBounds(0, 0, W, H).setScroll(0, 0);
    this.cameras.main.fadeIn(600, 255, 255, 255);
    this.add.image(0, 0, 'space_bg').setOrigin(0, 0);
    this.add.image(0, 0, 'stars_near').setOrigin(0, 0);
    const earth = this.add.image(-30, 120, 'earth_big').setOrigin(0, 0);
    this.tweens.add({ targets: earth, x: -60, y: 150, duration: 6000 });
    const m = store.mission!;
    const sc = new SpacecraftView(this, 300, 110, m.design, 'flight');
    const flame = this.add.sprite(300 - 140, 110, 'flame').setAngle(90).setOrigin(0.5, 0).play('flame').setScale(0.8, 1.6);
    this.tweens.add({ targets: [sc, flame], x: '+=40', duration: 6000 });
    audio.loop('rumble', 0.3);
    panel(this, 100, 196, 280, 50, 'dialog');
    txt(this, 240, 202, 'TRANS-LUNAR INJECTION', { align: 'center', color: C.gold2 });
    txt(this, 240, 214, m.flags.tliTrimDv > 0
      ? `Upper stage cut off early (${m.flags.tliTrimDv} m/s short). The service module made up the difference using propellant.`
      : 'Upper stage burn complete. TOWN-1 is on a three-day coast to the Moon.', { align: 'center', maxWidth: 260, color: m.flags.tliTrimDv > 0 ? C.orange : C.white });
    if (m.flags.tliTrimDv > 0) audio.sfx('warn');
    this.time.delayedCall(4200, () => { audio.loop('rumble', 0); store.markSeen('launch'); fadeTo(this, 'Ops'); });
    new Button(this, W - 92, 4, 'SKIP ▶▶', () => { audio.loop('rumble', 0); fadeTo(this, 'Ops'); }, { w: 52 }).setDepth(1200);
    crt(this);
  }
  finish() {
    if (this.paused) return; // an emergency is open
    audio.loop('rumble', 0);
    if (!this.done) { this.runCards(['launch', 'earthOrbit'], () => { if (this.done) return; this.done = true; this.tliCinematic(); }); } else fadeTo(this, 'Ops');
  }
}
