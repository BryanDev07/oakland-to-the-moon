import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, H, modal, panel, txt, W } from '../ui/ui';
import { cloneDesign, BASELINE_DESIGN } from '../../data/mission';
import { modalState } from '../ui/ui';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    fadeIn(this);
    audio.music('title');
    this.add.image(0, 0, 'sky_night').setOrigin(0, 0);
    const sky = this.add.image(-80, 0, 'skyline_night').setOrigin(0, 0);
    this.add.image(0, 0, 'title_fg').setOrigin(0, 0);
    // twinkling stars and blinking aviation lights
    for (let i = 0; i < 24; i++) {
      const s = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, 120), 'spark').setAlpha(0.6).setScale(0.5);
      this.tweens.add({ targets: s, alpha: 0.1, duration: Phaser.Math.Between(600, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000) });
    }
    this.tweens.add({ targets: sky, x: -100, duration: 16000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    // a BART train crossing slowly in the distance
    const train = this.add.image(-140, 186, 'train').setOrigin(0, 0).setScale(0.5).setAlpha(0.85);
    this.tweens.add({ targets: train, x: W + 20, duration: 14000, repeat: -1, delay: 1500 });
    // logo
    const logo = this.add.image(W / 2, 16, 'title_logo').setOrigin(0.5, 0);
    this.tweens.add({ targets: logo, y: 19, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    txt(this, W / 2, 108, 'FROM THE TOWN TO THE STARS', { align: 'center', color: C.gold2 });
    // menu
    const hasSave = !!store.mission && store.mission.phase !== 'COMPLETE';
    const items: [string, () => void, string][] = [
      ['NEW MISSION', () => this.newMission(), 'Start the story in Oakland.'],
      ['QUICK START', () => this.quickStart(), 'Skip the story: go straight to the spacecraft builder (Q).'],
      ...(hasSave ? [['CONTINUE MISSION', () => this.continueMission(), 'Resume your saved mission.'] as [string, () => void, string]] : []),
      ['HOW TO PLAY', () => this.howTo(), 'Controls and goals.'],
      ['ABOUT & SOURCES', () => this.about(), 'Science references and credits.'],
    ];
    const bw = 132;
    items.forEach(([label, fn, tip], i) => new Button(this, W / 2 - bw / 2, 128 + i * 21, label, fn, { w: bw, h: 18, tooltip: tip, style: i === 0 ? 'go' : 'normal' }));
    txt(this, W / 2, H - 12, 'A fictional mission. Not affiliated with or endorsed by NASA.', { align: 'center', color: C.dim });
    txt(this, 4, H - 12, 'v1.0', { color: C.dim });
    const hint = txt(this, W / 2, 128 + items.length * 21 + 4, 'PRESS ENTER', { align: 'center', color: C.white });
    this.tweens.add({ targets: hint, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
    gearButton(this);
    crt(this);
    // Enter starts (or continues) the mission, but not while a window (How to play, Quick start) is open:
    // Phaser fires keydown-ENTER before the window's own key handler, so the window is still counted open.
    this.input.keyboard?.on('keydown-ENTER', () => { if (modalState.open) return; audio.unlock(); audio.sfx('select'); hasSave ? this.continueMission() : this.newMission(); });
    this.input.once('pointerdown', () => audio.unlock());
    this.input.keyboard?.on('keydown-Q', () => { if (!modalState.open) { audio.unlock(); this.quickStart(); } });
  }
  newMission() {
    store.clearMission();
    if (!store.design || !store.design.slots) store.design = cloneDesign(BASELINE_DESIGN);
    fadeTo(this, store.seen.intro ? 'Intro' : 'Intro', { skippable: !!store.seen.intro });
  }
  /**
   * Quick start (for judges and returning players): skip Oakland, the briefing and the role and mission
   * picks, and open the hangar with the starter design, which is deliberately too heavy for its
   * rocket. NEW MISSION still plays the full story.
   */
  quickStart() {
    if (modalState.open) return;
    audio.sfx('select');
    modal(this, {
      title: 'QUICK START: THE HANGAR',
      text: 'You are the chief engineer of TOWN-1, a crewed Moon landing. Every part you pick changes the spacecraft\'s mass, cost, power and fuel, and the rocket equation decides whether it can reach the Moon and bring the crew home.\n\n' +
        'The starter design is too heavy for its rocket. Fix the red items (HINT helps), check the math at the Calculation Desk, pass the design review, then launch.\n\n' +
        'The full Oakland story is under NEW MISSION.',
      options: [{ label: 'TO THE HANGAR' }, { label: 'Back' }],
      width: 380,
      onChoose: (i) => {
        if (i !== 0) return;
        store.clearMission();
        const d = cloneDesign(BASELINE_DESIGN);
        d.spec = { ...d.spec, role: 'commander', difficulty: 'easy', mission: 'moon' };
        store.design = d;
        store.saveDesign();
        fadeTo(this, 'Hangar', { tutorial: true, quick: true });
      },
    });
  }
  continueMission() {
    const m = store.mission!;
    const map: Record<string, string> = { TRANSIT_OUT: 'Ops', LOI_PENDING: 'Ops', LUNAR_ORBIT: 'Ops', LUNAR_ORBIT_POST: 'Ops', TRANSIT_BACK: 'Ops', FREE_RETURN: 'Ops', DESCENT: 'Landing', SURFACE: 'Surface', ENTRY: 'Return', COMPLETE: 'Report' };
    fadeTo(this, map[m.phase] ?? 'Ops');
  }
  howTo() {
    modal(this, {
      title: 'HOW TO PLAY',
      text: 'Lead the TOWN-1 crew from Oakland to the Moon (or the ISS) and back.\n\n1. BUILD: pick spacecraft systems in the hangar. Watch mass, budget, power and Δv.\n2. CHECK: work through the Calculation Desk sheets.\n3. REVIEW: fix every red (blocking) item before launch.\n4. FLY: manage power, data and life support. Respond to emergencies.\n5. LAND: fly the lander (arrows / W A S D, or the autopilot).\n6. EXPLORE: spend EVA hours on science, then get the crew home.\n\nMouse: click everything. Keys: Enter = confirm, Esc = pause & settings, 1-4 = choose options, F = fullscreen. QUICK START (Q) skips the story.',
      options: [{ label: 'Got it!' }], onChoose: () => undefined, width: 360,
    });
  }
  about() {
    modal(this, {
      title: 'ABOUT OAKLAND TO THE MOON',
      text: 'An educational systems-engineering game for the 2026 NASA Space Apps Challenge (Space Mission Design Game). The agency, rockets, crew and mission are fictional.\n\nPhysics: rocket equation, battery energy balance, data storage balance, NASA-style life-support rates. Simplified and documented in docs/SCIENTIFIC_ASSUMPTIONS.md; references in SOURCES.md.\n\nAll art and music are original and generated procedurally by code.',
      options: [{ label: 'Close' }], onChoose: () => undefined, width: 360,
    });
    void panel;
  }
}
