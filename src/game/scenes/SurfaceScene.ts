import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, Dialogue, fadeIn, fadeTo, gearButton, H, iconFrame, Meter, modal, panel, toast, txt, W } from '../ui/ui';
import * as Sim from '../../simulation/mission';
import { showEmergency } from '../ui/emergency';
import { availableActivities, doActivity, restUntilNextDay, surfaceStatus } from '../../simulation/surface';
import type { MissionState } from '../../simulation/types';

const GROUND = 206;
const SPOT: Record<string, number> = { plaque: 176, broadcast: 150, seismo: 252, pancam: 214, retro: 292, regolith: 236, skylight: 312, ice: 314 };
const DEPLOY: Record<string, string> = { plaque: 'plaque', seismo: 'sci_seismo', retro: 'sci_retro', pancam: 'sci_pancam' };

export class SurfaceScene extends Phaser.Scene {
  s!: MissionState;
  kai!: Phaser.GameObjects.Sprite;
  landerImg!: Phaser.GameObjects.Image;
  list!: Phaser.GameObjects.Container;
  status!: Phaser.GameObjects.BitmapText;
  ascent!: Meter;
  battery!: Meter;
  busy = false;
  dlg!: Dialogue;
  logT!: Phaser.GameObjects.BitmapText;
  constructor() { super('Surface'); }

  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s || s.phase !== 'SURFACE') { fadeTo(this, s ? 'Ops' : 'Title'); return; }
    this.s = s;
    this.busy = false;
    audio.music('surface');
    const site = s.design.plan.site;
    this.add.image(0, 0, `surface_${site}`).setOrigin(0, 0);
    const lk = s.design.slots.lander === 'lander_path' ? 'lander_path' : 'lander_scout';
    this.landerImg = this.add.image(110, GROUND + 4, lk).setOrigin(0.5, 1);
    // already-deployed objects (on reload)
    for (const [id, n] of Object.entries(s.surface.done)) if (n && DEPLOY[id]) this.deploy(id, false);
    for (let i = 0; i < (s.surface.done.samples ?? 0); i++) this.add.image(196 + i * 14, GROUND + 2, 'footprint').setScale(2);
    this.kai = this.add.sprite(134, GROUND, 'kai_eva').setOrigin(0.5, 1).play('kai_eva-idle');
    // UI
    panel(this, 2, 2, 326, 30, 'panel_dark');
    this.status = txt(this, 8, 7, '', { color: C.text, maxWidth: 316 });
    panel(this, 330, 2, 148, 212, 'panel');
    txt(this, 404, 7, 'EVA ACTIVITIES', { align: 'center', color: C.gold });
    this.list = this.add.container(0, 0);
    panel(this, 2, 216, 476, 52, 'panel');
    this.ascent = new Meter(this, 8, 221, 150, 'ASCENT Δv', 'rocket');
    this.battery = new Meter(this, 8, 243, 150, 'LANDER BATTERY', 'battery');
    this.logT = txt(this, 168, 222, '', { color: C.dim, maxWidth: 160 });
    new Button(this, 336, 220, 'REST ▶ NEXT DAY', () => this.rest(), { w: 138, h: 20, tooltip: 'End this EVA day: sleep in the lander. Uses lander battery; crew recovers EVA time.' });
    new Button(this, 336, 243, 'LIFT OFF ▲', () => this.liftoff(), { w: 138, h: 20, style: 'go', tooltip: 'Leave the surface in the ascent stage and rendezvous with the capsule.' });
    gearButton(this);
    crt(this);
    this.dlg = new Dialogue(this);
    this.refresh();
    if (!s.surface.hoursOnSurface) {
      this.busy = true;
      this.kai.setPosition(126, GROUND - 14).setAlpha(0);
      this.tweens.add({ targets: this.kai, alpha: 1, y: GROUND, x: 140, duration: 1400, onComplete: () => {
        this.kai.play('kai_eva-cheer');
        audio.sfx('success');
        this.dlg.play([
          { who: 'Commander Kai', text: 'Hello, Oakland! Boots on the Moon. This one is for the Town, and for every kid who ever asked how far away it is.', portrait: 'portrait_kai_suit' },
          { who: 'CAPCOM Sam', text: 'We copy, Commander! The whole rec center is cheering. You have a busy EVA plan: spend your hours wisely, and remember the ascent stage has to lift every sample.', portrait: 'portrait_capcom' },
        ], () => { this.busy = false; this.kai.play('kai_eva-idle'); this.checkEmergency(); });
      } });
    }
    this.input.once('pointerdown', () => audio.unlock());
  }

  /** Emergency deck: surface cards play once the crew is outside. */
  checkEmergency() {
    const s = this.s;
    if (!Sim.triggerStage(s, 'surface')) return;
    this.busy = true;
    showEmergency(this, s, () => { this.busy = false; this.refresh(); if (s.crewLost || s.phase === 'COMPLETE') fadeTo(this, 'Report'); else this.checkEmergency(); });
  }

  deploy(id: string, anim = true) {
    const key = DEPLOY[id];
    if (!key) return;
    const x = SPOT[id] ?? 200;
    const im = this.add.image(x + 8, GROUND + 2, key).setOrigin(0.5, 1);
    if (anim) { im.setScale(0.2); this.tweens.add({ targets: im, scale: 1, duration: 300, ease: 'Back.Out' }); }
    this.children.bringToTop(this.kai);
  }

  refresh() {
    const s = this.s;
    const st = surfaceStatus(s);
    this.status.setText(`DAY ${s.surface.day}/${s.design.plan.stayDays}   EVA LEFT TODAY ${Math.max(0, st.evaLeftToday).toFixed(1)} h   SAMPLES ${s.surface.samplesKg}/${s.stats.lander.sampleCapacityKg} kg\nSCIENCE ${Object.values(s.surface.points).reduce((a, b) => a + b, 0).toFixed(0)} pts   CREW ${Math.round(s.condition)}%   ${s.landing.damaged ? 'DAMAGED: ' + s.landing.damaged.replace('sci_', '') : ''}`);
    const a = st.ascent;
    this.ascent.set(Math.min(1, a.dv / (a.req * 1.25)), `${Math.round(a.dv)} / ${a.req} m/s${a.ok ? '' : ' TOO HEAVY'}`, a.ok ? (a.dv < a.req * 1.03 ? C.orange : C.green) : C.red, 1 / 1.25);
    this.battery.set(st.landerBatteryWh / st.landerBatteryCap, `${Math.round((st.landerBatteryWh / st.landerBatteryCap) * 100)}%`);
    // activities
    this.list.removeAll(true);
    availableActivities(s).forEach((av, i) => {
      const y = 17 + i * 23;
      if (y > 196) return;
      const label = `${av.a.name}`;
      const b = new Button(this, 334, y, label, () => this.act(av.a.id), { w: 140, h: 22, tooltip: `${av.a.desc}\n${av.a.hours} h EVA${av.a.points ? `, +${av.a.points} science` : ''}${av.a.sampleKg ? `, +${av.a.sampleKg} kg samples` : ''}.${av.ok ? '' : '\nUNAVAILABLE: ' + av.reason}\n\nWHY: ${av.a.learn}` });
      b.label.setOrigin(0, 0).setX(16).setY(1).setTint(av.ok ? C.white : C.dim);
      b.add(this.add.image(3, 3, 'icons', iconFrame(av.ok ? av.a.icon : 'lock')).setOrigin(0, 0));
      b.add(txt(this, 16, 11, av.ok ? `${av.a.hours} h${av.a.points ? `  +${av.a.points} sci` : ''}${av.a.sampleKg ? `  +${av.a.sampleKg} kg` : ''}` : av.reason, { color: av.ok ? C.teal : C.orange }));
      if (!av.ok) b.setDisabled(true);
      this.list.add(b);
    });
    const last = s.log[s.log.length - 1];
    if (last) this.logT.setText(last.text);
  }

  act(id: string) {
    if (this.busy) return;
    const s = this.s;
    const before = s.surface.done[id] ?? 0;
    const x = id === 'samples' ? 196 + before * 14 : SPOT[id] ?? 200;
    this.busy = true;
    this.kai.play('kai_eva-walk').setFlipX(x < this.kai.x);
    this.tweens.add({
      targets: this.kai, x, duration: Math.abs(x - this.kai.x) * 25 + 100, onComplete: () => {
        // footprints along the way
        this.kai.play(id === 'broadcast' || id === 'plaque' ? 'kai_eva-cheer' : 'kai_eva-work');
        audio.sfx(id === 'pancam' || id === 'skylight' ? 'camera' : id === 'broadcast' ? 'beep' : 'dig');
        const r = doActivity(s, id);
        store.saveMission();
        this.time.delayedCall(1300, () => {
          if (r.ok) { if (DEPLOY[id]) this.deploy(id); if (id === 'samples' || id === 'regolith' || id === 'ice') this.add.image(x, GROUND + 2, 'footprint').setScale(2); toast(this, id === 'broadcast' ? 'Eastlake Rec Center' : 'Science Team', r.message, id === 'broadcast' ? 'portrait_dee' : 'portrait_capcom', 4500); }
          else { audio.sfx('error'); toast(this, 'CAPCOM Sam', r.message, 'portrait_capcom', 3000); }
          this.kai.play('kai_eva-idle');
          this.busy = false;
          this.refresh();
          if (s.crewLost) fadeTo(this, 'Report');
        });
      },
    });
    for (let fx = Math.min(this.kai.x, x); fx < Math.max(this.kai.x, x); fx += 9) this.add.image(fx, GROUND + 1, 'footprint').setAlpha(0.6);
  }

  rest() {
    if (this.busy) return;
    const r = restUntilNextDay(this.s);
    store.saveMission();
    if (!r.ok) { modal(this, { title: r.message.includes('depleted') ? 'LANDER BATTERY DEPLETED' : 'STAY COMPLETE', alert: r.message.includes('depleted'), text: r.message, options: [{ label: 'Prepare for liftoff' }], onChoose: () => this.liftoff() }); return; }
    this.cameras.main.fadeOut(300); this.cameras.main.once('camerafadeoutcomplete', () => { this.cameras.main.fadeIn(500); this.refresh(); toast(this, 'CAPCOM Sam', `Good morning, Moon crew! ${r.message}`, 'portrait_capcom', 3500); });
    void H;
  }

  liftoff() {
    if (this.busy) return;
    const s = this.s;
    const a = Sim.ascentCheck(s);
    if (!a.ok) {
      const leave = Math.ceil(s.surface.samplesKg - a.maxSamplesKg);
      modal(this, {
        title: 'ASCENT STAGE TOO HEAVY', alert: true,
        text: `With ${s.surface.samplesKg} kg of samples the ascent stage reaches only ${Math.round(a.dv)} of the ${a.req} m/s needed for orbit. The rocket equation is unforgiving: you must leave ${leave} kg behind.`,
        learn: 'Δv = Isp·g0·ln(m0/mf): extra payload raises both m0 and mf, cutting Δv.',
        options: [{ label: `Leave ${leave} kg of samples` }, { label: 'Cancel' }],
        onChoose: (i) => { if (i === 0) { Sim.jettisonSamples(s, leave); this.refresh(); this.liftoff(); } },
      });
      return;
    }
    modal(this, {
      title: 'LIFT OFF?', text: `Leave the surface with ${s.surface.samplesKg} kg of samples? Ascent margin: ${Math.round(a.dv - a.req)} m/s. Remaining EVA time will be lost.`,
      options: [{ label: 'Lift off!' }, { label: 'Stay a bit longer' }],
      onChoose: (i) => { if (i === 0) this.doLiftoff(); },
    });
  }

  doLiftoff() {
    const s = this.s;
    this.busy = true;
    this.kai.play('kai_eva-walk').setFlipX(true);
    this.tweens.add({
      targets: this.kai, x: 120, duration: Math.abs(this.kai.x - 120) * 20 + 100, onComplete: () => {
        this.kai.setVisible(false);
        const r = Sim.liftoff(s);
        store.saveMission();
        if (!r.ok) { this.busy = false; this.kai.setVisible(true); toast(this, 'Lander', r.message, 'portrait_kai_suit', 3000); return; }
        audio.sfx('ignite');
        const key = s.design.slots.lander === 'lander_path' ? 'ascent_path' : 'ascent_scout';
        const asc = this.add.image(110, this.landerImg.y - this.landerImg.height * 0.5 + 3, key).setOrigin(0.5, 1);
        const f = this.add.sprite(110, asc.y - 2, 'flame').setOrigin(0.5, 0).setScale(0.6, 1).play('flame');
        const d = this.add.sprite(110, GROUND + 4, 'dust').setOrigin(0.5, 1).setScale(3, 2).play('dust');
        if (store.settings.screenShake) this.cameras.main.shake(800, 0.006);
        this.tweens.add({ targets: [asc, f], y: '-=260', duration: 2600, ease: 'Quad.In' });
        this.tweens.add({ targets: d, alpha: 0, duration: 1500, delay: 500 });
        toast(this, 'CAPCOM Sam', 'Liftoff from the Moon! The descent stage stays behind as your launch pad, and your plaque stays with it.', 'portrait_capcom', 3500);
        this.time.delayedCall(3200, () => fadeTo(this, 'Ops'));
      },
    });
  }
}
void W;
