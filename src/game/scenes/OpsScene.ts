import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, fadeIn, fadeTo, fmtTime, gearButton, iconFrame, Meter, modal, panel, toast, Tooltip, txt, W } from '../ui/ui';
import { SpacecraftView } from '../components/SpacecraftView';
import * as Sim from '../../simulation/mission';
import { COMPONENT_BY_ID } from '../../data/components';
import { SITE_BY_ID } from '../../data/mission';
import { FREE_RETURN_S, HOUR, TRANSIT_BACK_S, TRANSIT_OUT_S } from '../../simulation/constants';
import type { MissionState } from '../../simulation/types';

const SPEEDS = [0, 12, 48, 192]; // sim steps (5 min each) per real second
const PHASE_LABEL: Record<string, string> = {
  TRANSIT_OUT: 'TRANSLUNAR COAST', LOI_PENDING: 'LUNAR ARRIVAL', LUNAR_ORBIT: 'LUNAR ORBIT', LUNAR_ORBIT_POST: 'LUNAR ORBIT (CREW REUNITED)',
  TRANSIT_BACK: 'TRANS-EARTH COAST', FREE_RETURN: 'FREE-RETURN ABORT', ENTRY: 'EARTH ENTRY', COMPLETE: 'MISSION COMPLETE', DESCENT: 'DESCENT', SURFACE: 'SURFACE OPS',
};

export class OpsScene extends Phaser.Scene {
  s!: MissionState;
  speed = 1;
  acc = 0;
  view!: Phaser.GameObjects.Container;
  craft!: SpacecraftView;
  earth!: Phaser.GameObjects.Image; moon!: Phaser.GameObjects.Image; moonBig!: Phaser.GameObjects.Image;
  starsFar!: Phaser.GameObjects.TileSprite; starsNear!: Phaser.GameObjects.TileSprite;
  shadow!: Phaser.GameObjects.Rectangle;
  viewLabel!: Phaser.GameObjects.BitmapText;
  burnFlame!: Phaser.GameObjects.Sprite;
  traj!: Phaser.GameObjects.Graphics;
  meters: Record<string, Meter> = {};
  phaseText!: Phaser.GameObjects.BitmapText; clockText!: Phaser.GameObjects.BitmapText; nextText!: Phaser.GameObjects.BitmapText; logText!: Phaser.GameObjects.BitmapText; linkText!: Phaser.GameObjects.BitmapText;
  speedBtns: Button[] = [];
  controls!: Phaser.GameObjects.Container;
  modalOpen = false;
  lastPhase = '';
  uiTimer = 0;
  said: Record<string, boolean> = {};
  lastSave = 0;
  constructor() { super('Ops'); }

