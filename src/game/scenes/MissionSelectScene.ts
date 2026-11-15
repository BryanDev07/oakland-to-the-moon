import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, crt, fadeIn, fadeTo, gearButton, onceKey, txt, W } from '../ui/ui';
import { MISSIONS, MissionId, missionOf } from '../../data/missionConfig';
import { specOf } from '../../simulation/specModel';
import { fmtUsd } from '../../simulation/units';

/**
 * E1: after the role pick, choose the mission. Both use the same hangar, desk, emergencies and report;
 * what differs lives in missionConfig.ts. Keys: Left / Right or 1 / 2 to pick, Enter to confirm.
 */
export class MissionSelectScene extends Phaser.Scene {
  pick: MissionId = 'moon';
  cards: { id: MissionId; card: Phaser.GameObjects.NineSlice }[] = [];
  constructor() { super('MissionSelect'); }
  create() {
    fadeIn(this);
    this.cards = [];
    this.pick = missionOf(store.design);
    this.add.image(0, 0, 'mission_control').setOrigin(0, 0).setTint(0x606080);
    txt(this, W / 2, 6, 'CHOOSE YOUR MISSION', { align: 'center', color: C.gold });
    const hard = specOf(store.design).difficulty === 'hard';
    (['moon', 'iss'] as MissionId[]).forEach((id, i) => {
      const m = MISSIONS[id];
      const x = 8 + i * 236, y = 24;
      const card = this.add.nineslice(x, y, 'card', undefined, 228, 186, 6, 6, 6, 6).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      card.on('pointerup', () => this.choose(id));
      card.on('pointerover', () => audio.sfx('move'));
      this.cards.push({ id, card });
      let cy = y + 6;
      const line = (s: string, color: number, size = 10) => { const t = txt(this, x + 8, cy, s, { color, maxWidth: 212, size }); cy += t.height + 4; };
      line(`${i + 1}. ${m.name.toUpperCase()}`, C.gold2, 15);
      line(m.blurb, C.white);
      line(`Rocket must reach ${m.dvTarget.toLocaleString('en-US')} m/s.`, C.teal);
      line(`Budget (${hard ? 'Hard' : 'Easy'}): ${fmtUsd(m.budgetsUsd[hard ? 'hard' : 'easy'].v)}.`, C.teal);
      line(`Coming home at ${m.reentryMph.v.toLocaleString('en-US')} mph; messages take ${(m.signalMiles.v / 186_282).toFixed(2)} s.`, C.teal);
      line(id === 'moon'
        ? 'Phases: launch, coast 3 days, lunar orbit, landing, moonwalk, return.'
        : 'Phases: launch, 1 day catching up, docking, spacewalk to fix a solar panel, return.', C.text);
      if (id === 'iss') line('Tip: a small rocket and the cheap Earth-orbit capsule are enough here.', C.green);
    });
    new Button(this, W - 100, 240, 'CONFIRM ▶', () => this.go(), { w: 92, h: 22, style: 'go', tooltip: 'Head to the hangar (Enter)' });
    txt(this, 8, 246, 'Left / Right or 1 / 2 to pick, Enter to confirm.', { color: C.dim });
    this.input.keyboard?.on('keydown', onceKey((e: KeyboardEvent) => {
      if (e.key === '1' || e.key === 'ArrowLeft') this.choose('moon');
      else if (e.key === '2' || e.key === 'ArrowRight') this.choose('iss');
      else if (e.key === 'Enter') this.go();
    }));
    gearButton(this);
    crt(this);
    this.refresh();
  }
  choose(id: MissionId) { if (this.pick !== id) audio.sfx('select'); this.pick = id; this.refresh(); }
  refresh() { for (const c of this.cards) c.card.setTexture(c.id === this.pick ? 'card_sel' : 'card'); }
  go() {
    audio.sfx('success');
    store.design.spec = { ...specOf(store.design), mission: this.pick };
    store.saveDesign();
    fadeTo(this, 'Hangar', { tutorial: true });
  }
}
