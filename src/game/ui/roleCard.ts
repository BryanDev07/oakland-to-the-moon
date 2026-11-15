/**
 * D3: the ROLE DECISION card. Same layout and keys as the emergency card (Up / Down, Enter, 1-3; the
 * highlighted option shows its Good and Bad lines), but blue, with a one-line role tip in the player's
 * explain level.
 */
import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { Button, C, modalState, onceKey, panel, pinToScreen, txt, W, H } from './ui';
import { emergencyUI } from './emergency';
import { byLevel } from './explain';
import { learned } from './learned';
import type { Tip } from '../../simulation/roleDecisions';

const BODY = 15;
const COL = { text: 0xfff4d6, tag: 0x9fe0ff, tip: 0x6ff0ff, good: 0x7cf07c, bad: 0xff6a5a };

export function showRoleCard(scene: Phaser.Scene, card: { title: string; text: string; tip: Tip; options: { label: string; good: string; bad: string }[] }, onChoose: (i: number) => void) {
  emergencyUI.open = true;
  modalState.open++;
  audio.sfx('beep');
  const c = scene.add.container(0, 0).setDepth(900);
  c.add(scene.add.rectangle(0, 0, W, H, 0x04030c, 0.72).setOrigin(0, 0).setInteractive());
  c.add(panel(scene, 6, 4, W - 12, H - 8, 'panel'));
  const x = 16, w = W - 32;
  let y = 10;
  const line = (s: string, color: number, dy = 2) => { const t = txt(scene, x, y, s, { color, size: BODY, maxWidth: w }); c.add(t); y += t.height + dy; return t; };
  c.add(txt(scene, W / 2, y, 'ROLE DECISION', { align: 'center', color: C.gold2, size: BODY })); y += 18;
  line(card.title, COL.tag);
  line(card.text, COL.text, 3);
  line(byLevel(...card.tip), COL.tip, 3);
  let sel = 0;
  const rows: Button[] = [];
  card.options.forEach((o, i) => {
    const b = new Button(scene, x, y, `${i + 1}. ${o.label}`, () => choose(i), { w, h: 19 });
    b.label.setFontSize(BODY).setOrigin(0, 0).setX(8).setY(2).setMaxWidth(w - 16);
    b.bg.on('pointerover', () => { sel = i; refresh(); });
    c.add(b); rows.push(b); y += 21;
  });
  const goodT = txt(scene, x, y + 2, '', { color: COL.good, size: BODY, maxWidth: w });
  const badT = txt(scene, x, y + 2, '', { color: COL.bad, size: BODY, maxWidth: w });
  const keyHint = txt(scene, W / 2, H - 22, 'Up / Down to choose, Enter to confirm', { align: 'center', color: COL.tag, size: BODY });
  c.add([goodT, badT, keyHint]);
  function refresh() {
    rows.forEach((b, i) => b.setSelected(i === sel));
    const o = card.options[sel];
    goodT.setText(`Good: ${o.good}`);
    badT.setText(`Bad: ${o.bad}`).setY(goodT.y + goodT.height + 2);
    keyHint.setVisible(badT.y + badT.height < H - 24);
  }
  refresh();
  pinToScreen(c);
  // the key press that opened this card (e.g. Enter on DESK) must not also answer it
  const openedAt = performance.now();
  const keyH = onceKey((e: KeyboardEvent) => {
    if (e.timeStamp <= openedAt) return;
    if (e.key === 'ArrowDown') { sel = (sel + 1) % card.options.length; audio.sfx('move'); refresh(); }
    else if (e.key === 'ArrowUp') { sel = (sel + card.options.length - 1) % card.options.length; audio.sfx('move'); refresh(); }
    else if (e.key === 'Enter') choose(sel);
    else { const n = parseInt(e.key, 10); if (n >= 1 && n <= card.options.length) choose(n - 1); }
  });
  scene.input.keyboard?.on('keydown', keyH);
  let done = false;
  const release = () => { if (done) return; done = true; scene.input.keyboard?.off('keydown', keyH); emergencyUI.open = false; modalState.open = Math.max(0, modalState.open - 1); };
  scene.events.once('shutdown', release);
  function choose(i: number) {
    if (done) return;
    audio.sfx('select');
    release();
    c.destroy();
    learned(scene, 'tradeoff', 200);
    onChoose(i);
  }
}