  create() {
    fadeIn(this);
    const s = store.mission;
    if (!s) { fadeTo(this, 'Hangar'); return; }
    this.s = s;
    this.speed = 1; this.acc = 0; this.modalOpen = false; this.lastPhase = ''; this.said = {}; this.speedBtns = []; this.meters = {};
    audio.music('space');
    // ------------------------------------------------ space view
    this.view = this.add.container(0, 0);
    const mask = this.make.graphics({}, false).fillRect(0, 0, 318, 168);
    this.view.setMask(mask.createGeometryMask());
    this.view.add(this.add.image(0, 0, 'space_bg').setOrigin(0, 0));
    this.starsFar = this.add.tileSprite(0, 0, 318, 168, 'stars_far').setOrigin(0, 0);
    this.starsNear = this.add.tileSprite(0, 0, 318, 168, 'stars_near').setOrigin(0, 0);
    this.earth = this.add.image(40, 84, 'earth_med');
    this.moon = this.add.image(280, 84, 'moon_med');
    this.moonBig = this.add.image(159, 290, 'moon_big').setScale(1.5);
    this.craft = new SpacecraftView(this, 0, 0, s.design, 'flight');
    this.view.add([this.starsFar, this.starsNear, this.earth, this.moon, this.moonBig, this.craft]);
    this.burnFlame = this.add.sprite(0, 0, 'flame').setAngle(90).setOrigin(0.5, 0).play('flame').setVisible(false);
    this.view.add(this.burnFlame);
    this.shadow = this.add.rectangle(0, 0, 318, 168, 0x02020a, 0.55).setOrigin(0, 0);
    this.view.add(this.shadow);
    this.viewLabel = txt(this, 159, 152, '', { align: 'center', color: C.gold2 });
    this.view.add(this.viewLabel);
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(2, 0x08060f).strokeRect(1, 1, 317, 167); g.lineStyle(1, 0x4268ad).strokeRect(2, 2, 315, 165);
    // ------------------------------------------------ right column
    panel(this, 320, 0, 160, 72, 'panel');
    this.phaseText = txt(this, 400, 6, '', { align: 'center', color: C.gold });
    this.clockText = txt(this, 400, 18, '', { align: 'center', color: C.white, scale: 2 });
    this.nextText = txt(this, 326, 42, '', { color: C.text, maxWidth: 148 });
    panel(this, 320, 72, 160, 98, 'panel_dark');
    this.traj = this.add.graphics();
    this.add.image(338, 121, 'earth_small').setScale(0.6);
    this.add.image(462, 121, 'moon_small').setScale(0.5);
    txt(this, 400, 77, 'TRAJECTORY', { align: 'center', color: C.teal });
    // ------------------------------------------------ resources
    panel(this, 0, 170, 240, 100, 'panel');
    const mk = (k: string, x: number, y: number, label: string, ic: string, tip: string) => {
      const m = new Meter(this, x, y, 110, label, ic);
      this.meters[k] = m;
      const hit = this.add.rectangle(x, y, 110, 20, 0, 0).setOrigin(0, 0).setInteractive();
      hit.on('pointerover', () => Tooltip.show(this, tip, { x, y: y - 46 }));
      hit.on('pointerout', () => Tooltip.hide());
    };
    mk('fuel', 6, 175, 'FUEL', 'fuel', 'Service-module propellant. The marker shows what the remaining burns need. Below the marker = cannot get home!');
    mk('battery', 124, 175, 'BATTERY', 'battery', 'Stored energy (Wh). Drains whenever load exceeds generation, e.g. in the Moon\'s shadow.');
    mk('power', 6, 197, 'POWER', 'power', 'Generation vs electrical load right now (W).');
    mk('heat', 124, 197, 'HEAT', 'thermal', 'Waste heat vs radiator capacity. Over 100% forces instruments off.');
    mk('o2', 6, 219, 'OXYGEN', 'o2', 'Cabin oxygen remaining (kg). ~0.84 kg per person per day.');
    mk('water', 124, 219, 'WATER', 'water', 'Drinking water (kg). ~3.5 kg per person per day.');
    mk('crew', 6, 241, 'CREW', 'crew', 'Crew condition: stress, radiation, rationing and power problems lower it.');
    mk('data', 124, 241, 'STORAGE', 'data', 'Science data on the recorder. Full = new data is lost. Downlink frees space.');
    this.linkText = txt(this, 400, 157, '', { align: 'center', color: C.dim });
    // ------------------------------------------------ controls
    panel(this, 240, 170, 240, 100, 'panel');
    txt(this, 246, 175, 'TIME', { color: C.dim });
    ['pause', 'play', 'ffwd', 'ffwd'].forEach((ic, i) => {
      const b = new Button(this, 272 + i * 26, 172, i === 3 ? '16' : '', () => this.setSpeed(i), { w: 24, h: 14, icon: ic, tooltip: ['Pause', '1 hour per second', '4 hours per second', '16 hours per second'][i] });
      b.ic?.setX(i === 3 ? 1 : 6).setY(1);
      if (i === 3) b.label.setX(17).setY(2);
      this.speedBtns.push(b);
    });
    this.controls = this.add.container(0, 0);
    this.logText = txt(this, 246, 242, '', { color: C.dim, maxWidth: 228 });
    gearButton(this);
    crt(this);
    this.input.keyboard?.on('keydown-SPACE', () => this.setSpeed(this.speed === 0 ? 1 : 0));
    this.input.keyboard?.on('keydown-ONE', () => this.setSpeed(1));
    this.input.keyboard?.on('keydown-TWO', () => this.setSpeed(2));
    this.input.keyboard?.on('keydown-THREE', () => this.setSpeed(3));
    this.setSpeed(1);
    this.onPhase(true);
    const chap = s.phase === 'TRANSIT_OUT' ? [4, 'THE JOURNEY'] : s.phase === 'LOI_PENDING' || s.phase === 'LUNAR_ORBIT' ? [5, 'LUNAR OPERATIONS'] : s.phase === 'LUNAR_ORBIT_POST' || s.phase === 'TRANSIT_BACK' || s.phase === 'FREE_RETURN' ? [6, 'THE RETURN'] : null;
    if (chap && !store.seen[`chap${chap[0]}`]) { this.setSpeed(0); chapterCard(this, chap[0] as number, chap[1] as string, () => { if (this.speed === 0) this.setSpeed(1); }); store.markSeen(`chap${chap[0]}`); }
    if (s.phase === 'TRANSIT_OUT' && s.t < 3600) this.time.delayedCall(2600, () => toast(this, 'CAPCOM Sam', 'Three days to the Moon. Watch power and supplies; use the speed buttons to fast-forward. We will call if anything comes up.', 'portrait_capcom', 6500));
    this.input.once('pointerdown', () => audio.unlock());
  }

