/**
 * D2: who the explanations are written for. Beginner = plain words and everyday comparisons (formulas
 * behind "see the math"); Curious = words + numbers; Engineer = numbers + formulas. The game logic is
 * the same at every level: only the explanation text changes.
 */
import Phaser from 'phaser';
import { store } from '../../state/store';
import { findTerms } from '../../data/glossary';
import { C, Tooltip } from './ui';

export { byLevel, EXPLAIN_LABEL, EXPLAIN_WHAT, explainLevel } from '../../simulation/explainLevel';
export type { ExplainLevel } from '../../simulation/explainLevel';

/** Large text (accessibility): about 1.25x for body text that wraps or pages. */
export const bodySize = (base: number) => (store.settings.textSize === 'large' ? Math.round(base * 1.25) : base);

/**
 * Underline the glossary terms in a text object and make them hoverable / clickable for a one-sentence
 * definition. Uses the bitmap font's character boxes, so it works on wrapped lines too.
 */
export function underlineTerms(scene: Phaser.Scene, t: Phaser.GameObjects.BitmapText, into: Phaser.GameObjects.Container, color: number = C.blue) {
  const found = findTerms(t.text);
  if (!found.length) return;
  const chars = t.getTextBounds(false).characters;
  const g = scene.add.graphics();
  into.add(g);
  for (const f of found) {
    const cs = chars.filter((c) => c.idx >= f.start && c.idx < f.end);
    // one underline (and one hover zone) per visual line the term spans
    const lines = new Map<number, typeof cs>();
    for (const c of cs) lines.set(c.line, [...(lines.get(c.line) ?? []), c]);
    for (const seg of lines.values()) {
      const x0 = t.x + Math.min(...seg.map((c) => c.x)), x1 = t.x + Math.max(...seg.map((c) => c.r));
      const y = t.y + Math.max(...seg.map((c) => c.b)) + 1;
      g.fillStyle(color, 0.8).fillRect(Math.round(x0), Math.round(y), Math.max(1, Math.round(x1 - x0)), 1);
      const hit = scene.add.rectangle(x0, t.y + Math.min(...seg.map((c) => c.y)), x1 - x0, y - (t.y + Math.min(...seg.map((c) => c.y))) + 2, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const show = () => Tooltip.show(scene, `${f.term.term}: ${f.term.def}`, { x: x0, y: hit.y, width: x1 - x0, height: hit.height });
      hit.on('pointerover', show);
      hit.on('pointerup', () => { Tooltip.hide(); Tooltip.DELAY = 0; show(); Tooltip.DELAY = 400; });
      hit.on('pointerout', () => Tooltip.hide());
      into.add(hit);
    }
  }
}
