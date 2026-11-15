/**
 * D2: who the explanations are written for (pure, no Phaser). Beginner = plain words and everyday
 * comparisons; Curious = words + numbers; Engineer = numbers + formulas. Same game logic at every level.
 */
import { store } from '../state/store';
import { specOf } from './specModel';

export type ExplainLevel = 'beginner' | 'curious' | 'engineer';
export const EXPLAIN_LABEL: Record<ExplainLevel, string> = { beginner: 'BEGINNER', curious: 'CURIOUS', engineer: 'ENGINEER' };
export const EXPLAIN_WHAT: Record<ExplainLevel, string> = {
  beginner: 'Beginner: plain words, maths on request.',
  curious: 'Curious: words and numbers.',
  engineer: 'Engineer: numbers and formulas.',
};
/** The current level; "auto" follows difficulty (Easy = Beginner, Hard = Engineer). */
export function explainLevel(): ExplainLevel {
  const e = store.settings.explain;
  if (e && e !== 'auto') return e;
  return specOf(store.design).difficulty === 'hard' ? 'engineer' : 'beginner';
}
/** Pick the text for the current level. */
export const byLevel = <T>(beginner: T, curious: T, engineer: T): T => ({ beginner, curious, engineer })[explainLevel()];