  setSpeed(i: number) {
    this.speed = i;
    this.speedBtns.forEach((b, k) => b.setSelected(k === i));
  }

  // ------------------------------------------------ controls per phase
  onPhase(force = false) {
    const s = this.s;
    if (!force && s.phase === this.lastPhase) return;
    this.lastPhase = s.phase;
    store.saveMission();
    const C2 = this.controls;
    C2.removeAll(true);
    // instruments
    let x = 246;
    const ids = Object.keys(s.instruments);
    if (ids.length) {
      C2.add(txt(this, 246, 190, 'INSTRUMENTS', { color: C.dim }));
      ids.forEach((id, i) => {
        const c = COMPONENT_BY_ID[id];
        const b = new Button(this, 246 + i * 58, 199, c.id === 'sci_mapcam' ? 'MAP CAM' : 'NEUTRON', () => {
          const inst = s.instruments[id];
          if (inst.failed) { audio.sfx('error'); toast(this, 'Science', `${c.short} has failed.`, 'portrait_capcom', 2500); return; }
          if (!Sim.inLunarOrbit(s)) { audio.sfx('error'); toast(this, 'Science', 'Instruments work only in lunar orbit.', 'portrait_capcom', 2500); return; }
          Sim.setInstrument(s, id, !inst.on); this.refreshControls();
        }, { w: 56, h: 15, icon: 'science', tooltip: `${c.name}: ${c.powerW} W while on. ${c.desc}` });
        b.setData('inst', id);
        C2.add(b);
      });
      x = 246 + ids.length * 58;
    } else C2.add(txt(this, 246, 199, 'No orbital instruments', { color: C.dim }));
    void x;
    C2.add(txt(this, 366, 190, 'POWER', { color: C.dim }));
    const pBtn = new Button(this, 366, 199, s.powerMode === 'normal' ? 'NORMAL' : 'CONSERVE', () => { s.powerMode = s.powerMode === 'normal' ? 'conserve' : 'normal'; this.refreshControls(); }, { w: 50, h: 15, tooltip: 'CONSERVE lowers cabin loads by 25% (colder, dimmer cabin). Crew condition slowly drops.' });
    pBtn.setData('kind', 'power'); C2.add(pBtn);
    C2.add(txt(this, 420, 190, 'COMMS', { color: C.dim }));
    const cBtn = new Button(this, 420, 199, s.commsMode === 'high' ? 'HI-RATE' : 'LOW', () => { s.commsMode = s.commsMode === 'high' ? 'low' : 'high'; this.refreshControls(); }, { w: 54, h: 15, tooltip: 'HI-RATE downlinks science at full speed. LOW saves 60% of comms power but sends only 10% of the data.' });
    cBtn.setData('kind', 'comms'); C2.add(cBtn);
    // phase action buttons
    const act = (label: string, fn: () => void, tip: string, style: 'go' | 'normal' = 'go', y = 220, w = 228, xx = 246) => { const b = new Button(this, xx, y, label, fn, { w, h: 18, style, tooltip: tip }); C2.add(b); return b; };
    switch (s.phase) {
      case 'TRANSIT_OUT': case 'TRANSIT_BACK': case 'FREE_RETURN':
        act('COASTING...  (FAST-FORWARD ▶▶)', () => this.setSpeed(3), 'Nothing to do but monitor systems. Fast-forward if all is well.', 'normal');
        break;
      case 'LOI_PENDING': {
        const ok = Sim.canAffordLOIAndReturn(s);
        act('EXECUTE LUNAR ORBIT INSERTION', () => this.doLOI(), `Brake into lunar orbit: ${SITE_BY_ID[s.design.plan.site].dvLoi} m/s.`, 'go', 220, 150);
        act('FREE RETURN', () => this.doFreeReturn(), 'Abort: loop around the Moon and come home without landing. Uses almost no propellant.', 'normal', 220, 74, 400);
        if (!ok) this.time.delayedCall(300, () => toast(this, 'Flight Dynamics', 'WARNING: projected propellant is NOT enough to enter orbit AND return. A free-return abort is the safe option.', 'portrait_capcom', 8000));
        this.setSpeed(0);
        break;
      }
      case 'LUNAR_ORBIT':
        act(s.landerAttached ? 'BEGIN DESCENT ▶' : 'NO LANDER', () => this.doDescent(), 'Undock the lander and start powered descent. Map in sunlight first if you have a camera!', 'go', 220, 150).setDisabled(!s.landerAttached);
        act('ABORT HOME', () => this.confirmAbortHome(), 'Skip the landing and burn for Earth now.', 'normal', 220, 74, 400);
        break;
      case 'LUNAR_ORBIT_POST':
        act('EXECUTE TRANS-EARTH INJECTION', () => this.doTEI(), `Burn for home: ${SITE_BY_ID[s.design.plan.site].dvTei} m/s. Keep mapping first if you like.`, 'go');
        break;
      default: break;
    }
    this.refreshControls();
    // milestone messages
    if (s.phase === 'LOI_PENDING') { audio.sfx('warn'); toast(this, 'CAPCOM Sam', 'The Moon fills the window! Ready for the lunar orbit insertion burn when you are.', 'portrait_capcom', 5000); }
    if (s.phase === 'LUNAR_ORBIT' && !this.said.orbit) { this.said.orbit = true; this.time.delayedCall(800, () => toast(this, 'Director Cole', Object.keys(s.instruments).length ? 'In orbit! Switch on your instruments: the camera only images in sunlight. Descend when ready.' : 'In orbit! Begin descent when ready.', 'portrait_director', 6500)); }
    if (s.phase === 'LUNAR_ORBIT_POST' && !this.said.post) { this.said.post = true; this.time.delayedCall(800, () => toast(this, 'CAPCOM Sam', 'Crew reunited in the capsule. Burn for home when you are ready.', 'portrait_capcom', 5000)); }
    if (s.phase === 'ENTRY') { this.time.delayedCall(600, () => fadeTo(this, 'Return')); }
    if (s.phase === 'COMPLETE') { this.time.delayedCall(1200, () => fadeTo(this, 'Report')); }
    if (s.phase === 'TRANSIT_BACK' && !store.seen.chap6) { this.setSpeed(0); chapterCard(this, 6, 'THE RETURN', () => { if (this.speed === 0) this.setSpeed(1); }); store.markSeen('chap6'); }
    if (s.phase === 'LOI_PENDING' && !store.seen.chap5) { chapterCard(this, 5, 'LUNAR OPERATIONS'); store.markSeen('chap5'); }
  }

