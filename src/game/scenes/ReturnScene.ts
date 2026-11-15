import Phaser from 'phaser';
import { fmtLb } from '../../simulation/units';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, Dialogue, fadeIn, fadeTo, gearButton, H, panel, toast, txt, W } from '../ui/ui';
import * as Sim from '../../simulation/mission';
import { missionOf } from '../../data/missionConfig';

/** Earth entry, parachutes, Pacific splashdown and an Oakland homecoming. */
export class ReturnScene extends Phaser.Scene {
  t = 0;
  stage = 0;
  ok = true;
  hud!: Phaser.GameObjects.BitmapText;
  capsule!: Phaser.GameObjects.Image;
  plasma!: Phaser.GameObjects.Sprite;
  skipped = false;
  constructor() { super('Return'); }
  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s) { fadeTo(this, 'Title'); return; }
    this.t = 0; this.stage = 0; this.skipped = false;
    if (s.phase === 'ENTRY') { const r = Sim.performEntry(s); this.ok = r.ok; store.saveMission(); } else this.ok = !s.crewLost;
    audio.music('tension');
    this.add.image(0, 0, 'reentry').setOrigin(0, 0);
    this.add.image(0, 0, 'stars_far').setOrigin(0, 0).setAlpha(0.6);
    this.capsule = this.add.image(240, 110, 'capsule').setAngle(-35);
    this.plasma = this.add.sprite(232, 118, 'plasma').play('plasma').setAngle(-35).setScale(1.1);
    panel(this, 4, 4, 150, 54, 'panel_dark');
    this.hud = txt(this, 10, 9, '', { color: C.green });
    new Button(this, W - 92, 4, 'SKIP ▶▶', () => this.skip(), { w: 52 }).setDepth(1200);
    gearButton(this);
    crt(this);
    audio.loop('wind', 0.7);
    const iss = missionOf(s.design) === 'iss';
    toast(this, 'CAPCOM Sam', iss ? 'Entry at 17,500 mph from low orbit. A few minutes of radio blackout.' : 'Entry at 24,500 mph from the Moon. About four minutes of radio blackout.', 'portrait_capcom', 4500);
  }
  update(_t: number, dtMs: number) {
    if (this.stage > 1 || this.skipped) return;
    const dt = dtMs / 1000;
    this.t += dt;
    const t = this.t;
    if (this.stage === 0) {
      const f = Math.min(1, t / 9);
      const vel = 11.0 * (1 - f) + 0.15 * f;
      const g = 6.4 * Math.sin(Math.min(1, f * 1.3) * Math.PI);
      const temp = 2700 * Math.sin(Math.min(1, f * 1.2) * Math.PI);
      const blackout = t > 1.5 && t < 6;
      this.hud.setText(`VEL  ${vel.toFixed(2)} km/s\nG    ${g.toFixed(1)} g\nSHIELD ${Math.round(temp)} °C\n${blackout ? 'COMM BLACKOUT' : 'COMM LINK OK'}`).setTint(blackout ? C.orange : C.green);
      this.capsule.x = 240 + Math.sin(t * 30) * (store.settings.screenShake ? 1 : 0);
      this.plasma.setAlpha(Math.max(0, Math.sin(Math.min(1, f * 1.15) * Math.PI)));
      if (!this.ok && t > 5) { this.stage = 2; audio.loop('wind', 0); audio.sfx('fail'); if (!store.settings.reduceMotion) this.cameras.main.flash(500, 255, 120, 60); this.time.delayedCall(1200, () => fadeTo(this, 'Report')); return; }
      if (t > 9) { this.stage = 1; audio.loop('wind', 0.2); this.chutes(); }
    }
  }
  chutes() {
    audio.sfx('stage');
    const drogue = this.add.image(this.capsule.x, this.capsule.y - 30, 'drogue');
    this.tweens.add({ targets: this.capsule, angle: 0, duration: 600 });
    toast(this, 'Recovery', 'Drogue chutes out! Main parachutes in 3... 2... 1...', 'portrait_capcom', 2500);
    this.time.delayedCall(2200, () => {
      drogue.destroy();
      this.cameras.main.fadeOut(300, 255, 255, 255);
      this.cameras.main.once('camerafadeoutcomplete', () => this.ocean());
    });
  }
  ocean() {
    this.children.removeAll(true);
    this.cameras.main.fadeIn(400, 255, 255, 255);
    audio.loop('wind', 0);
    this.add.image(0, 0, 'ocean').setOrigin(0, 0);
    const ship = this.add.image(W + 60, 168, 'ship').setOrigin(0.5, 1);
    const cap = this.add.container(220, -40);
    cap.add([this.add.image(0, -40, 'chutes'), this.add.image(0, 0, 'capsule').setScale(0.6)]);
    this.tweens.add({ targets: cap, y: 172, duration: 4200, ease: 'Sine.Out', onComplete: () => {
      cap.destroy();
      const fl = this.add.image(220, 182, 'capsule_float');
      this.add.sprite(220, 186, 'splash').setOrigin(0.5, 1).play('splash');
      this.tweens.add({ targets: fl, y: 184, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      audio.sfx('land');
      audio.music('victory');
      txt(this, W / 2, 40, 'SPLASHDOWN!', { align: 'center', color: C.gold2, scale: 3 });
      txt(this, W / 2, 72, 'Pacific Ocean, 120 km off the California coast', { align: 'center', color: C.white });
      this.tweens.add({ targets: ship, x: 360, duration: 3000, ease: 'Sine.Out' });
      this.time.delayedCall(3800, () => { this.cameras.main.fadeOut(500); this.cameras.main.once('camerafadeoutcomplete', () => this.homecoming()); });
    } });
    new Button(this, W - 92, 4, 'SKIP ▶▶', () => this.skip(), { w: 52 }).setDepth(1200);
    crt(this);
  }
  homecoming() {
    this.children.removeAll(true);
    this.cameras.main.fadeIn(600);
    const s = store.mission!;
    audio.music('title');
    this.add.image(0, 0, 'sky_dusk').setOrigin(0, 0);
    this.add.image(-60, 0, 'skyline_dusk').setOrigin(0, 0);
    this.add.image(-500, 0, 'oak_street').setOrigin(0, 0);
    this.add.image(W / 2, 150, 'banner').setOrigin(0.5, 0);
    for (let i = 0; i < 12; i++) {
      const who = `town_${i % 4}`;
      const p = this.add.sprite(60 + i * 32 + (i % 2) * 6, 238, who).setOrigin(0.5, 1).setFlipX(i % 2 === 0).play(`${who}-wave`);
      p.anims.msPerFrame = 200 + i * 23;
    }
    const kai = this.add.sprite(W / 2, 238, 'kai_civ').setOrigin(0.5, 1).play('kai_civ-wave');
    void kai;
    for (let i = 0; i < 40; i++) {
      const c = this.add.rectangle(Phaser.Math.Between(0, W), Phaser.Math.Between(-200, 0), 2, 2, [C.gold, C.blue, C.red, C.green, C.white][i % 5]);
      this.tweens.add({ targets: c, y: H + 10, x: c.x + Phaser.Math.Between(-30, 30), duration: Phaser.Math.Between(3000, 6000), repeat: -1, delay: Phaser.Math.Between(0, 3000) });
    }
    const samples = Math.round(s.samplesAboardKg);
    const d = new Dialogue(this);
    d.play([
      ...(s.iss ? [
        { who: 'Auntie Dee', text: 'There she is! Commander Kai Alvarado, back from the space station! Did the solar panel work?', portrait: 'portrait_dee' },
        { who: 'Commander Kai', text: s.iss.panelFixed ? 'Full power again, Auntie Dee. The station crew says thank you.' : 'Not this time, Auntie Dee. We learned what to do better.', portrait: 'portrait_kai' },
      ] : [{ who: 'Auntie Dee', text: 'There she is! Commander Kai Alvarado, back from the Moon! So... did you bring my rock?', portrait: 'portrait_dee' }]),
      ...(s.iss ? [] : [{ who: 'Commander Kai', text: samples > 0 ? `We brought home ${fmtLb(s.samplesAboardKg)} of them, Auntie Dee. They go to the scientists first. But I saved you a photo of your plaque up there.` : 'No rocks this time, Auntie Dee. But we learned what to do better, and next time we will.', portrait: 'portrait_kai' }]),
      { who: 'Director Cole', text: 'Welcome home, Commander. Let us see how the mission scored. Every flight teaches the next one.', portrait: 'portrait_director' },
    ], () => fadeTo(this, 'Report'));
    new Button(this, W - 92, 4, 'SKIP ▶▶', () => fadeTo(this, 'Report'), { w: 52 }).setDepth(1200);
    crt(this);
  }
  skip() {
    if (this.skipped) return;
    this.skipped = true;
    audio.loop('wind', 0);
    fadeTo(this, 'Report');
  }
}
