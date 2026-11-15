import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, H, Meter, modal, panel, toast, txt, W } from '../ui/ui';
import * as Sim from '../../simulation/mission';
import { abortLanding, agl, autopilot, createLanding, inSafeZone, LandingSim, makeTerrain, stepLanding, Terrain, TERRAIN_STEP, heightAt } from '../../simulation/landing';
import { MOON_G } from '../../simulation/constants';
import { massFlow } from '../../simulation/rocket';
import { SITE_BY_ID } from '../../data/mission';
import { showEmergency } from '../ui/emergency';
import { fmtLb } from '../../simulation/units';

const PX = 3; // pixels per metre
const BASE = 1750; // screen y of terrain height 0
const REG = ['#1e1e26', '#2c2c36', '#3c3c46', '#4e4e58', '#64646c', '#7c7c84', '#96969c', '#b2b2b6', '#cfcfd0'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class LandingScene extends Phaser.Scene {
  terrain!: Terrain;
  L!: LandingSim;
  lander!: Phaser.GameObjects.Container;
  flame!: Phaser.GameObjects.Sprite;
  dust!: Phaser.GameObjects.Sprite;
  hud!: Phaser.GameObjects.BitmapText;
  msg!: Phaser.GameObjects.BitmapText;
  fuel!: Meter; thr!: Meter;
  mini!: Phaser.GameObjects.Graphics;
  hazardG!: Phaser.GameObjects.Graphics;
  auto = false;
  started = false;
  finished = false;
  acc = 0;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  cmd = { throttle: 0.4, tilt: 0 };
  hold = { up: false, left: false, right: false };
  autoBtn!: Button;
  snapshot = ''; // mission state at the start of the approach (for a retry after a crash)
  constructor() { super('Landing'); }

  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s || s.phase !== 'DESCENT') { fadeTo(this, s ? 'Ops' : 'Title'); return; }
    this.started = false; this.finished = false; this.auto = false; this.acc = 0; this.cmd = { throttle: 0.4, tilt: 0 };
    // emergency deck: landing cards play before the approach (restart to pick up any fuel change)
    if (Sim.triggerStage(s, 'landing')) {
      showEmergency(this, s, () => { store.saveMission(); if (s.phase === 'DESCENT') this.scene.restart(); else fadeTo(this, s.crewLost || s.phase === 'COMPLETE' ? 'Report' : 'Ops'); });
      return;
    }
    audio.music('tension');
    this.snapshot = JSON.stringify(s);
    const ap = Sim.approachState(s);
    this.terrain = makeTerrain(s.seed, ap.hazard);
    this.L = createLanding(this.terrain, ap);
    const worldW = this.terrain.width * PX;
    this.cameras.main.setBounds(0, 0, worldW, BASE + 40);
    // sky
    this.add.rectangle(0, 0, W, H, 0x04030c).setOrigin(0, 0).setScrollFactor(0);
    this.add.tileSprite(0, 0, W, H, 'stars_far').setOrigin(0, 0).setScrollFactor(0);
    this.add.image(W - 36, 76, 'earth_small').setScrollFactor(0);
    this.drawMountains(worldW);
    this.drawTerrain();
    for (const b of this.terrain.boulders) {
      const k = b.r < 1.8 ? 'boulder_0' : b.r < 2.8 ? 'boulder_1' : 'boulder_2';
      this.add.image(b.x * PX, this.wy(heightAt(this.terrain, b.x)) + 2, k).setOrigin(0.5, 1);
    }
    this.hazardG = this.add.graphics();
    // lander
    const key = s.design.slots.lander === 'lander_path' ? 'lander_path' : 'lander_scout';
    this.lander = this.add.container(0, 0);
    const li = this.add.image(0, 0, key).setOrigin(0.5, 1).setScale(0.5);
    this.flame = this.add.sprite(0, -2, 'flame').setOrigin(0.5, 0).play('flame').setScale(0.6, 0.6);
    this.lander.add([this.flame, li]);
    this.dust = this.add.sprite(0, 0, 'dust').setOrigin(0.5, 1).play('dust').setVisible(false).setScale(2, 1.5);
    this.cameras.main.startFollow(this.lander, false, 0.15, 0.15, 0, 20);
    // HUD
    panel(this, 2, 2, 132, 98, 'panel_dark').setScrollFactor(0);
    txt(this, 8, 7, 'POWERED DESCENT', { color: C.gold }).setScrollFactor(0);
    this.hud = txt(this, 8, 19, '', { color: C.green }).setScrollFactor(0);
    this.fuel = new Meter(this, 8, 62, 120, 'FUEL', 'fuel').setScrollFactor(0);
    this.thr = new Meter(this, 8, 80, 120, 'THROTTLE', 'engine').setScrollFactor(0);
    panel(this, W - 164, 2, 162, 50, 'panel_dark').setScrollFactor(0);
    this.mini = this.add.graphics().setScrollFactor(0);
    this.msg = txt(this, W / 2, 106, '', { align: 'center', color: C.gold2, maxWidth: 300 }).setScrollFactor(0).setDepth(50);
    // controls (mouse-friendly hold buttons)
    const hb = (x: number, label: string, k: 'up' | 'left' | 'right', w = 40) => {
      const b = new Button(this, x, H - 24, label, () => undefined, { w, h: 20 });
      b.setScrollFactor(0);
      b.bg.on('pointerdown', () => { this.hold[k] = true; if (this.auto) this.setAuto(false); });
      b.bg.on('pointerup', () => { this.hold[k] = false; });
      b.bg.on('pointerout', () => { this.hold[k] = false; });
      return b;
    };
    hb(4, '◀ TILT', 'left', 46); hb(52, 'THRUST', 'up', 52); hb(106, 'TILT ▶', 'right', 46);
    this.autoBtn = new Button(this, W - 120, H - 24, 'AUTOPILOT', () => this.setAuto(!this.auto), { w: 66, h: 20, tooltip: 'Let the guidance computer fly (key A)' }).setScrollFactor(0) as Button;
    new Button(this, W - 52, H - 24, 'ABORT', () => this.abort(), { w: 48, h: 20, tooltip: 'Fire the ascent stage back to orbit (key X)' }).setScrollFactor(0);
    txt(this, 94, H - 36, '↑/W/SPACE thrust  ↓/S less  ← → tilt', { align: 'center', color: C.dim }).setScrollFactor(0);
    this.keys = this.input.keyboard!.addKeys('UP,DOWN,LEFT,RIGHT,W,S,A,D,SPACE,X') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on('keydown-A', () => this.started && this.setAuto(!this.auto));
    this.input.keyboard?.on('keydown-X', () => this.abort());
    gearButton(this);
    crt(this);
    this.place();
    // choose control mode
    const site = SITE_BY_ID[s.design.plan.site];
    const trn = ap.trn;
    const hoverS = ap.propKg / massFlow(ap.massKg * MOON_G, ap.ispS);
    modal(this, {
      title: 'FINAL APPROACH — YOU HAVE CONTROL',
      text: `Automatic braking is complete: 520 m above ${site.name}.\nPropellant for the approach: ${fmtLb(ap.propKg)} (≈${Math.round(hoverS)} s of hover).\n${trn ? 'Terrain-relative navigation is mapping hazards: SAFE ZONES are marked in green.' : 'No hazard lidar: you will only spot boulders below ~110 m. Look for flat ground!'}\nTouch down under 3 m/s on flat ground.`,
      options: [{ label: 'Fly it myself', detail: 'Thrust to slow down, tilt to move sideways.' }, { label: 'Engage autopilot', detail: 'Guidance flies; take over any time.' }],
      onChoose: (i) => { this.started = true; this.setAuto(i === 1); audio.loop('thrust', 0.4); toast(this, 'CAPCOM Sam', 'You are GO for landing. Watch your vertical speed and fuel.', 'portrait_capcom', 3500); },
    });
  }

  wy(h: number) { return BASE - h * PX; }

  drawMountains(worldW: number) {
    const w = Math.ceil(worldW * 0.3 + W);
    if (this.textures.exists('mtn')) this.textures.remove('mtn');
    const tex = this.textures.createCanvas('mtn', w, 120)!;
    const ctx = tex.getContext();
    for (let x = 0; x < w; x++) {
      const h = 40 + Math.sin(x * 0.011) * 18 + Math.sin(x * 0.037 + 1) * 9 + Math.sin(x * 0.13) * 3;
      for (let y = Math.floor(120 - h); y < 120; y++) {
        const t = (y - (120 - h)) / h;
        ctx.fillStyle = REG[Math.min(8, Math.max(0, Math.floor((0.32 - t * 0.3) * 8 + BAYER[(y & 3) * 4 + (x & 3)])))];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    tex.refresh();
    this.add.image(0, H - 118, 'mtn').setOrigin(0, 0).setScrollFactor(0.3, 0.02).setAlpha(0.8);
  }

  drawTerrain() {
    const t = this.terrain;
    const w = t.width * PX, top = BASE - 60 * PX, h = BASE + 40 - top;
    if (this.textures.exists('terrain')) this.textures.remove('terrain');
    const tex = this.textures.createCanvas('terrain', w, h)!;
    const ctx = tex.getContext();
    for (let x = 0; x < w; x++) {
      const m = x / PX;
      const hm = heightAt(t, m);
      const sy = Math.round(this.wy(hm) - top);
      const slope = (heightAt(t, m + 1) - heightAt(t, m - 1)) / 2;
      for (let y = Math.max(0, sy); y < h; y++) {
        const depth = (y - sy) / 60;
        let v = 0.62 - depth * 0.5 + slope * -0.35 + (((x * 13 + y * 7) % 17) / 17 - 0.5) * 0.18;
        if (y - sy < 2) v += 0.18;
        const idx = Math.min(8, Math.max(0, Math.floor(v * 8 + BAYER[(y & 3) * 4 + (x & 3)])));
        ctx.fillStyle = REG[idx];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    tex.refresh();
    this.add.image(0, top, 'terrain').setOrigin(0, 0);
  }

  setAuto(v: boolean) {
    this.auto = v;
    this.autoBtn.setSelected(v).setText(v ? 'AUTO: ON' : 'AUTOPILOT');
    audio.sfx(v ? 'beep' : 'move');
  }

  abort() {
    if (!this.started || this.finished) return;
    if (!abortLanding(this.L, this.terrain)) { toast(this, 'Lander', 'Too low to abort safely!', 'portrait_kai_suit', 2000); return; }
  }

  place() {
    const L = this.L;
    this.lander.setPosition(L.x * PX, this.wy(L.y));
    this.lander.setRotation(L.tilt);
  }

  update(_t: number, dtMs: number) {
    if (!this.started || this.finished) { this.place(); return; }
    const L = this.L, T = this.terrain;
    const dt = Math.min(0.1, dtMs / 1000);
    // inputs
    const k = this.keys;
    const manualInput = k.UP.isDown || k.W.isDown || k.SPACE.isDown || k.DOWN.isDown || k.S.isDown || k.LEFT.isDown || k.RIGHT.isDown || k.D.isDown || this.hold.up || this.hold.left || this.hold.right;
    if (manualInput && this.auto) this.setAuto(false);
    if (k.UP.isDown || k.W.isDown) this.cmd.throttle = Math.min(1, this.cmd.throttle + 0.9 * dt);
    if (k.DOWN.isDown || k.S.isDown) this.cmd.throttle = Math.max(0, this.cmd.throttle - 0.9 * dt);
    const full = k.SPACE.isDown || this.hold.up;
    this.cmd.tilt = (k.LEFT.isDown || this.hold.left ? -1 : 0) + (k.RIGHT.isDown || k.D.isDown || this.hold.right ? 1 : 0);
    this.acc += dt;
    while (this.acc >= 1 / 30 && !L.done) {
      const inp = this.auto ? autopilot(L, T) : { throttle: full ? 1 : this.cmd.throttle, tilt: this.cmd.tilt };
      if (this.auto) this.cmd.throttle = inp.throttle;
      stepLanding(L, T, inp);
      this.acc -= 1 / 30;
    }
    this.place();
    const h = agl(L, T);
    this.flame.setVisible(L.propKg > 0 && L.throttle > 0.03).setScale(0.35 + L.throttle * 0.4, 0.3 + L.throttle * 0.9);
    audio.loop('thrust', L.propKg > 0 ? 0.15 + L.throttle * 0.6 : 0);
    const dustOn = h < 30 && L.throttle > 0.1 && L.propKg > 0;
    this.dust.setVisible(dustOn).setPosition(L.x * PX, this.wy(heightAt(T, L.x)) + 2).setAlpha(Math.max(0, 1 - h / 30));
    // hazards
    const g = this.hazardG; g.clear();
    if (L.trn || h < 110) {
      if (L.trn) for (const z of T.safeZones) { g.fillStyle(0x7fbc58, 0.5).fillRect(z.x0 * PX, this.wy(heightAt(T, (z.x0 + z.x1) / 2)) + 3, (z.x1 - z.x0) * PX, 2); }
      for (const b of T.boulders) if (Math.abs(b.x - L.x) < 120) { g.lineStyle(1, 0xee6448, 0.8 + 0.2 * Math.sin(this.time.now / 100)).strokeRect(b.x * PX - b.r * PX, this.wy(heightAt(T, b.x)) - b.r * PX * 2, b.r * PX * 2, b.r * PX * 2); }
    }
    // target marker (autopilot)
    if (this.auto) { const tx = L.target * PX, ty = this.wy(heightAt(T, L.target)); g.lineStyle(1, 0xffe27a, 1).strokeRect(tx - 6, ty - 14, 12, 12); }
    // HUD
    const vs = L.vy, hs = L.vx;
    const hoverS = L.propKg / massFlow(L.massKg * MOON_G, L.ispS);
    const vsWarn = vs < -Math.max(3, h * 0.15) ? ' !' : '';
    this.hud.setText(`ALT ${h.toFixed(0).padStart(4)} m\nV/S ${vs.toFixed(1).padStart(5)} m/s${vsWarn}\nH/S ${hs.toFixed(1).padStart(5)} m/s\n${this.auto ? 'AUTOPILOT' : 'MANUAL'}  ${L.trn ? 'TRN: ON' : 'TRN: N/A'}`);
    this.fuel.set(L.propKg / Math.max(1, L.propStartKg), `${fmtLb(L.propKg)} · ${Math.round(hoverS)} s`); // descent fuel in lb
    this.thr.set(L.throttle, `${Math.round(L.throttle * 100)}%`, C.blue);
    // call-outs
    let m = '';
    if (h < 120 && !L.trn && !inSafeZone(T, L.x) && Math.floor(this.time.now / 500) % 2) m = 'BOULDERS BELOW: TRANSLATE TO FLAT GROUND';
    if (hoverS < 15 && L.propKg > 0) m = hoverS < 6 ? 'FUEL CRITICAL!' : `LOW FUEL: ${Math.round(hoverS)} SECONDS`;
    if (vs < -8 && h < 80) m = 'SINK RATE! MORE THRUST!';
    this.msg.setText(m).setTint(m.includes('FUEL') || m.includes('SINK') ? C.red : C.gold2);
    // minimap
    this.drawMini();
    if (L.done) this.finish();
  }

  drawMini() {
    const g = this.mini, T = this.terrain, L = this.L;
    g.clear();
    const x0 = W - 160, y0 = 8, w = 154, hh = 40;
    const sx = w / T.width;
    g.fillStyle(0x080a1e).fillRect(x0, y0, w, hh);
    for (let i = 0; i < T.heights.length; i += 4) { const x = x0 + i * TERRAIN_STEP * sx; const y = y0 + hh - 6 - T.heights[i] * 0.3; g.fillStyle(0x7c7c84).fillRect(Math.round(x), Math.round(y), 1, Math.max(1, Math.round(y0 + hh - y))); }
    if (L.trn) for (const z of T.safeZones) g.fillStyle(0x7fbc58).fillRect(Math.round(x0 + z.x0 * sx), y0 + hh - 3, Math.max(1, Math.round((z.x1 - z.x0) * sx)), 2);
    const ly = y0 + Math.max(0, Math.min(hh - 4, hh - 6 - (L.y) * 0.06));
    g.fillStyle(0xffe27a).fillRect(Math.round(x0 + L.x * sx) - 1, Math.round(ly) - 1, 3, 3);
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    audio.loop('thrust', 0);
    const L = this.L;
    const s = store.mission!;
    const outcome = L.outcome as 'soft' | 'hard' | 'abort' | 'crash';
    if (outcome === 'soft' || outcome === 'hard') { audio.sfx('land'); this.flame.setVisible(false); this.dust.setVisible(false); if (store.settings.screenShake) this.cameras.main.shake(300, outcome === 'hard' ? 0.012 : 0.004); }
    if (outcome === 'crash') { this.crash(); return; } // debris, then retry or accept
    if (outcome === 'abort') { audio.sfx('stage'); this.flyAscent(); }
    if (outcome === 'soft') audio.sfx('success');
    Sim.applyLanding(s, outcome, L.vImpact, L.propKg);
    store.saveMission();
    const titles = { soft: 'TOUCHDOWN! THE TOWN HAS LANDED!', hard: 'HARD LANDING', abort: 'LANDING ABORTED', crash: 'LANDING FAILURE' };
    const texts = {
      soft: `Touchdown at ${L.vImpact.toFixed(1)} m/s with ${fmtLb(L.propKg)} of propellant left. ${L.trn ? 'The hazard lidar found a safe spot.' : 'Nice flying on visual alone!'}`,
      hard: `Touchdown at ${L.vImpact.toFixed(1)} m/s${L.onHazard ? ' on rough ground' : ''}. The crew is shaken${s.landing.damaged ? ' and some equipment was damaged' : ''}. Lesson: slow down earlier, or let hazard detection pick flat ground.`,
      abort: 'The ascent stage fired and carried the crew back to orbit. Everyone is safe, but there will be no moonwalk. Lesson: more descent propellant margin buys hover time.',
      crash: `Impact at ${L.vImpact.toFixed(1)} m/s. The mission is lost. Lesson: keep vertical speed under 3 m/s near the ground, and trust the autopilot or abort when fuel runs low.`,
    };
    this.time.delayedCall(outcome === 'abort' ? 2200 : 1200, () => {
      modal(this, {
        title: titles[outcome], text: texts[outcome], alert: outcome !== 'soft',
        options: [{ label: outcome === 'soft' || outcome === 'hard' ? 'Step outside ▶' : outcome === 'abort' ? 'Return to orbit ▶' : 'Mission report ▶' }],
        onChoose: () => fadeTo(this, outcome === 'soft' || outcome === 'hard' ? 'Surface' : outcome === 'abort' ? 'Ops' : 'Report'),
      });
    });
  }

  /** Crash: the lander breaks apart, then the player may retry the landing (Easy free, Hard -100 points). */
  crash() {
    const L = this.L;
    const s = store.mission!;
    audio.sfx('fail');
    if (store.settings.screenShake) this.cameras.main.shake(700, 0.025);
    if (!store.settings.reduceMotion) this.cameras.main.flash(250, 255, 200, 140);
    const x = this.lander.x, gy = this.lander.y;
    this.lander.setVisible(false); this.flame.setVisible(false);
    this.msg.setText(''); // no flight warnings over the wreck
    this.add.ellipse(x, gy + 1, 30, 5, 0x1a1a22, 0.8); // scorch mark
    for (let i = 0; i < 3; i++) this.add.sprite(x + Phaser.Math.Between(-8, 8), gy, 'smoke').setOrigin(0.5, 1).setScale(1.5 + i * 0.5).play('smoke');
    this.add.sprite(x, gy + 2, 'dust').setOrigin(0.5, 1).setScale(3, 2).play('dust');
    const colors = [0xc8c8d0, 0xf4c63c, 0x8a8aa0, 0x3a3a48, 0xe8b030];
    for (let i = 0; i < 16; i++) {
      const piece = this.add.rectangle(x, gy - 4, Phaser.Math.Between(2, 4), Phaser.Math.Between(1, 3), colors[i % colors.length]).setDepth(20);
      const dx = Phaser.Math.Between(-60, 60), up = Phaser.Math.Between(12, 40), t = Phaser.Math.Between(350, 550);
      this.tweens.add({ targets: piece, x: x + dx * 0.5, y: gy - up, angle: Phaser.Math.Between(-360, 360), duration: t, ease: 'Quad.Out',
        onComplete: () => this.tweens.add({ targets: piece, x: x + dx, y: gy + Phaser.Math.Between(-1, 2), angle: Phaser.Math.Between(-720, 720), duration: t + 150, ease: 'Bounce.Out' }) });
    }
    const hard = s.design.spec?.difficulty === 'hard';
    const tries = s.em?.retries ?? 0;
    this.time.delayedCall(1700, () => modal(this, {
      title: 'LANDER LOST', alert: true,
      text: `Impact at ${L.vImpact.toFixed(1)} m/s. Lesson: keep vertical speed under 3 m/s near the ground, and trust the autopilot or abort when fuel runs low.\n${hard ? `Hard: each retry costs 100 mission points (retries so far: ${tries}).` : 'Easy: retries are free.'}`,
      options: [
        { label: 'Retry the landing', detail: hard ? `-100 mission points (retry #${tries + 1})` : 'Free on Easy' },
        { label: 'Accept the outcome: mission report', detail: 'The crew is lost; see what went wrong.' },
      ],
      onChoose: (i) => {
        if (i === 0) {
          // restore the mission as it was at the start of the approach, keeping the retry count
          const restored = JSON.parse(this.snapshot) as typeof s;
          restored.em = { ...(restored.em ?? s.em!), retries: tries + 1 };
          Sim.log(restored, `Landing retry #${tries + 1}${hard ? ' (-100 mission points)' : ''}.`, 'warn');
          store.mission = restored;
          store.saveMission();
          this.scene.restart();
          return;
        }
        Sim.applyLanding(s, 'crash', L.vImpact, L.propKg);
        store.saveMission();
        fadeTo(this, 'Report');
      },
    }));
  }

  flyAscent() {
    const s = store.mission!;
    const key = s.design.slots.lander === 'lander_path' ? 'ascent_path' : 'ascent_scout';
    const asc = this.add.image(this.lander.x, this.lander.y - 12, key).setOrigin(0.5, 1).setScale(0.5);
    const f = this.add.sprite(asc.x, asc.y, 'flame').setOrigin(0.5, 0).setScale(0.4, 0.8).play('flame');
    this.lander.setVisible(false);
    this.cameras.main.stopFollow();
    this.tweens.add({ targets: [asc, f], y: '-=400', duration: 2200, ease: 'Quad.In' });
  }
}