  refreshControls() {
    const s = this.s;
    for (const o of this.controls.list) {
      const b = o as Button;
      if (!(b instanceof Button)) continue;
      const inst = b.getData('inst') as string | undefined;
      if (inst) { const st = s.instruments[inst]; b.setSelected(st.on); b.setText((inst === 'sci_mapcam' ? 'MAP ' : 'NEU ') + (st.failed ? 'FAIL' : st.on ? 'ON' : 'OFF')); }
      if (b.getData('kind') === 'power') { b.setText(s.powerMode === 'normal' ? 'NORMAL' : 'SAVE'); b.setSelected(s.powerMode === 'conserve'); }
      if (b.getData('kind') === 'comms') { b.setText(s.commsMode === 'high' ? 'HI-RATE' : 'LOW'); b.setSelected(s.commsMode === 'low'); }
    }
  }

  // ------------------------------------------------ actions
  burnFx(ms = 1600) {
    this.burnFlame.setVisible(true);
    audio.sfx('ignite');
    if (store.settings.screenShake) this.cameras.main.shake(ms, 0.003);
    this.time.delayedCall(ms, () => this.burnFlame.setVisible(false));
  }
  doLOI() {
    const r = Sim.executeLOI(this.s);
    if (!r.ok) { audio.sfx('error'); modal(this, { title: 'NOT ENOUGH PROPELLANT', alert: true, text: `The insertion burn needs ${Math.round(r.propKg)} kg but only ${Math.round(this.s.propKg)} kg remain. The only safe option is a free-return abort.`, options: [{ label: 'Free-return abort' }], onChoose: () => this.doFreeReturn() }); return; }
    this.burnFx();
    this.setSpeed(1);
    this.onPhase();
  }
  doFreeReturn() { Sim.chooseFreeReturn(this.s); this.burnFx(600); this.setSpeed(1); this.onPhase(); }
  doDescent() {
    const s = this.s;
    const asc = Sim.ascentCheck(s, 0);
    void asc;
    modal(this, {
      title: 'BEGIN POWERED DESCENT?',
      text: `${s.stats.landingCrew} crew will board the lander. ${s.stats.orbitCrew} will stay aboard the capsule. Any instruments left on keep running in orbit.\n\nLanding site: ${SITE_BY_ID[s.design.plan.site].name}.`,
      options: [{ label: 'GO for descent!' }, { label: 'Not yet' }],
      onChoose: (i) => { if (i === 0 && Sim.beginDescent(s)) { store.saveMission(); fadeTo(this, 'Landing'); } },
    });
  }
  confirmAbortHome() {
    modal(this, { title: 'ABORT LANDING?', alert: true, text: 'The lander will be jettisoned unused and the service module will burn for Earth. The crew stays safe but there will be no surface science.', options: [{ label: 'Abort: burn for home' }, { label: 'Cancel' }], onChoose: (i) => { if (i === 0) this.doTEI(); } });
  }
  doTEI() {
    const r = Sim.executeTEI(this.s);
    if (!r.ok) { audio.sfx('fail'); this.onPhase(); return; }
    this.burnFx();
    this.setSpeed(1);
    this.onPhase();
  }

