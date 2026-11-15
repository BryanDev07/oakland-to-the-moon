/**
 * D1: "Learned: weight is everything". A one-line note in the top-left corner the first time a learning
 * goal is experienced; it fades after 2 s and is too small to cover the action.
 */
import Phaser from 'phaser';
import { store } from '../../state/store';
import { GOAL_BY_ID, GoalId, learnedKey } from '../../data/learningGoals';
import { C, panel, pinToScreen, txt } from './ui';

export function learned(scene: Phaser.Scene, id: GoalId, delayMs = 0) {
  const key = learnedKey(id);
  if (store.seen[key]) return;
  store.markSeen(key);
  scene.time.delayedCall(delayMs, () => {
    if (!scene.sys.isActive()) return;
    const t = txt(scene, 8, 4, `Learned: ${GOAL_BY_ID[id].short}`, { color: C.green });
    const c = scene.add.container(4, 24).setDepth(790);
    c.add([panel(scene, 0, 0, Math.ceil(t.width) + 14, 18, 'dialog'), t]);
    pinToScreen(c);
    c.setAlpha(0);
    scene.tweens.add({ targets: c, alpha: 1, duration: 150, hold: 1700, yoyo: true, onComplete: () => c.destroy() });
  });
}
