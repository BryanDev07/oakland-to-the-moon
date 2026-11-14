import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { Button, C, crt, Dialogue, fadeIn, fadeTo, gearButton, H, txt, W } from '../ui/ui';
import { BUDGET_M } from '../../simulation/constants';

/** Mission control briefing: explains segments, architecture and constraints over animated wall screens. */
export class BriefingScene extends Phaser.Scene {
  screens!: Phaser.GameObjects.Graphics;
  t = 0;
  mode = 0;
  constructor() { super('Briefing'); }
  create() {
    fadeIn(this);
    audio.music('build');
    this.add.image(0, 0, 'mission_control').setOrigin(0, 0);
    // operators at consoles
    const seats = [[60, 136], [150, 136], [330, 136], [420, 136], [100, 176], [250, 176], [380, 176]];
    seats.forEach(([x, y], i) => this.add.sprite(x, y, 'operators').setOrigin(0.5, 1).play({ key: `op${i % 4}`, startFrame: i % 2 }));
    // blinking console lights
    for (let i = 0; i < 30; i++) {
      const l = this.add.rectangle(Phaser.Math.Between(10, W - 10), Phaser.Math.Between(150, 240), 2, 1, [C.red, C.gold, C.green][i % 3]);
      this.tweens.add({ targets: l, alpha: 0.1, duration: Phaser.Math.Between(300, 1200), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1000) });
    }
    this.screens = this.add.graphics();
    this.add.image(170 + 8, 12 + 8, 'earth_small').setScale(1).setOrigin(0, 0);
    this.add.image(170 + 104, 12 + 30, 'moon_small').setOrigin(0, 0);
    this.clock = txt(this, 240, 114, '', { align: 'center', color: C.red });
    this.labels = [
      txt(this, 86, 22, 'GROUND SEGMENT', { align: 'center', color: C.teal }),
      txt(this, 394, 22, 'TELEMETRY', { align: 'center', color: C.teal }),
    ];
    this.tele = txt(this, 330, 36, '', { color: C.green, maxWidth: 128 });
    const dlg = new Dialogue(this);
    dlg.play([
      { who: 'Director Cole', text: 'Welcome to Mission Control, Commander. TOWN-1 is a system of four segments: LAUNCH, SPACE, GROUND and SCIENCE.', portrait: 'portrait_director' },
      { who: 'Director Cole', text: 'Change one segment and you change them all. A heavier ship needs a bigger rocket. A faster antenna needs more power. That is systems engineering.', portrait: 'portrait_director' },
      { who: 'Director Cole', text: 'The plan: a rocket sends the stack toward the Moon. The service module brakes into lunar orbit, the lander takes two crew down and back up, then the service module burns for home.', portrait: 'portrait_director' },
      { who: 'Director Cole', text: `You have $${(BUDGET_M / 1000).toFixed(1)} billion. Every kilogram must be pushed by propellant, and propellant is itself mass. Watch your Δv margin.`, portrait: 'portrait_director' },
      { who: 'CAPCOM Sam', text: 'We will be on the radio the whole way, Commander. Build it right and we will bring you home.', portrait: 'portrait_capcom' },
    ], () => this.go());
    this.events.on('update', () => undefined);
    new Button(this, 4, 4, 'SKIP ▶', () => this.go(), { w: 46 }).setDepth(1200);
    gearButton(this);
    crt(this);
    this.input.once('pointerdown', () => audio.unlock());
  }
  clock!: Phaser.GameObjects.BitmapText;
  labels: Phaser.GameObjects.BitmapText[] = [];
  tele!: Phaser.GameObjects.BitmapText;
  go() { fadeTo(this, 'RoleSelect'); } // spec: pick difficulty and specialty before the hangar
  update(_t: number, dt: number) {
    this.t += dt / 1000;
    const g = this.screens; g.clear();
    // centre screen: figure-eight Earth-Moon trajectory drawn progressively
    const ex = 186, ey = 60, mx = 290, my = 58;
    g.lineStyle(1, 0x2e9088, 1);
    const prog = (this.t * 0.25) % 1.2;
    let px = 0, py = 0;
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      if (u > prog) break;
      const a = u * Math.PI * 2;
      const x = (ex + mx) / 2 + Math.cos(a) * ((mx - ex) / 2 + 8);
      const y = (ey + my) / 2 + Math.sin(a * 2) * 18;
      if (i > 0 && i % 2 === 0) g.lineBetween(px, py, x, y);
      px = x; py = y;
    }
    g.fillStyle(0xffe27a).fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
    // left screen: rotating radar sweep over the world map
    const cx = 86, cy = 60;
    const ang = this.t * 1.5;
    g.lineStyle(1, 0x80d4bc, 0.8).lineBetween(cx, cy, cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
    g.strokeCircle(cx, cy, 30);
    for (const [sx, sy] of [[40, 52], [116, 56], [70, 76]]) { g.fillStyle(0xf4c63c, 0.6 + 0.4 * Math.sin(this.t * 4 + sx)).fillRect(sx, sy, 2, 2); }
    // telemetry readout
    if (Math.floor(this.t * 4) !== this.mode) {
      this.mode = Math.floor(this.t * 4);
      this.tele.setText(`PAD 39-T  GO\nWX  CLEAR\nDSN  3 STN\nLV   READY\nLOX  ${(97 + Math.random() * 2).toFixed(1)}%\nCOMM ${Math.random() > 0.1 ? 'NOM' : 'CHK'}`);
    }
    this.clock.setText(`T-MINUS 14d ${String(23 - Math.floor(this.t / 60) % 24).padStart(2, '0')}:${String(59 - Math.floor(this.t) % 60).padStart(2, '0')}:${String(59 - Math.floor(this.t * 10) % 60).padStart(2, '0')}`);
    void H;
  }
}
