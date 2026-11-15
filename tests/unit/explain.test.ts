/** D2: explain levels follow difficulty by default; glossary terms are found in desk lines. */
import { describe, expect, it } from 'vitest';
import { store } from '../../src/state/store';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { byLevel, explainLevel } from '../../src/simulation/explainLevel';
import { findTerms, GLOSSARY_TERMS } from '../../src/data/glossary';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { buildFiveSheets } from '../../src/simulation/deskFive';

describe('explain levels and glossary', () => {
  it('Auto follows difficulty (Easy = Beginner, Hard = Engineer) and a choice overrides it', () => {
    const d = cloneDesign(REFERENCE_DESIGN);
    store.design = d; store.settings.explain = 'auto';
    d.spec = { ...d.spec!, difficulty: 'easy' }; expect(explainLevel()).toBe('beginner');
    d.spec = { ...d.spec!, difficulty: 'hard' }; expect(explainLevel()).toBe('engineer');
    store.settings.explain = 'curious'; expect(explainLevel()).toBe('curious');
    expect(byLevel('a', 'b', 'c')).toBe('b');
    store.settings.explain = 'auto';
  });
  it('all five sheets have a Beginner, Curious and Engineer explanation', () => {
    for (const sh of buildFiveSheets(REFERENCE_DESIGN, analyzeDesign(REFERENCE_DESIGN))) {
      expect(sh.think.length).toBeGreaterThan(10); // Beginner
      expect(sh.formula.length).toBeGreaterThan(10); // Curious
      expect(sh.formulaEngineer!.length).toBeGreaterThan(10); // Engineer
    }
  });
  it('finds glossary terms in a line without overlaps; every term has a one-sentence definition', () => {
    const f = findTerms('speed gained (Δv) = exhaust speed x ln(...); thrust-to-weight after dropping stage 1 in low lunar orbit; stage 2 alone is not a term');
    expect([...new Set(f.map((x) => x.term.term))]).toEqual(['Speed gained (Δv)', 'Exhaust speed', 'Thrust-to-weight', 'Staging', 'LLO (low lunar orbit)']);
    for (const t of GLOSSARY_TERMS) expect(t.def.split('. ').length).toBe(1);
    expect(store.settings.textSize).toBe('normal');
    expect(store.settings.statusIcons).toBe(true);
  });
});
