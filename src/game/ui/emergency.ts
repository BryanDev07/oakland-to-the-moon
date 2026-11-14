/**
 * The emergency screen (JOSEPH_SPEC tab 7 "How an emergency works"), shared by every scene:
 * 1. pause and explain; 2. three options with Good (green) and Bad (red) lines using the player's
 * numbers; 3. apply; 4. the flight director's view (+ bonus on Hard). Easy shows a hint first.
 * The Spacecraft Engineer gets one free fix on Hard (cancels the Bad effect of the chosen option).
 */
import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { store } from '../../state/store';
import { modal } from './ui';
import * as Sim from '../../simulation/mission';
import type { MissionState } from '../../simulation/types';
import { specOf } from '../../simulation/specModel';
import { roleOf } from '../../data/roles';

/** True while an emergency (or its mission-control result) is on screen. */
export const emergencyUI = { open: false };

export function showEmergency(scene: Phaser.Scene, s: MissionState, onDone: () => void, armed = false) {
  const ev = s.pending;
  const done = () => { emergencyUI.open = false; onDone(); };
  if (!ev) { done(); return; }
  emergencyUI.open = true;
  audio.sfx('alarm');
  if (store.settings.screenShake && !armed) scene.cameras.main.shake(300, 0.004);
  const sp = specOf(s.design);
  const canFix = sp.difficulty === 'hard' && !!roleOf(sp.role)?.freeFixHard && !s.em?.freeFixUsed && ev.fdPick !== undefined;
  const tag = ev.stage ? `${ev.stage}  ·  ${ev.real ? `This really happened: ${ev.real}` : ev.scenario ? 'Scenario (made up, but realistic)' : ''}\n` : '';
  const hint = ev.hint ? `\nMISSION CONTROL HINT: ${ev.hint}` : '';
  const options = ev.options.map((o) => ({ label: armed ? `${o.label} (FREE FIX)` : o.label, detail: o.detail || undefined, good: o.good, bad: armed ? 'Cancelled by your free fix.' : o.bad }));
  if (canFix && !armed) options.push({ label: '★ Use your one free fix (Spacecraft Engineer)', detail: 'Then pick A, B or C: its Bad effect will not happen.', good: undefined, bad: undefined });
  modal(scene, {
    title: ev.title, text: `${tag}${ev.text}${hint}`, learn: ev.learn || undefined, alert: true, width: 440,
    options,
    onChoose: (i) => {
      if (canFix && !armed && i === ev.options.length) { showEmergency(scene, s, onDone, true); return; }
      const msg = Sim.resolveEvent(s, i, armed);
      store.saveMission();
      if (ev.fdPick === undefined) { done(); return; } // legacy event: the caller shows its own toast
      modal(scene, { title: 'MISSION CONTROL', text: msg, options: [{ label: 'Continue' }], width: 400, onChoose: () => done() });
    },
  });
}