  // ------------------------------------------------ main loop
  update(_t: number, dtMs: number) {
    const s = this.s;
    if (!s) return;
    if (s.pending && !this.modalOpen) this.showEvent();
    if (!this.modalOpen && this.speed > 0 && Sim.isCoasting(s)) {
      this.acc += (dtMs / 1000) * SPEEDS[this.speed];
      let n = 0;
      while (this.acc >= 1 && n < 8) { Sim.step(s); this.acc -= 1; n++; if (s.pending || !Sim.isCoasting(s)) { this.acc = 0; break; } }
      if (s.t - this.lastSave > 6 * HOUR) { this.lastSave = s.t; store.saveMission(); }
    }
    if (s.phase !== this.lastPhase) this.onPhase();
    this.renderView(dtMs);
    this.uiTimer += dtMs;
    if (this.uiTimer > 100) { this.uiTimer = 0; this.renderUI(); }
  }

  showEvent() {
    const s = this.s;
    const ev = s.pending!;
    this.modalOpen = true;
    audio.sfx('alarm');
    if (store.settings.screenShake) this.cameras.main.shake(300, 0.004);
    modal(this, {
      title: ev.title, text: ev.text, learn: ev.learn, alert: true,
      options: ev.options,
      onChoose: (i) => {
        const msg = Sim.resolveEvent(s, i);
        this.modalOpen = false;
        this.refreshControls();
        store.saveMission();
        toast(this, 'Mission Control', msg, 'portrait_director', 5000);
        if (s.crewLost) this.onPhase();
      },
    });
  }

