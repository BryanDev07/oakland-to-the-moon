import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, chapterCard, crt, Dialogue, fadeIn, fadeTo, gearButton, H, Line, txt, W } from '../ui/ui';

const WORLD_W = 1200, GROUND = 238;

interface Beat { x: number; lines: Line[]; done?: boolean; npc?: Phaser.GameObjects.Sprite }

export class IntroScene extends Phaser.Scene {
  kai!: Phaser.GameObjects.Sprite;
  dlg!: Dialogue;
  beats: Beat[] = [];
  targetX: number | null = null;
  talking = false;
  ended = false;
  keys!: { [k: string]: Phaser.Input.Keyboard.Key };
  constructor() { super('Intro'); }
  create() {
    fadeIn(this);
    this.ended = false; this.talking = true; this.targetX = null;
    audio.music('title');
    this.cameras.main.setBounds(0, 0, WORLD_W, H);
    this.add.image(0, 0, 'sky_dusk').setOrigin(0, 0).setScrollFactor(0);
    this.add.image(0, 0, 'skyline_dusk').setOrigin(0, 0).setScrollFactor(0.22);
    this.add.image(0, 0, 'oak_mid').setOrigin(0, 0).setScrollFactor(0.44);
    // BART train on the elevated guideway (mid layer)
    const train = this.add.image(-160, 159, 'train').setOrigin(0, 0).setScrollFactor(0.44);
    this.tweens.add({ targets: train, x: 900, duration: 9000, repeat: -1, repeatDelay: 5000, delay: 2500 });
    this.add.image(0, 0, 'oak_street').setOrigin(0, 0);
    // lamp flicker glows
    for (const lx of [222, 712]) {
      const g = this.add.circle(lx + 1, GROUND - 55, 10, 0xffe0a0, 0.18);
      this.tweens.add({ targets: g, alpha: 0.08, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1500, 4000) });
    }
    // townspeople
    const dee = this.add.sprite(318, GROUND, 'town_3').setOrigin(0.5, 1).setFlipX(true).play('town_3-idle');
    const kid = this.add.sprite(640, GROUND, 'town_2').setOrigin(0.5, 1).setFlipX(true).play('town_2-wave');
    const walker = this.add.sprite(420, GROUND, 'town_0').setOrigin(0.5, 1).play('town_0-walk').setFlipX(true);
    this.tweens.add({ targets: walker, x: 120, duration: 14000, yoyo: true, repeat: -1, onYoyo: () => walker.setFlipX(false), onRepeat: () => walker.setFlipX(true) });
    const jogger = this.add.sprite(860, GROUND, 'town_1').setOrigin(0.5, 1).play('town_1-walk');
    this.tweens.add({ targets: jogger, x: 1150, duration: 9000, yoyo: true, repeat: -1, onYoyo: () => jogger.setFlipX(true), onRepeat: () => jogger.setFlipX(false) });
    // Kai
    this.kai = this.add.sprite(40, GROUND, 'kai_civ').setOrigin(0.5, 1).play('kai_civ-idle');
    this.cameras.main.startFollow(this.kai, true, 0.08, 0.08, 0, 0);
    this.dlg = new Dialogue(this);
    this.dlg.setScrollFactor(0);
    this.beats = [
      { x: 60, lines: [
        { who: 'Oakland, California', text: 'The Town. Home of Commander Kai Alvarado, selected to lead the first TOWN-1 crewed lunar mission.' },
        { who: 'Kai', text: 'Last evening on the block before launch prep. Gotta say goodbye properly.', portrait: 'portrait_kai' },
      ] },
      { x: 280, npc: dee, lines: [
        { who: 'Auntie Dee', text: 'Commander Kai! You used to come in here at nine years old asking how far away the Moon was.', portrait: 'portrait_dee' },
        { who: 'Kai', text: '384,000 kilometers, Auntie Dee. I still remember.', portrait: 'portrait_kai' },
        { who: 'Auntie Dee', text: 'Then go measure it yourself. And bring a rock back for my counter!', portrait: 'portrait_dee' },
      ] },
      { x: 470, lines: [{ who: 'Kai', text: 'The neighborhood painted a rocket on the mural wall last week. No pressure, right?', portrait: 'portrait_kai' }] },
      { x: 600, npc: kid, lines: [
        { who: 'Robotics kid', text: 'Coach Kai! Is it true you get to pick the parts for the spaceship?' },
        { who: 'Kai', text: 'Every part is a trade-off. More fuel means more weight. More weight needs a bigger rocket. Engineering is choosing well.', portrait: 'portrait_kai' },
        { who: 'Robotics kid', text: 'Then choose well! And wave to us from the Moon!' },
      ] },
      { x: 860, lines: [
        { who: 'Director Cole', text: 'Kai, it is Imani Cole at Mission Control. The flight hardware is in the build bay. Budget is tight and the rocket has limits.', portrait: 'portrait_director' },
        { who: 'Director Cole', text: 'You will configure the spacecraft and the mission plan. Your design. Your call.', portrait: 'portrait_director' },
        { who: 'Kai', text: 'From the Town to the Stars. On my way.', portrait: 'portrait_kai' },
      ] },
    ];
    this.keys = this.input.keyboard!.addKeys('RIGHT,LEFT,D,A') as { [k: string]: Phaser.Input.Keyboard.Key };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { audio.unlock(); if (!this.talking && p.y < H - 70) this.targetX = Phaser.Math.Clamp(p.worldX, 20, WORLD_W - 20); });
    const hint = txt(this, W / 2, 6, 'CLICK WHERE TO WALK  (or hold → / D)', { align: 'center', color: C.gold2 }).setScrollFactor(0).setDepth(400);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
    new Button(this, 4, 4, 'SKIP ▶', () => this.finish(), { w: 46 }).setScrollFactor(0).setDepth(1200);
    gearButton(this);
    crt(this);
    chapterCard(this, 1, 'MADE IN OAKLAND', () => { this.talking = false; });
  }
  update(_t: number, dtMs: number) {
    if (this.ended) return;
    const dt = dtMs / 1000;
    let dir = 0;
    if (!this.talking) {
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) { dir = 1; this.targetX = null; }
      else if (this.keys.LEFT.isDown || this.keys.A.isDown) { dir = -1; this.targetX = null; }
      else if (this.targetX !== null) { const d = this.targetX - this.kai.x; if (Math.abs(d) > 2) dir = Math.sign(d); else this.targetX = null; }
    }
    if (dir) {
      this.kai.x = Phaser.Math.Clamp(this.kai.x + dir * 64 * dt, 20, WORLD_W - 20);
      this.kai.setFlipX(dir < 0);
      if (this.kai.anims.currentAnim?.key !== 'kai_civ-walk') this.kai.play('kai_civ-walk');
    } else if (this.kai.anims.currentAnim?.key === 'kai_civ-walk') this.kai.play('kai_civ-idle');
    if (!this.talking) {
      const beat = this.beats.find((b) => !b.done && this.kai.x >= b.x);
      if (beat) {
        beat.done = true; this.talking = true; this.targetX = null;
        this.kai.play('kai_civ-idle');
        if (beat.npc) this.kai.setFlipX(beat.npc.x < this.kai.x);
        this.dlg.play(beat.lines, () => { this.talking = false; if (beat === this.beats[this.beats.length - 1]) this.finish(); });
      }
    }
    if (this.kai.x > WORLD_W - 60) this.finish();
  }
  finish() {
    if (this.ended) return;
    this.ended = true;
    store.markSeen('intro');
    fadeTo(this, 'Briefing');
  }
}
