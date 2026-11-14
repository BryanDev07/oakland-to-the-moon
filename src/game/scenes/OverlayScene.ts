import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, H, onceKey, panel, txt, W } from '../ui/ui';
import { FORMULAS, partValues, PartValue } from '../../data/scienceLibrary';

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
  libPage = 0;
  inLibrary = false;
  constructor() { super('Overlay'); }
  init(d: { from: string }) { this.from = d.from; }
  create() {
    this.add.rectangle(0, 0, W, H, 0x04030c, 0.75).setOrigin(0, 0).setInteractive();
    panel(this, 20, 14, W - 40, H - 28, 'panel');
    txt(this, W / 2, 22, 'PAUSED', { align: 'center', color: C.gold, scale: 2 });
    const tabs: [string, () => void][] = [['RESUME', () => this.close()], ['SETTINGS', () => this.settings()], ['HOW TO PLAY', () => this.help()], ['GLOSSARY', () => this.glossary()], ['LIBRARY', () => { this.libPage = 0; this.library(); }]];
    tabs.forEach(([l, f], i) => new Button(this, 32, 50 + i * 22, l, f, { w: 96 }));
    const inMission = !['Title', 'Intro'].includes(this.from);
    if (inMission) {
      new Button(this, 32, 50 + 5 * 22 + 8, 'BACK TO HANGAR', () => { if (store.mission) store.clearMission(); this.goto('Hangar'); }, { w: 96, tooltip: 'Abandon the current flight and edit your design.' });
    }
    if (this.from !== 'Title') new Button(this, 32, 50 + 6 * 22 + 8, 'QUIT TO TITLE', () => this.goto('Title'), { w: 96, tooltip: 'Your mission auto-saves between phases.' });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    // science library paging: Left / Right (or PgUp / PgDn)
    this.input.keyboard?.on('keydown', onceKey((e: KeyboardEvent) => {
      if (!this.inLibrary) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { this.libPage++; this.library(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { this.libPage--; this.library(); }
    }));
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
  private clear() { this.inLibrary = false; this.page?.destroy(); this.page = this.add.container(140, 50); return this.page; }
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

  /**
   * Science library: every formula in plain words with its source (click the source to open it),
   * then every part value with its R (real, sourced) / G (game choice) tag. Left / Right to page.
   */
  library() {
    const p = this.clear();
    this.inLibrary = true;
    const pages = this.libraryPages();
    this.libPage = ((this.libPage % pages.length) + pages.length) % pages.length;
    pages[this.libPage](p);
    p.add(txt(this, 0, 178, `${this.libPage + 1}/${pages.length}   Left / Right to turn the page`, { color: C.teal }));
    p.add(new Button(this, 210, 174, '◀', () => { this.libPage--; this.library(); }, { w: 20 }));
    p.add(new Button(this, 234, 174, '▶', () => { this.libPage++; this.library(); }, { w: 20 }));
  }
  private libraryPages(): ((p: Phaser.GameObjects.Container) => void)[] {
    const out: ((p: Phaser.GameObjects.Container) => void)[] = [];
    // formulas: one per page at 15 px (never shrink to fit)
    const fpages: typeof FORMULAS[] = [];
    for (const f of FORMULAS) fpages.push([f]);
    fpages.forEach((fs) => out.push((p) => {
      let y = 0;
      for (const f of fs) {
        const put = (s: string, color: number, size = 15) => { const t = txt(this, 0, y, s, { color, size, maxWidth: 296 }); p.add(t); y += t.height + 2; return t; };
        put(f.name.toUpperCase(), C.gold2);
        put(f.math, C.white);
        put(f.words, 0xb8e6ff);
        const src = put(`Source: ${f.source.label}`, f.source.url ? C.teal : C.text, 10);
        if (f.source.url) { src.setInteractive({ useHandCursor: true }); src.on('pointerup', () => window.open(f.source.url, '_blank', 'noopener')); }
        y += 6;
      }
    }));
    // part values: grouped rows, paged by height (a group header repeats at the top of each page)
    const rows = partValues();
    const pv: PartValue[][] = [[]];
    let h = 14, last = '';
    for (const r of rows) {
      const need = 12 + (r.group !== last ? 13 : 0);
      if (h + need > 168) { pv.push([]); h = 14 + 13; } else h += need;
      last = r.group;
      pv[pv.length - 1].push(r);
    }
    pv.forEach((rs) => out.push((p) => {
      p.add(txt(this, 0, 0, 'PART VALUES   R = real (sourced)   G = game choice', { color: C.gold2 }));
      let y = 14, group = '';
      for (const r of rs) {
        if (r.group !== group) { group = r.group; p.add(txt(this, 0, y + 1, group.toUpperCase(), { color: C.gold })); y += 13; }
        const t = txt(this, 6, y, `${r.part.replace(/ \(.*\)/, '')}: ${r.field}`, { color: C.white, maxWidth: 204 });
        const v = txt(this, 262, y, r.value.toLocaleString('en-US'), { color: 0xffe14a, align: 'right' });
        const tag = txt(this, 270, y, r.tag, { color: r.tag === 'R' ? C.green : C.orange });
        p.add([t, v, tag]);
        if (r.tag === 'R' && r.source.url) { t.setInteractive({ useHandCursor: true }); t.on('pointerup', () => window.open(r.source.url, '_blank', 'noopener')); }
        y += 12;
      }
    }));
    return out;
  }
}
