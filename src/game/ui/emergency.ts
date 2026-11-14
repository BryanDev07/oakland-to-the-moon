/**
 * The emergency screen (JOSEPH_SPEC tab 7 "How an emergency works"), shared by every scene:
 * 1. pause and explain; 2. three options, each with a Good (green) and Bad (red) line using the
 * player's numbers; 3. apply; 4. the flight director's view (+ bonus on Hard). Easy shows a hint.
 * The Spacecraft Engineer gets one free fix on Hard (cancels the Bad effect of the chosen option).
 * Readable layout: 15 px text, a few short lines, and the Good/Bad lines shown for the highlighted
 * option. Keys: Up/Down to move, Enter to choose, 1-4 to choose directly.
 */
import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { Button, C, modal, onceKey, panel, pinToScreen, txt, W, H } from './ui';
import * as Sim from '../../simulation/mission';
import type { MissionState } from '../../simulation/types';
import { specOf } from '../../simulation/specModel';
import { roleOf } from '../../data/roles';

/** True while an emergency (or its mission-control result) is on screen. */
export const emergencyUI = { open: false };

const BODY = 15;
const COL = { text: 0xfff4d6, tag: 0x9fe0ff, hint: 0x6ff0ff, good: 0x7cf07c, bad: 0xff6a5a };

export function showEmergency(scene: Phaser.Scene, s: MissionState, onDone: () => void, armed = false) {
  const ev = s.pending;
  const done = () => { emergencyUI.open = false; onDone(); };
  if (!ev) { done(); return; }
  emergencyUI.open = true;
  audio.sfx('alarm');
  if (store.settings.screenShake && !armed) scene.cameras.main.shake(300, 0.004);
  const sp = specOf(s.design);
  const canFix = sp.difficulty === 'hard' && !!roleOf(sp.role)?.freeFixHard && !s.em?.freeFixUsed && ev.fdPick !== undefined;
  const opts = ev.options.map((o) => ({ label: armed ? `${o.label} (FREE FIX)` : o.label, good: o.good, bad: armed ? 'Cancelled by your free fix.' : o.bad, detail: o.detail }));
  if (canFix && !armed) opts.push({ label: '* Use your one free fix (Spacecraft Engineer)', good: 'Then pick A, B or C: its Bad effect will not happen.', bad: undefined, detail: '' });

  const c = scene.add.container(0, 0).setDepth(900);
  c.add(scene.add.rectangle(0, 0, W, H, 0x04030c, 0.78).setOrigin(0, 0).setInteractive());
  c.add(panel(scene, 6, 4, W - 12, H - 8, 'panel_alert'));
  const x = 16, w = W - 32;
  let y = 10;
  const line = (s2: string, color: number, dy = 2) => { const t = txt(scene, x, y, s2, { color, size: BODY, maxWidth: w }); c.add(t); y += t.height + dy; return t; };
  c.add(txt(scene, W / 2, y, ev.title, { align: 'center', color: C.gold2, size: BODY, maxWidth: w })); y += 18;
  if (ev.stage) line(`${ev.stage}  ·  ${ev.real ? 'This really happened' : ev.scenario ? 'Scenario (made up, realistic)' : ''}`, COL.tag);
  const body = line(ev.text, COL.text, 3);
  if (ev.hint) line(`Hint: ${ev.hint}`, COL.hint, 3);
  // options, then the highlighted option's Good / Bad lines
  let sel = 0;
  const rows: Button[] = [];
  opts.forEach((o, i) => {
    const b = new Button(scene, x, y, `${i + 1}. ${o.label}`, () => choose(i), { w, h: 19 });
    b.label.setFontSize(BODY).setOrigin(0, 0).setX(8).setY(2).setMaxWidth(w - 16);
    b.bg.on('pointerover', () => { sel = i; refresh(); });
    c.add(b); rows.push(b); y += 21;
  });
  const goodT = txt(scene, x, y + 2, '', { color: COL.good, size: BODY, maxWidth: w });
  const badT = txt(scene, x, y + 2, '', { color: COL.bad, size: BODY, maxWidth: w });
  c.add([goodT, badT]);
  const keyHint = txt(scene, W / 2, H - 22, 'Up / Down to choose, Enter to confirm', { align: 'center', color: COL.tag, size: BODY });
  c.add(keyHint);
  function refresh() {
    rows.forEach((b, i) => b.setSelected(i === sel));
    const o = opts[sel];
    goodT.setText(o.good ? `Good: ${o.good}` : o.detail ?? '');
    badT.setText(o.bad ? `Bad: ${o.bad}` : '').setY(goodT.y + goodT.height + 2);
    // never clip: if the details run into the key hint, hide the hint
    keyHint.setVisible(badT.y + badT.height < H - 24);
  }
  refresh();
  void body;
  pinToScreen(c);

  const keyH = onceKey((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { sel = (sel + 1) % opts.length; audio.sfx('move'); refresh(); }
    else if (e.key === 'ArrowUp') { sel = (sel + opts.length - 1) % opts.length; audio.sfx('move'); refresh(); }
    else if (e.key === 'Enter') choose(sel);
    else { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) choose(n - 1); }
  });
  scene.input.keyboard?.on('keydown', keyH);
  scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown', keyH));
  let chosen = false;
  function choose(i: number) {
    if (chosen) return;
    chosen = true;
    audio.sfx('select');
    scene.input.keyboard?.off('keydown', keyH);
    c.destroy();
    if (canFix && !armed && i === ev!.options.length) { showEmergency(scene, s, onDone, true); return; }
    const msg = Sim.resolveEvent(s, i, armed);
    store.saveMission();
    if (ev!.fdPick === undefined) { done(); return; } // legacy event: the caller shows its own toast
    modal(scene, { title: 'MISSION CONTROL', text: `${msg}${ev!.real ? `\nThis really happened: ${ev!.real}` : ''}`, options: [{ label: 'Continue' }], width: 440, onChoose: () => done() });
  }
}
