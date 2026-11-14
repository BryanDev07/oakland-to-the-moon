import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, H, panel, txt, W } from '../ui/ui';

const GLOSSARY: [string, string][] = [
  ['Δv (delta-v)', 'Change in velocity a spacecraft can make. Every maneuver costs Δv; propellant buys it.'],
  ['Exhaust speed', 'How fast gas leaves the nozzle (m/s). Faster = more Δv per lb of fuel. Maker sheets list Isp in seconds: exhaust speed = Isp × 9.81.'],
  ['Rocket equation', 'Δv = Isp·g0·ln(m0/mf). Extra mass needs exponentially more propellant.'],
  ['TLI', 'Trans-lunar injection: the burn (by the rocket) that sends you to the Moon.'],
  ['LOI / TEI', 'Lunar orbit insertion / trans-Earth injection: service-module burns into lunar orbit and back home.'],
  ['Orbit-average power', 'Solar power averaged over an orbit that is ~40% in shadow.'],
  ['W vs Wh', 'Watts are power (a rate). Watt-hours are energy (an amount). Batteries store Wh.'],
  ['kbps vs MB', 'Kilobits per second is a data RATE; megabytes are an AMOUNT. MB per day = kbps × 86,400 / 8,000.'],
  ['EVA', 'Extravehicular activity: a spacewalk or moonwalk.'],
  ['Segments', 'Launch, space, ground and science segments must all work together.'],
];

export class OverlayScene extends Phaser.Scene {
  from = '';
  page: Phaser.GameObjects.Container | null = null;
  constructor() { super('Overlay'); }
  init(d: { from: string }) { this.from = d.from; }
  create() {
    this.add.rectangle(0, 0, W, H, 0x04030c, 0.75).setOrigin(0, 0).setInteractive();
    panel(this, 20, 14, W - 40, H - 28, 'panel');
    txt(this, W / 2, 22, 'PAUSED', { align: 'center', color: C.gold, scale: 2 });
    const tabs: [string, () => void][] = [['RESUME', () => this.close()], ['SETTINGS', () => this.settings()], ['HOW TO PLAY', () => this.help()], ['GLOSSARY', () => this.glossary()]];
    tabs.forEach(([l, f], i) => new Button(this, 32, 50 + i * 22, l, f, { w: 96 }));
    const inMission = !['Title', 'Intro'].includes(this.from);
    if (inMission) {
      new Button(this, 32, 50 + 4 * 22 + 8, 'BACK TO HANGAR', () => { if (store.mission) store.clearMission(); this.goto('Hangar'); }, { w: 96, tooltip: 'Abandon the current flight and edit your design.' });
    }
    if (this.from !== 'Title') new Button(this, 32, 50 + 5 * 22 + 8, 'QUIT TO TITLE', () => this.goto('Title'), { w: 96, tooltip: 'Your mission auto-saves between phases.' });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.settings();
  }
  close() {
    audio.sfx('back');
    this.scene.resume(this.from);
    this.scene.stop();
  }
  goto(key: string) {
    this.scene.stop(this.from);
    this.scene.start(key);
  }
  private clear() { this.page?.destroy(); this.page = this.add.container(140, 50); return this.page; }
  settings() {
    const p = this.clear();
    const s = store.settings;
    const row = (y: number, label: string, value: string, onMinus: () => void, onPlus: () => void) => {
      p.add(txt(this, 0, y + 4, label, { color: C.dim }));
      const v = txt(this, 196, y + 4, value, { align: 'center' });
      p.add(v);
      p.add(new Button(this, 160, y, '-', () => { onMinus(); this.settings(); }, { w: 18 }));
      p.add(new Button(this, 220, y, '+', () => { onPlus(); this.settings(); }, { w: 18 }));
    };
    const step = (k: 'musicVolume' | 'sfxVolume', d: number) => { s[k] = Math.round(Math.max(0, Math.min(1, s[k] + d)) * 10) / 10; store.saveSettings(); audio.applyVolumes(); audio.sfx('beep'); };
    row(0, 'Music volume', `${Math.round(s.musicVolume * 100)}%`, () => step('musicVolume', -0.1), () => step('musicVolume', 0.1));
    row(22, 'Sound effects', `${Math.round(s.sfxVolume * 100)}%`, () => step('sfxVolume', -0.1), () => step('sfxVolume', 0.1));
    const speeds: typeof s.textSpeed[] = ['slow', 'normal', 'fast', 'instant'];
    row(44, 'Text speed', s.textSpeed.toUpperCase(), () => { s.textSpeed = speeds[Math.max(0, speeds.indexOf(s.textSpeed) - 1)]; store.saveSettings(); }, () => { s.textSpeed = speeds[Math.min(3, speeds.indexOf(s.textSpeed) + 1)]; store.saveSettings(); });
    const toggle = (y: number, label: string, key: 'muted' | 'screenShake' | 'scanlines') => {
      p.add(txt(this, 0, y + 4, label, { color: C.dim }));
      p.add(new Button(this, 160, y, s[key] ? 'ON' : 'OFF', () => { s[key] = !s[key]; store.saveSettings(); audio.applyVolumes(); this.settings(); }, { w: 78 }).setSelected(s[key]));
    };
    toggle(66, 'Mute all audio', 'muted');
    toggle(88, 'Screen shake', 'screenShake');
    toggle(110, 'CRT scanlines', 'scanlines');
    p.add(txt(this, 0, 140, 'Settings are saved on this device. Audio starts after your first click (browser rule).', { color: C.dim, maxWidth: 290 }));
  }
  help() {
    const p = this.clear();
    p.add(txt(this, 0, 0, 'GOAL: land a crew on the Moon, do science, and bring everyone home.\n\nHANGAR: click a category on the left, then a part on the right. The ship changes as you build. Bars at the bottom must stay in the safe zone. Red = blocking problem.\n\nOPERATIONS: time runs on its own. Use the speed buttons. Turn instruments on in lunar orbit, keep the battery up, and click the big action button (orbit insertion, descent, return).\n\nLANDING: hold UP (or W/Space) for thrust, LEFT/RIGHT to tilt. Touch down under 3 m/s on flat ground. Press A for autopilot, X to abort.\n\nSURFACE: click activities to earn science. Samples weigh down the ascent stage!', { maxWidth: 296 }));
  }
  glossary() {
    const p = this.clear();
    let y = 0;
    for (const [term, def] of GLOSSARY) {
      p.add(txt(this, 0, y, term, { color: C.gold2 }));
      const t = txt(this, 0, y + 10, def, { maxWidth: 296, color: C.text });
      p.add(t);
      y += 12 + t.height + 2;
      if (y > 175) break;
    }
  }
}
