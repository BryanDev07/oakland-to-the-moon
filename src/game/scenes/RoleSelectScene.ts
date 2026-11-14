import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, txt, W } from '../ui/ui';
import { ROLES } from '../../data/roles';
import { BUDGETS_USD, Difficulty, RoleId } from '../../data/specParts';
import { specOf } from '../../simulation/specModel';
import { fmtUsd } from '../../simulation/units';

/**
 * Oakland, before the mission (JOSEPH_SPEC tab 2 phase 1 + tab 5): pick difficulty and Kai's
 * specialty. Single player: the specialty changes discounts and perks, not the number of players.
 * Keys: 1-4 or arrows pick a role, E / H pick difficulty, Enter confirms.
 */
export class RoleSelectScene extends Phaser.Scene {
  role: RoleId = 'commander';
  difficulty: Difficulty = 'easy';
  cards: { id: RoleId; card: Phaser.GameObjects.NineSlice }[] = [];
  diffBtns: { id: Difficulty; b: Button }[] = [];
  diffText!: Phaser.GameObjects.BitmapText;
  constructor() { super('RoleSelect'); }

  create() {
    fadeIn(this);
    audio.music('build');
    const sp = specOf(store.design);
    this.role = sp.role ?? 'commander';
    this.difficulty = sp.difficulty;
    this.cards = []; this.diffBtns = [];
    this.add.image(0, 0, 'mission_control').setOrigin(0, 0).setTint(0x606080);
    txt(this, W / 2, 6, 'CHOOSE YOUR SPECIALTY', { align: 'center', color: C.gold });
    txt(this, W / 2, 17, 'Single player: your specialty changes your discounts, perks and tips.', { align: 'center', color: C.dim });

    ROLES.forEach((r, i) => {
      const x = 8 + (i % 2) * 236, y = 27 + Math.floor(i / 2) * 94;
      const card = this.add.nineslice(x, y, 'card', undefined, 228, 91, 6, 6, 6, 6).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      card.on('pointerup', () => this.pick(r.id));
      card.on('pointerover', () => audio.sfx('move'));
      this.cards.push({ id: r.id, card });
      // lay lines out by their measured height so wrapped text never overlaps
      let cy = y + 4;
      const line = (s: string, color: number) => { const t = txt(this, x + 6, cy, s, { color, maxWidth: 216 }); cy += t.height + 1; };
      line(`${i + 1}. ${r.name.toUpperCase()}`, C.gold2);
      line(r.segment, C.teal);
      line(`Owns: ${r.ownsText}`, C.text);
      line(`Perk: ${r.perk}`, C.green);
      line(`Weakness: ${r.weakness}`, C.orange);
    });

    txt(this, 8, 221, 'DIFFICULTY', { color: C.dim });
    (['easy', 'hard'] as Difficulty[]).forEach((d, i) => {
      const b = new Button(this, 70 + i * 64, 217, d === 'easy' ? 'EASY (E)' : 'HARD (H)', () => this.setDiff(d), { w: 60, h: 16 });
      this.diffBtns.push({ id: d, b });
    });
    this.diffText = txt(this, 8, 238, '', { color: C.text, maxWidth: 360 });
    new Button(this, W - 100, 240, 'CONFIRM ▶', () => this.go(), { w: 92, h: 22, style: 'go', tooltip: 'Head to the hangar (Enter)' });

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ROLES.length) this.pick(ROLES[n - 1].id);
      const idx = ROLES.findIndex((r) => r.id === this.role);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.pick(ROLES[(idx + 1) % ROLES.length].id);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.pick(ROLES[(idx + ROLES.length - 1) % ROLES.length].id);
      if (e.key === 'e' || e.key === 'E') this.setDiff('easy');
      if (e.key === 'h' || e.key === 'H') this.setDiff('hard');
      if (e.key === 'Enter') this.go();
    });
    gearButton(this);
    crt(this);
    this.refresh();
    this.input.once('pointerdown', () => audio.unlock());
  }

  pick(id: RoleId) { if (this.role !== id) audio.sfx('select'); this.role = id; this.refresh(); }
  setDiff(d: Difficulty) { if (this.difficulty !== d) audio.sfx('select'); this.difficulty = d; this.refresh(); }

  refresh() {
    for (const c of this.cards) c.card.setTexture(c.id === this.role ? 'card_sel' : 'card');
    for (const d of this.diffBtns) d.b.setSelected(d.id === this.difficulty);
    const budget = BUDGETS_USD[this.difficulty].v * (this.role === 'commander' ? 1.05 : 1);
    this.diffText.setText(this.difficulty === 'easy'
      ? `EASY (sandbox): budget ${fmtUsd(budget)}. Formulas, worked examples and hints. 3 softer emergencies.`
      : `HARD (realistic): budget ${fmtUsd(budget)}. Formulas and targets only. 5 full-strength emergencies.`);
  }

  go() {
    audio.sfx('success');
    store.design.spec = { ...(store.design.spec ?? {}), role: this.role, difficulty: this.difficulty };
    store.saveDesign();
    fadeTo(this, 'Hangar', { tutorial: true });
  }
}