  renderView(dtMs: number) {
    const s = this.s;
    const dt = dtMs / 1000;
    const warp = this.speed === 0 ? 0.1 : this.speed;
    this.starsFar.tilePositionX += dt * 2 * warp;
    this.starsNear.tilePositionX += dt * 6 * warp;
    const tNow = this.time.now / 1000;
    const bob = Math.sin(tNow * 1.4) * 2;
    let prog = 0;
    const orbit = s.phase === 'LUNAR_ORBIT' || s.phase === 'LUNAR_ORBIT_POST';
    if (s.phase === 'TRANSIT_OUT') prog = Sim.phaseTime(s) / TRANSIT_OUT_S;
    else if (s.phase === 'TRANSIT_BACK') prog = 1 - Sim.phaseTime(s) / TRANSIT_BACK_S;
    else if (s.phase === 'FREE_RETURN') prog = 1 - Sim.phaseTime(s) / FREE_RETURN_S;
    else if (s.phase === 'LOI_PENDING') prog = 1;
    prog = Phaser.Math.Clamp(prog, 0, 1);
    this.earth.setVisible(!orbit).setPosition(34 - prog * 20, 84 + prog * 20).setScale(Phaser.Math.Linear(1.05, 0.4, prog));
    this.moon.setVisible(!orbit).setPosition(280 - (1 - prog) * 20 + prog * 0, 84).setScale(Phaser.Math.Linear(0.35, 1.6, prog));
    this.moonBig.setVisible(orbit);
    if (orbit) this.moonBig.setAngle(this.moonBig.angle + dt * 1.2 * warp);
    const homeward = s.phase === 'TRANSIT_BACK' || s.phase === 'FREE_RETURN' || s.phase === 'LUNAR_ORBIT_POST';
    const cx = orbit ? 175 : 214, cy = orbit ? 70 : 80;
    this.craft.setPosition(cx + bob * 0.3, cy + bob).setScale(homeward ? -1 : 1, 1);
    this.burnFlame.setPosition(cx + (homeward ? 152 : -152), cy + bob).setAngle(homeward ? -90 : 90);
    const dark = orbit && !Sim.isSunlit(s);
    this.shadow.setVisible(dark);
    let label = '';
    if (orbit) label = `${dark ? 'IN SHADOW (no solar power)' : 'SUNLIGHT'}${Sim.earthVisible(s) ? '' : '  •  FAR SIDE: NO SIGNAL'}`;
    else if (s.phase === 'LOI_PENDING') label = 'ARRIVING AT THE MOON';
    this.viewLabel.setText(label).setTint(dark || !Sim.earthVisible(s) ? C.orange : C.gold2);
    // trajectory map
    const g = this.traj; g.clear();
    const ex = 338, ey = 121, mx = 462, my = 121;
    g.lineStyle(1, 0x2e9088, 0.8);
    let px = 0, py = 0;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = (ex + mx) / 2 + Math.cos(a) * 60, y = ey + Math.sin(a * 2) * 22;
      if (i) g.lineBetween(px, py, x, y);
      px = x; py = y;
    }
    let ang: number;
    if (s.phase === 'TRANSIT_OUT') ang = Math.PI - prog * Math.PI;
    else if (orbit || s.phase === 'LOI_PENDING') ang = 0;
    else ang = -prog * Math.PI + 0.0001;
    if (s.phase === 'TRANSIT_BACK' || s.phase === 'FREE_RETURN') ang = Math.PI * 2 - prog * Math.PI;
    const sx = (ex + mx) / 2 + Math.cos(ang) * 60, sy = ey + Math.sin(ang * 2) * 22;
    if (orbit) { const oa = Sim.orbitPhase(s) * Math.PI * 2; g.fillStyle(0xffe27a).fillRect(Math.round(mx + Math.cos(oa) * 9) - 1, Math.round(my + Math.sin(oa) * 9) - 1, 3, 3); }
    else g.fillStyle(0xffe27a).fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
  }

  renderUI() {
    const s = this.s;
    this.phaseText.setText(PHASE_LABEL[s.phase] ?? s.phase);
    this.clockText.setText(fmtTime(s.t));
    let next = '';
    if (s.phase === 'TRANSIT_OUT') next = `Lunar arrival in ${((TRANSIT_OUT_S - Sim.phaseTime(s)) / HOUR).toFixed(0)} h`;
    else if (s.phase === 'TRANSIT_BACK') next = `Earth entry in ${((TRANSIT_BACK_S - Sim.phaseTime(s)) / HOUR).toFixed(0)} h`;
    else if (s.phase === 'FREE_RETURN') next = `Earth entry in ${((FREE_RETURN_S - Sim.phaseTime(s)) / HOUR).toFixed(0)} h`;
    else if (s.phase === 'LOI_PENDING') next = 'Decision: insertion burn or free-return abort';
    else if (s.phase === 'LUNAR_ORBIT') { const map = s.instruments['sci_mapcam']; next = `Orbit ${Math.floor(Sim.phaseTime(s) / 7080) + 1}${map ? `  •  map ${Math.min(100, Math.round(Sim.securedMB(s, 'map') / 1440))}%` : ''}`; }
    else if (s.phase === 'LUNAR_ORBIT_POST') next = `Samples aboard: ${Math.round(s.samplesAboardKg)} kg`;
    this.nextText.setText(next + (s.pending ? '\nAWAITING DECISION' : this.speed === 0 ? '\nPAUSED' : ''));
    // meters
    const burns = Sim.projectBurns(s);
    const need = burns.reduce((a, b) => a + b.propKg, 0);
    const cap = Math.max(1, s.stats.mass.smPropKg);
    this.meters.fuel.set(s.propKg / cap, `${Math.round(s.propKg).toLocaleString('en-US')} kg${s.propKg < need ? ' SHORT!' : ''}`, s.propKg < need ? C.red : s.propKg < need * 1.06 ? C.orange : C.green, need / cap);
    const bf = s.batteryWh / Math.max(1, s.batteryCapWh);
    this.meters.battery.set(bf, `${Math.round(bf * 100)}%`);
    const p = Sim.powerSnapshot(s);
    this.meters.power.set(p.genW / Math.max(p.genW, p.loadW, 1), `${(p.genW / 1000).toFixed(1)}/${(p.loadW / 1000).toFixed(1)} kW`, p.genW >= p.loadW ? C.green : C.orange);
    const hf = p.heatW / Math.max(1, p.rejectW);
    this.meters.heat.set(hf, `${Math.round(hf * 100)}%`, hf > 1 ? C.red : hf > 0.9 ? C.orange : C.green);
    this.meters.o2.set(s.o2Kg / Math.max(1, s.stats.consumables.o2Kg), `${s.o2Kg.toFixed(1)} kg`);
    this.meters.water.set(s.waterKg / Math.max(1, s.stats.consumables.waterKg), `${s.waterKg.toFixed(0)} kg${s.rationing ? ' RATION' : ''}`);
    this.meters.crew.set(s.condition / 100, `${Math.round(s.condition)}%${s.condition < 40 ? ' POOR' : ''}`);
    const stored = Object.values(s.storedMB).reduce((a, b) => a + b, 0);
    const df = stored / Math.max(1, s.stats.comms.storageMB);
    this.meters.data.set(1 - df, `${(stored / 1000).toFixed(0)}/${(s.stats.comms.storageMB / 1000).toFixed(0)} GB`, df > 0.95 ? C.red : df > 0.8 ? C.orange : C.green);
    const rate = Sim.linkRateMbps(s);
    this.linkText.setText(`LINK ${rate > 0 ? rate.toFixed(rate < 1 ? 2 : 0) + ' Mbps' : 'DOWN'} • LOST ${(s.lostMB / 1000).toFixed(0)} GB`).setTint(rate > 0 ? C.dim : C.orange);
    const last = s.log[s.log.length - 1];
    if (last) this.logText.setText(last.text.length > 84 ? last.text.slice(0, 82) + '…' : last.text).setTint(last.kind === 'bad' || last.kind === 'event' ? C.red : last.kind === 'warn' ? C.orange : last.kind === 'good' ? C.green : C.dim);
    // contextual coaching (once each)
    const once = (k: string, cond: boolean, who: string, text: string) => { if (cond && !this.said[k]) { this.said[k] = true; toast(this, who, text, 'portrait_capcom', 6000); } };
    once('shadow', p.genW === 0 && s.stats.power.genKind === 'solar' && Sim.inLunarOrbit(s), 'CAPCOM Sam', 'You are in the Moon\'s shadow: the arrays make nothing, the battery carries every watt. ~47 minutes of every 2-hour orbit.');
    once('los', !Sim.earthVisible(s), 'CAPCOM Sam', 'Going behind the Moon: no radio contact. Data stays on the recorder until you come around.');
    once('batt', bf < 0.25, 'Flight Director', 'Battery below 25%! Switch to CONSERVE or turn off instruments.');
    once('store', df > 0.8, 'Science Officer', 'Recorder over 80% full. Downlink in HI-RATE or pause the camera to avoid losing data.');
    once('fuel', s.propKg < need, 'Flight Dynamics', 'Propellant is below what the remaining burns need. Consider aborting early while you still can.');
    // instrument button labels may change by auto-shed
    this.refreshControls();
    void iconFrame;
    void W;
  }
}
